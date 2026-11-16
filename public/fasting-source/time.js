import {Temporal} from './vendor/temporal.js';
export function localTime(value,timeZone){return value?Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({smallestUnit:'minute'}):'';}
