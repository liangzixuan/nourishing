/** Captured explanatory identities. Pairing algorithms remain owned by their existing domains. */
export const PAIRING_CAPTURE_VERSION=2;
export const pairingGuidance=Object.freeze({
  "pressure.rule.native": "Native Health Connect pressure components pair only with the same source measurement and revision. Incomplete native pairs stay unmatched.",
  "pressure.rule.date": "Readings are matched only within the same diary date. Each recorded reading is used once.",
  "pressure.rule.time": "Other timed systolic readings use the nearest unused timed diastolic within 10 minutes. Equal distances use earlier diary order.",
  "pressure.rule.order": "Remaining pressure readings use diary order only when at least one reading has no time. Two timed readings more than 10 minutes apart remain unmatched.",
  "pressure.rule.pulseTime": "Pulse uses the systolic time, or the diastolic time if systolic has no time. Timed pulse matching uses the same 10-minute window and diary-order tie rule.",
  "pressure.rule.pulseOrder": "Remaining pulse readings use diary order only when the pressure pair or pulse has no time. A pulse reading cannot form a pressure pair alone.",
  "pressure.rule.visible": "All sessions and unmatched readings remain visible. Values are not averaged or classified medically.",
  "glucose.rule.sources": "Only explicitly selected source types participate. Ketones means blood beta-hydroxybutyrate; both mmol/L and mg/dL are supported.",
  "glucose.rule.date": "Pair only within the same diary date. Each eligible reading is used once.",
  "glucose.rule.time": "Timed glucose readings, in saved diary order, use the nearest unused timed ketone within 10 minutes. Equal distances use earlier diary order.",
  "glucose.rule.order": "Remaining readings pair in diary order only when at least one reading has no time. Two timed readings outside the window remain unmatched.",
  "glucose.rule.invalid": "Invalid selected readings remain listed as exclusions and do not participate in pairing. Missing time is untimed; malformed time is excluded.",
  "glucose.rule.ratio": "GKI divides unrounded glucose mmol/L by unrounded blood beta-hydroxybutyrate mmol/L. Zero ketones leave the ratio unavailable.",
  "glucose.rule.series": "Source series retain all eligible readings, including unmatched readings. Pairing is deterministic and greedy; it is not a global minimum-distance assignment.",
  "glucose.rule.policy": "These tie, reuse and mixed-time rules are a local policy. Values are not averaged or classified medically.",
  "pressure.reason.native": "No unique matching native component with the same source measurement and revision.",
  "pressure.reason.unmatched": "No match under these pairing rules."
});
export const pairingRuleCodes=Object.freeze({pressure:Object.freeze(["pressure.rule.native", "pressure.rule.date", "pressure.rule.time", "pressure.rule.order", "pressure.rule.pulseTime", "pressure.rule.pulseOrder", "pressure.rule.visible"]),glucose:Object.freeze(["glucose.rule.sources", "glucose.rule.date", "glucose.rule.time", "glucose.rule.order", "glucose.rule.invalid", "glucose.rule.ratio", "glucose.rule.series", "glucose.rule.policy"])});
export function capturePairingGuidance(code){if(!Object.hasOwn(pairingGuidance,code))throw new TypeError('Unknown pairing guidance identity.');return {code,text:pairingGuidance[code]};}
export function isPairingGuidance(note,scope){
 return note!==null&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&Object.hasOwn(note,'code')&&Object.hasOwn(note,'text')&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0&&(!Object.hasOwn(pairingGuidance,note.code)||note.code.startsWith(scope+'.'));
}
