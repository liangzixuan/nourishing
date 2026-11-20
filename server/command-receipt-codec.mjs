import {gzipSync,gunzipSync} from 'node:zlib';

const format='nourishing-command-receipt-gzip-v1';

// Canonical command replies can repeat photo evidence across many diary rows.
// Compress only at the persistent boundary; HTTP replies keep their full shape.
export function encodeCommandReceipt(result){
 return JSON.stringify({format,data:gzipSync(Buffer.from(JSON.stringify(result))).toString('base64')});
}

export function decodeCommandReceipt(value){
 const stored=JSON.parse(value);
 // Receipts written before compression remain replayable after deployment.
 return stored?.format===format?JSON.parse(gunzipSync(Buffer.from(stored.data,'base64')).toString('utf8')):stored;
}
