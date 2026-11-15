import {createMessageFormatter} from './message-formatter.js';
import {barcodeMessages} from './messages.js';
export const formatMessage=createMessageFormatter(barcodeMessages);
