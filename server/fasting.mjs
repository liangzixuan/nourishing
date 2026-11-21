import {Temporal} from '@js-temporal/polyfill';
import {digest} from './data-codec.mjs';
import {act} from './domain/workspace.mjs';
import {captureCalendar} from './domain/calendar.mjs';
import {parseDiscoverSettings} from './domain/discover-settings.mjs';
import {projectDashboardSettings} from './domain/dashboard-settings.mjs';
import {applyFastAction} from './domain/fasting-records.mjs';
import {createFastingHistory} from './domain/fasting-history.mjs';
import {captureFastingTiming} from './domain/fasting-view.mjs';
import {scheduledWallInstant} from './domain/fasting-time.mjs';
import {fastingScheduleView, saveFastingSchedule, deleteFastingSchedule, startScheduledFastNow, tickFastingSchedules} from './domain/fasting-schedules.mjs';

const fail = (message, code = 400) => {throw Object.assign(Error(message), {code, status: code, publicMessage: message});};
const scheduleFields = ['id', 'revision', 'label', 'startDate', 'time', 'recurrence', 'interval', 'custom', 'days', 'untilDate', 'goalHours', 'enabled'];
export const fastingCommandFields = Object.freeze({
  'fast.start': ['start', 'goalHours', 'note', 'label'], 'fast.record': ['start', 'end', 'goalHours', 'note', 'label'],
  'fast.end': ['id', 'end'], 'fast.update': ['id', 'start', 'end', 'goalHours', 'note', 'label', 'repeat', 'durationHours'], 'fast.delete': ['id'],
  'fasting.deleteMany': ['ids'], 'fasting.schedule.save': scheduleFields,
  'fasting.schedule.delete': ['id', 'revision'], 'fasting.schedule.startNow': ['id', 'revision', 'start'],
  'fasting.settings': ['enabled', 'showDashboard', 'showDiary', 'askToStopFast', 'timerDirection']
});
function captured(context) {
  const now = context?.now ?? (context?.asOf ? new Date(context.asOf) : null);
  if (!(now instanceof Date) || !Number.isFinite(+now) || !context?.timeZone) fail('The account clock is unavailable.', 503);
  return {...captureCalendar(now, context.timeZone), now};
}
function local(instant, zone) {return instant === null ? null : Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({smallestUnit: 'minute'});}
function recordedInstant(value, zone) {
  if (value === null) return null;
  if (typeof value !== 'string') fail('Choose a valid fast time.');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    let result;try {result = scheduledWallInstant(value, zone);} catch {fail('Choose a valid fast time.');}
    if (!result) fail('This time is skipped by daylight saving. Choose another time.');
    return result.toString();
  }
  return value; // Original record parser owns explicit-offset timestamp validation.
}
export function fastingView(state, context, {offset = 0, limit = 25, revision} = {}) {
  const {now, timeZone, asOf} = captured(context), preferences = parseDiscoverSettings(state.settings.discover), dashboard = projectDashboardSettings(state.settings.dashboard);
  const history = createFastingHistory({store: {read: () => state}, clock: () => now}).list({offset, limit, ...(revision ? {revision} : {})});
  const schedules = fastingScheduleView(state, now, timeZone);
  return {revision: digest(state), now: asOf, timeZone, schedulerReady: context.schedulerReady === true, localNow: local(asOf, timeZone), nextLocal: local(new Date(+now + 120000).toISOString(), timeZone), pastStartLocal: local(new Date(+now - 16 * 3600000).toISOString(), timeZone),
    settings: {enabled: preferences.fastingEnabled, showDiary: preferences.fastingDiary, showDashboard: dashboard.widgets.fasting, askToStopFast: state.settings.askToStopFast === true, timerDirection: preferences.timerDirection},
    timing: captureFastingTiming(state, asOf), active: schedules.activeFast ? {...schedules.activeFast, startLocal: local(schedules.activeFast.start, timeZone)} : null,
    schedules: schedules.schedules, history: {...history, rows: history.rows.map(row => ({...row, startLocal: local(row.start, timeZone), endLocal: local(row.end, timeZone)}))}};
}
export function applyFastingCommand(state, {type, payload}, context) {
  if (!Object.hasOwn(fastingCommandFields, type)) return {handled: false};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !fastingCommandFields[type].includes(key))) fail('Invalid fasting fields.');
  const {now, timeZone} = captured(context), candidate = structuredClone(state);let result;
  try {
    if (type === 'fasting.settings') {
      if (!Object.keys(payload).length) fail('Choose a fasting setting.');
      for (const [key, value] of Object.entries(payload)) if (key === 'timerDirection' ? !['up', 'down'].includes(value) : typeof value !== 'boolean') fail('Choose a valid fasting setting.');
      const discover = parseDiscoverSettings(candidate.settings.discover), dashboard = projectDashboardSettings(candidate.settings.dashboard);
      if (Object.hasOwn(payload, 'enabled')) discover.fastingEnabled = payload.enabled;
      if (Object.hasOwn(payload, 'showDiary')) discover.fastingDiary = payload.showDiary;
      if (Object.hasOwn(payload, 'timerDirection')) discover.timerDirection = payload.timerDirection;
      if (Object.hasOwn(payload, 'showDashboard')) dashboard.widgets.fasting = payload.showDashboard;
      act(candidate, 'settings.save', {discover, dashboard, ...(Object.hasOwn(payload, 'askToStopFast') ? {askToStopFast: payload.askToStopFast} : {})});
    } else if (type === 'fasting.schedule.save') {
      const existing = candidate.fastingPlan?.schedules.find(row => row.id === payload.id);
      const view = saveFastingSchedule(candidate, {...payload, timeZone: existing?.timeZone ?? timeZone, confirmed: true}, now);
      result = {fastingSchedule: view.schedules.find(row => row.id === payload.id)};
    }
    else if (type === 'fasting.schedule.delete') result = deleteFastingSchedule(candidate, payload);
    else if (type === 'fasting.schedule.startNow') result = startScheduledFastNow(candidate, payload, now);
    else if (type === 'fasting.deleteMany') {
      if (!Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 100 || new Set(payload.ids).size !== payload.ids.length) fail('Select 1 to 100 fasts.');
      for (const id of payload.ids) applyFastAction(candidate, 'fast.delete', {id}, now);
      result = {deletedIds: payload.ids};
    } else {
      const input = {...payload};
      for (const key of ['start', 'end']) if (Object.hasOwn(input, key)) input[key] = recordedInstant(input[key], timeZone);
      if (Object.hasOwn(input, 'durationHours')) {
        const original = candidate.fasts.find(row => row.id === input.id), hours = input.durationHours;delete input.durationHours;
        if (!original || original.end === null || !Number.isFinite(hours) || hours < 0) fail('Choose a valid completed-fast duration.');
        try {input.end = Temporal.Instant.from(input.start ?? original.start).add({nanoseconds: Math.round(hours * 3600000000000)}).toString();} catch {fail('Choose a valid completed-fast duration.');}
      }
      result = applyFastAction(candidate, type, input, now);
    }
  } catch (error) {if ([400, 404, 409].includes(error.status)) Object.assign(error, {code: error.status, publicMessage: error.message}); throw error;}
  Object.assign(state, candidate);return {handled: true, result: result?.id ? {kind: 'fast', id: result.id} : result};
}
/** Called by the account-scoped scheduler inside the workspace transaction. */
export function tickCloudFasting(state, context) {const {now} = captured(context);return tickFastingSchedules(state, now);}
