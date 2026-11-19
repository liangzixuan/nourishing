import {randomUUID} from 'node:crypto';

const SAFE_TAG_KEYS = new Set(['service', 'method', 'path', 'status']);
const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

export function parseSentryDsn(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.username || url.password) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  const prefix = segments.length ? '/' + segments.join('/') : '';
  return {
    dsn: url.href,
    publicKey: url.username,
    envelopeUrl: `${url.origin}${prefix}/api/${projectId}/envelope/`,
  };
}

function parseStackFrames(stack) {
  if (typeof stack !== 'string') return [];
  const frames = [];
  for (const line of stack.split('\n')) {
    const match = FRAME_RE.exec(line);
    if (!match) continue;
    const [, fn, filename, lineno, colno] = match;
    frames.push({
      function: fn || '<anonymous>',
      filename: filename.split('?')[0],
      lineno: Number(lineno),
      colno: Number(colno),
    });
  }
  return frames.reverse();
}

function sanitizeTags(tags = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!SAFE_TAG_KEYS.has(key) || value === undefined || value === null) continue;
    clean[key] = String(value).slice(0, 200);
  }
  return clean;
}

export function buildSentryEnvelope(error, tags = {}, {dsn, environment, release} = {}) {
  const eventId = randomUUID().replaceAll('-', '');
  const sentAt = new Date().toISOString();
  const type = typeof error?.name === 'string' && error.name ? error.name : 'Error';
  const value = typeof error?.message === 'string' && error.message ? error.message.slice(0, 500) : String(error ?? 'Unknown error').slice(0, 500);
  const frames = parseStackFrames(error?.stack);

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    level: 'error',
    platform: 'node',
    environment: environment || 'production',
    ...(release ? {release} : {}),
    tags: sanitizeTags(tags),
    exception: {
      values: [
        {
          type,
          value,
          ...(frames.length ? {stacktrace: {frames}} : {}),
        },
      ],
    },
  };

  const header = JSON.stringify({event_id: eventId, sent_at: sentAt, dsn});
  const itemHeader = JSON.stringify({type: 'event', content_type: 'application/json'});
  return `${header}\n${itemHeader}\n${JSON.stringify(event)}`;
}

/**
 * Privacy-scrubbed, non-blocking server error reporter.
 * Sends only allowlisted route/service tags and stack traces; never sends cookies, bodies, or user data.
 */
export async function captureServerError(error, tags = {}, {dsn = process.env.SENTRY_DSN, env = process.env, fetchImpl = fetch} = {}) {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return false;
  const body = buildSentryEnvelope(error, tags, {
    dsn: parsed.dsn,
    environment: env.SENTRY_ENVIRONMENT || 'production',
    release: env.SENTRY_RELEASE || '',
  });
  try {
    const response = await fetchImpl(parsed.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=nourishing/1.0, sentry_key=${parsed.publicKey}`,
      },
      body,
      signal: AbortSignal.timeout(2000),
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}
