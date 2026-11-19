import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {load} from 'cheerio';

export const MAX_PHOTO_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;
export const MAX_PHOTO_EDGE = 1600;
export const JPEG_QUALITY = 82;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const mimeFormats = {'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp'};

function invalid(message) { throw Object.assign(new Error(message), {status: 400}); }

function decodeDataUrl(dataUrl, maxBytes) {
  // Bound encoded input before regex work, decoding or a second byte buffer.
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
  if (typeof dataUrl !== 'string') invalid('Choose a JPEG, PNG or WebP image data URL.');
  if (dataUrl.length > maxEncodedLength + 'data:image/jpeg;base64,'.length) invalid(`Image data exceeds the ${maxBytes / (1024 * 1024)} MiB byte limit.`);
  const comma = dataUrl.indexOf(',');
  const header = comma < 0 ? '' : dataUrl.slice(0, comma);
  const match = /^data:(image\/(?:jpeg|png|webp));base64$/iu.exec(header);
  if (!match) invalid('Choose a base64 JPEG, PNG or WebP image data URL.');
  const encoded = dataUrl.slice(comma + 1);
  if (!encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) invalid('Image base64 data is invalid. Choose the image file again.');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = encoded.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) invalid(`Image data exceeds the ${maxBytes / (1024 * 1024)} MiB byte limit.`);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== decodedLength || bytes.toString('base64') !== encoded) invalid('Image base64 data is not a complete canonical encoding. Choose the image file again.');
  return {mime: match[1].toLowerCase(), bytes};
}

function formatOf(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function rejectAnimatedPng(bytes) {
  // Sharp's Metadata.pages documents animated WebP, but not APNG. The PNG
  // animation-control chunk explicitly declares APNG without decoding pixels.
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) invalid('PNG data is incomplete. Choose a complete image file.');
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) invalid('PNG data is incomplete. Choose a complete image file.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') invalid('Animated or multipage images are not supported. Choose one still image.');
    offset += length + 12;
    if (type === 'IEND') break;
  }
}

function xmlNamespace(node, prefix) {
  const key=prefix?`xmlns:${prefix}`:'xmlns';
  for(let current=node;current;current=current.parent)if(Object.hasOwn(current.attribs||{},key))return current.attribs[key];
  return null;
}
function ultraHdrXmp(xml) {
  // Prefix spelling is not identity: resolve the RDF and gain-map namespaces.
  const $=load(xml,{xml:true}),gainMap='http://ns.adobe.com/hdr-gain-map/1.0/';
  for(const node of $('*').toArray()){
    const parts=node.name.split(':'),local=parts.at(-1),prefix=parts.length>1?parts[0]:'';
    if(local==='Version'&&xmlNamespace(node,prefix)===gainMap&&$(node).text().trim()==='1.0')return true;
    if(local!=='Description'||xmlNamespace(node,prefix)!=='http://www.w3.org/1999/02/22-rdf-syntax-ns#')continue;
    for(const [key,value]of Object.entries(node.attribs||{})){
      const attribute=key.split(':');
      if(attribute.length===2&&attribute[1]==='Version'&&value==='1.0'&&xmlNamespace(node,attribute[0])===gainMap)return true;
    }
  }
  return false;
}
function rejectMultiPictureJpeg(bytes,{allowUltraHdr=false}={}) {
  // Ultra HDR uses MPF for an auxiliary gain map of the same still photo.
  // Its XMP signal permits SDR-primary decoding; other MPO inputs stay rejected.
  // The gain map is neither decoded nor retained. Invalid auxiliary HDR metadata
  // does not affect the SDR fallback defined by the Ultra HDR format.
  let multipicture=false,ultraHdr=false;
  const xmpHeader=Buffer.from('http://ns.adobe.com/xap/1.0/\0');
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) invalid('JPEG header data is invalid. Choose a complete image file.');
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) invalid('JPEG data is incomplete. Choose a complete image file.');
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (bytes.length - offset < 2) invalid('JPEG data is incomplete. Choose a complete image file.');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || length > bytes.length - offset) invalid('JPEG data is incomplete. Choose a complete image file.');
    if (marker === 0xe2 && length >= 6 && bytes.toString('ascii', offset + 2, offset + 6) === 'MPF\0') multipicture=true;
    if(allowUltraHdr&&marker===0xe1&&length>=2+xmpHeader.length&&bytes.subarray(offset+2,offset+2+xmpHeader.length).equals(xmpHeader)){
      ultraHdr ||= ultraHdrXmp(bytes.toString('utf8',offset+2+xmpHeader.length,offset+length));
    }
    offset += length;
  }
  if(multipicture&&!(allowUltraHdr&&ultraHdr))invalid('Multipicture JPEG files are not supported. Choose one still image.');
}

