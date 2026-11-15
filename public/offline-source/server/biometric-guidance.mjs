// Source descriptions are owned here; presentation uses stable codes.
export const biometricGuidance=Object.freeze({
  "unknown-units": "Enter the unit shown on your device or report. Source input units are not established.",
  "body-fat": "Observed source units: %. Evidence: manual biometric help text and profile display. The complete manual unit menu is unverified.",
  "body-temp-variation": "Observed source units: °C. Evidence: imported Oura diary display. The complete manual unit menu is unverified.",
  "height": "Observed source units: cm. Evidence: profile input; manual biometric dropdown not shown. The complete manual unit menu is unverified. Shown as two fields alternative to cm. Does not prove independent decimal-ft or decimal-in biometric input.",
  "recovery": "Observed source units: %. Evidence: imported Oura diary display. The complete manual unit menu is unverified.",
  "stool": "The public editor offers Bristol types 1–7. Nourishing records the selected category with the local unit Bristol type; the original server unit identifier is unverified.",
  "weight": "Enter your recorded weight and unit. For stones, you can enter additional pounds separately; the review shows the combined amount in stones.",
  "blood-pressure": "Observed source units: mmHg. Evidence: manual paired systolic/diastolic input and chart. The complete manual unit menu is unverified.",
  "heart-rate": "Observed source units: bpm. Evidence: diary and chart display. The complete manual unit menu is unverified.",
  "heart-rate-variability-hrv": "Observed source units: ms. Evidence: imported Oura diary display. The complete manual unit menu is unverified.",
  "respiration-rate": "Observed source units: brpm. Evidence: imported Oura diary display. The complete manual unit menu is unverified.",
  "resting-heart-rate": "Observed source units: bpm. Evidence: statistic within Heart Rate detail display; standalone manual input not shown. The complete manual unit menu is unverified.",
  "blood-glucose": "Observed source units: mg/dL, mmol/L. Evidence: mg/dL explicitly documented for logging; mmol/L visible in GKI chart legend. The complete manual unit menu is unverified. Help prose abbreviates normalized unit as mmol; chart provides exact mmol/L spelling. Complete manual dropdown not shown.",
  "ketones-blood": "Observed source units: mg/dL, mmol/L. Evidence: mg/dL explicitly documented for logging; mmol/L visible in GKI chart legend identified as blood ketones by article. The complete manual unit menu is unverified. Do not transfer these units to breath or urine ketones. Complete manual dropdown not shown.",
  "mood": "Enter the unit shown on your device or report. Source input units are not established. Existing local numeric unit: 1–10. This is a local choice, not verified source input parity.",
  "sleep": "The public web editor combines hours and minutes into decimal hours. The local record unit is h. Other source unit choices and authenticated behavior remain unverified.",
  "sleep-score": "Observed source units: %. Evidence: imported Oura diary display. The complete manual unit menu is unverified. Existing local numeric unit: score. This is a local choice, not verified source input parity.",
  "retained": "Exact type and unit retained from your workspace. No conversion is applied.",
  "single-pressure": "Existing local single-reading metric. Use Blood Pressure for paired entry.",
  "configured": "Exact configured metric identity. Logging does not change your analysis mapping.",
  "recorded-unit": "Values are recorded in the selected unit. No conversion or clinical interpretation is applied.",
  "reuse-definition": "This exact custom definition already exists and will be reused."
});
export const validBiometricGuidance=(code,note)=>typeof code==='string'&&Object.hasOwn(biometricGuidance,code)&&biometricGuidance[code]===note;
