import {createHash} from 'node:crypto';
import {contentDigestInput} from './content-digest-input.mjs';
export const contentDigest = value => createHash('sha256').update(contentDigestInput(value)).digest('hex');
