# Diary summary adapter

The summary uses `cronometer-local/public/mobile-diary.js` with import paths adapted to the cloud asset tree. The carousel, rings, macro rows, highlighted nutrients, score rows and optional Pause Life panel retain the source markup. The local `mobile-diary.css` supplies the layout. `diary-summary.css` scopes host resets and supplies the symbol font from this adapter's own asset directory.

`diarySummaryMarkup(diary)` renders the summary, Fasting and Water. `mountDiarySummary({root,diary,onAction})` owns carousel navigation, macro view switching, Chart instances and the active-fast timer. Call its `dispose()` before replacing the root or leaving Diary. It does not save diary records.

`onAction` receives `{action,id,kind,amount}`. `openDiarySummaryAction({action,id,diary,date,show,close,header,content,onChange,onTargets,onReport,onFasting})` returns a handled boolean. The shell owns `show`, `close`, `header` and the sheet `content` element. `onChange` reloads Diary without closing the sheet; score selection keeps its picker open after a save. Display settings close their sheet on Save.

| Action | Owner |
| --- | --- |
| `mobile-diary-energy` | Energy Summary dialog |
| `configure-diary-display` | Visibility, macro mode and highlighted nutrient settings |
| `choose-scores` | Ordered score slots, replacement, removal and visibility |
| `score-details` | Source Function/Data Quality presentation from the captured score |
| `edit-day-targets` | `onTargets(date)` |
| `all-nutrients` | `onReport(date)` |
| `open-fasting` | `onFasting()` |
| `nutrient-contributors` | Shell's existing nutrient detail dialog |
| `water`, `water-custom` | Shell's water command/editor |

The account-scoped diary projection adds `presentation.settings`, `presentation.scoreDisplay`, `presentation.scores`, `presentation.nutrientOptions` and captured active-fast timing. Energy, macro and nutrient values come directly from `calculateSummary`. `scoreDisplay.change` uses the existing stale-selection validator. `diaryDisplay.save` validates the existing source display policy and only exposes three panel visibility settings. Both commands use the existing account transaction and revision checks.

The score dialog uses the already captured score and confidence instead of adding a second calculation endpoint. Its Daily Report button opens the cloud report. Deep source formula help is not included in this adapter. The Energy Summary dialog uses the captured energy values and an Edit Targets action. This dialog and the display settings are cloud sheet adapters; they are not byte-for-byte copies of the local page composition.

Validation: `node --test tests/diary-summary.test.mjs`. Checks cover empty and recorded canonical values, water quantities, captured fasting time, selected scores, kJ settings, stale/invalid commands, real Chrome rings and carousel, callbacks, chart disposal, settings persistence and report navigation at 412 × 915. The screenshot is `.local/ui-parity/diary-summary-restored.png`. Integrated production and phone validation belong to the shell rollout.
