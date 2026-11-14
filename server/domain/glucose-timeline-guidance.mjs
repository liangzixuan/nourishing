const messages=Object.freeze({
  "duplicate-time": "Multiple readings share this diary timestamp; no order is inferred.",
  "no-samples": "No eligible samples.",
  "no-timed-samples": "No timed eligible samples.",
  "latest-duplicate": "The latest timestamp has multiple readings.",
  "no-continuous-coverage": "Continuous sampling and coverage are not established. The band fraction counts samples, not time.",
  "clock-change": "A clock change makes diary-calendar placement ambiguous. Absolute endpoints are retained.",
  "copied-comparison": "Copied biometric excluded from comparison points.",
  "untimed": "No recorded diary time; this reading is unplaced.",
  "unknown-measurement": "The selected measurement is unknown.",
  "partial-sum": "This value is a partial measured sum.",
  "unresolved-carbohydrate": "Tracked carbohydrate cannot be resolved from the recorded measurements under the selected definition.",
  "copied-entry": "Copied food or exercise is a logged diary entry and remains included.",
  "missing-definition": "Net carbohydrate definition is not set.",
  "comparison-clock": "Comparison points use the same recorded diary-calendar positions as glucose. No interpolation or causal relationship is inferred.",
  "comparison-food": "Nutrients and tracked carbohydrate use captured food-entry measurements, including their missing or partial coverage. Logged water biometrics are not food nutrients.",
  "comparison-identity": "Exact biometric type and unit identify comparison readings; no biometric unit conversion or name matching is inferred.",
  "comparison-copies": "Copied biometrics are visible but excluded. Copied foods and exercise are actual diary entries and remain included.",
  "comparison-gaps": "Untimed and unknown measurements remain visible without plotted points. Duplicate timestamps retain all measurements at the same position.",
  "selected-sources": "Only the explicitly selected glucose and insulin names participate; raw measurements and source metadata are retained.",
  "diary-clock": "Positions use recorded diary dates and HH:MM. Diary readings do not establish an absolute time zone or resolve repeated daylight-saving times.",
  "sample-statistics": "Statistics describe valid noncopied samples, including untimed samples. Population standard deviation and coefficient of variation are sample summaries, not continuous sensor estimates.",
  "sample-copies": "Copied readings remain visible but are excluded from statistics and plotted points. Duplicate timestamps retain all samples without inferring an order.",
  "display-band": "The configured band is a display preference. Its inclusive fraction counts samples; time in range remains unknown without sampling coverage.",
  "event-clock": "Food and exercise markers retain their recorded times. Fasting endpoints use the captured time zone and clock; interval elapsed time uses absolute instants.",
  "copied-reading": "Copied reading excluded from statistics and plot."
});
/** Producer-owned explanatory facts; source text is retained with its identity. */
export function timelineGuidance(code){if(!Object.hasOwn(messages,code))throw Error('Unknown timeline guidance code: '+code);return {code,text:messages[code]};}
