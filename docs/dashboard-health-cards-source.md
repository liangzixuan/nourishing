# Dashboard glucose and cycle cards

The cloud domain already captures these cards in `server/domain/dashboard.mjs`. The missing pieces were the cloud dashboard renderer and its widget controls. `server/dashboard-health-cards.mjs` selects presentation fields from that capture; it does not read another clock or calculate a new average, latest reading or cycle phase.

Source references in the approved PC project:

- `../cronometer-local/server/dashboard.mjs`: selects the glucose and cycle captures using the dashboard range and account calendar.
- `../cronometer-local/server/glucose-timeline.mjs`: exact configured glucose source, unit conversion, sample statistics, copied-reading exclusion and ambiguous latest timestamp rules.
- `../cronometer-local/server/cycle-view.mjs`: separate source observations, independent dates for each metric, explicit unknown latest values, and past-date-only phases.
- `../cronometer-local/public/dashboard.js`: compact glucose display with a timeline action, and per-source cycle display.
- `../cronometer-local/public/glucose-timeline.js` and `public/cycle.js`: display units, source attribution, observation dates and missing-value distinctions.

The PC mobile Discover renderer does not contain these cards. This implementation adapts the source desktop cards to the current compact cloud dashboard; it does not claim a screenshot-exact Cronometer mobile reproduction.

The glucose card shows latest and average readings and discrete timed samples. Copied readings remain in the detail list but do not enter the plot or statistics. Untimed readings retain their values and missing-time label. Shared latest timestamps do not produce an invented latest value. Detail lists use 50-row pages and retain every captured reading. Dates open the corresponding diary when that callback is supplied.

The cycle card shows each source separately. Every value retains its source date. A supplied zero temperature difference stays zero; an explicitly missing value stays “Not supplied.” Older known values do not replace a newer unknown observation. The display never predicts a current or future phase.

The detail sheets are read-only and reuse the dashboard response. There is no supported cloud glucose timeline destination yet, so no timeline link is shown. Source selection, cycle import and the full glucose comparison/timeline controls are outside this change. The shared sheet owner controls close, Back and outside-tap behavior.

Verification: `node --test tests/dashboard-health-cards.test.mjs tests/dashboard-health-cards-browser.test.mjs`. The Chrome test opens cards at a mobile viewport, pages readings, follows a dated diary link and checks that the UI makes no API writes.
