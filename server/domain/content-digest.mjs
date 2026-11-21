import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';
import {contentDigestInput} from './content-digest-input.mjs';
export const sha256Hex=text=>bytesToHex(sha256(utf8ToBytes(text)));
export const contentDigest=value=>sha256Hex(contentDigestInput(value));