function inspectMetadata(metadata, expectedFormat, {stored = false} = {}) {
  if (metadata.format !== expectedFormat) invalid('The image contents do not match its declared MIME type. Choose the original image file.');
  if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width <= 0 || metadata.height <= 0 || metadata.width > MAX_PHOTO_PIXELS / metadata.height) invalid('Image dimensions exceed 40 million pixels. Resize the image before uploading.');
  if ((metadata.pages ?? 1) !== 1 || metadata.loop !== undefined || (metadata.delay?.length ?? 0) > 0) invalid('Animated or multipage images are not supported. Choose one still image.');
  if (stored) {
    if (metadata.width > MAX_PHOTO_EDGE || metadata.height > MAX_PHOTO_EDGE) invalid('Stored photo dimensions exceed 1600 pixels. Import an original exported backup.');
    if (metadata.orientation !== undefined || metadata.exif !== undefined || metadata.icc !== undefined || metadata.iptc !== undefined || metadata.xmp !== undefined || metadata.tifftagPhotoshop !== undefined) invalid('Stored photos must have normalized orientation and stripped metadata. Import an original exported backup.');
  }
}

function imageInput(bytes) {
  return sharp(bytes, {limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'warning', sequentialRead: true});
}

function result(bytes, width, height) {
  const base64 = bytes.toString('base64');
  return {id: createHash('sha256').update(bytes).digest('hex'), mime: 'image/jpeg', base64,
    dataUrl: `data:image/jpeg;base64,${base64}`, bytes, width, height};
}

function decodeFailure(error, {stored = false} = {}) {
  if (error?.status === 400) throw error;
  if (stored) invalid('The stored JPEG could not be decoded. Import a complete original exported backup.');
  invalid('The image could not be decoded. Choose a complete JPEG, PNG or WebP below 8 MiB and 40 million pixels.');
}

export async function normalizePhoto(dataUrl) {
  const {mime, bytes} = decodeDataUrl(dataUrl, MAX_PHOTO_INPUT_BYTES);
  const format = formatOf(bytes);
  if (!format || mimeFormats[mime] !== format) invalid('The image contents do not match its declared MIME type. Choose the original JPEG, PNG or WebP file.');
  if (format === 'png') rejectAnimatedPng(bytes);
  if (format === 'jpeg') rejectMultiPictureJpeg(bytes,{allowUltraHdr:true});
  try {
    const pipeline = imageInput(bytes);
    inspectMetadata(await pipeline.metadata(), format);
    // Sharp strips metadata by default. Do not call keepMetadata/withMetadata.
    const {data, info} = await pipeline.autoOrient()
      .resize({width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE, fit: 'inside', withoutEnlargement: true})
      .flatten({background: '#ffffff'}).toColourspace('srgb')
      .jpeg({quality: JPEG_QUALITY}).toBuffer({resolveWithObject: true});
    if (data.length > MAX_STORED_PHOTO_BYTES) invalid('The normalized photo exceeds 3 MiB. Use a smaller image.');
    return result(data, info.width, info.height);
  } catch (error) { decodeFailure(error); }
}

export async function prepareVisionImage(photo, maxEdge = 1024) {
  if (!photo?.bytes || (photo.width <= maxEdge && photo.height <= maxEdge)) return photo.base64;
  const bytes = await sharp(photo.bytes)
    .resize({width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true})
    .jpeg({quality: 78})
    .toBuffer();
  return bytes.toString('base64');
}

export async function validateStoredPhoto(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !/^[a-f0-9]{64}$/u.test(value.id)) invalid('Stored photo ID must be a SHA-256 digest from an exported backup.');
  const {mime, bytes} = decodeDataUrl(value.dataUrl, MAX_STORED_PHOTO_BYTES);
  if (mime !== 'image/jpeg' || formatOf(bytes) !== 'jpeg') invalid('Stored photos must be normalized JPEG images from an exported backup.');
  rejectMultiPictureJpeg(bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== value.id) invalid('Stored photo content does not match its SHA-256 ID. Import an intact backup.');
  try {
    const pipeline = imageInput(bytes);
    const metadata = await pipeline.metadata();
    inspectMetadata(metadata, 'jpeg', {stored: true});
    // Decode all pixels to reject damaged content. No image encoder runs, so
    // exported JPEG bytes and their immutable content ID remain unchanged.
    await pipeline.raw().toBuffer();
    return result(bytes, metadata.width, metadata.height);
  } catch (error) { decodeFailure(error, {stored: true}); }
}
