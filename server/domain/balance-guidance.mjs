export const balanceGuidance=Object.freeze({
  "day.ratios": "Daily ratios divide unrounded recorded nutrient totals with matching source units. Display formatting can round these raw values.",
  "day.unavailable": "A ratio is withheld when an input is unknown or partial, its denominator is zero, or division has no finite result.",
  "day.zeros": "Completion-confirmed zeros with no measured contributions are labeled separately. Missing food measurements remain unknown after completion.",
  "day.references": "Ratio bands are Cronometer's published reference ranges, not personalized targets or clinical advice.",
  "day.pral": "PRAL estimates dietary acid load from recorded food nutrients. It does not measure blood pH or kidney function.",
  "day.pral-inputs": "PRAL is withheld when any required input is unknown or partial. Signed values and exact decimal cancellation are retained.",
  "period.dates": "Each balance uses only dates with complete measurements for all its required inputs. Unknown, partial and non-finite dates are excluded together, in that order.",
  "period.ratios": "Ratios divide pooled unrounded input sums, equivalent to the ratio of means over the same used dates. They are not means of daily ratios. Complete zero-denominator dates remain in the pool.",
  "period.inputs": "Input amounts are daily means over the same used dates for that balance. Coverage counts sum the food contributions on those dates. Completion-confirmed zero dates are counted separately.",
  "period.pral": "PRAL is the mean complete daily estimate, with signed values and decimal cancellation retained. Different balances may use different sets of dates.",
  "period.references": "Ratio bands are Cronometer's published reference ranges, not personalized targets or clinical advice. PRAL does not measure blood pH or kidney function.",
  "calcium.estimate": "This published-equation estimate does not measure individual calcium absorption and does not change dietary calcium targets.",
  "calcium.study": "The cited study used food or test-meal quantities. It does not establish that the equation is valid for all daily totals or individual diets.",
  "calcium.missing": "Missing or partial required measurements withhold the estimate. Unknown oxalate or phytate is not assumed to be zero.",
  "calcium.range": "Fractions outside zero to one are retained as raw results but are not clamped or presented as absorbed calcium.",
  "calcium.period": "Period values are means of accepted daily estimates and fractions, not the equation evaluated on pooled inputs. Input means use exactly the same accepted dates."
});
export function captureBalanceGuidance(scope){if(!['day','period','calcium-day','calcium-period'].includes(scope))throw Error('Choose a balance guidance scope.');return Object.entries(balanceGuidance).filter(([code])=>scope.startsWith('calcium-')?code.startsWith('calcium.')&&(scope==='calcium-period'||code!=='calcium.period'):code.startsWith(scope+'.')).map(([code,text])=>({code,text}));}
export const isBalanceGuidance=note=>Boolean(note&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&Object.hasOwn(note,'code')&&Object.hasOwn(note,'text')&&typeof note.code==='string'&&note.code.length&&typeof note.text==='string'&&note.text.length);
