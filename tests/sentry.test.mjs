import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSentryDsn, buildSentryEnvelope, captureServerError} from '../server/sentry.mjs';

test('parseSentryDsn validates HTTPS Sentry DSNs and rejects invalid values', () => {
  const parsed = parseSentryDsn('https://abc123@o12345.ingest.us.sentry.io/67890');
  assert.deepEqual(parsed, {
    dsn: 'https://abc123@o12345.ingest.us.sentry.io/67890',
    publicKey: 'abc123',
    envelopeUrl: 'https://o12345.ingest.us.sentry.io/api/67890/envelope/',
  });
  assert.equal(parseSentryDsn(''), null);
  assert.equal(parseSentryDsn(undefined), null);
  assert.equal(parseSentryDsn('http://abc123@o12345.ingest.us.sentry.io/67890'), null);
  assert.equal(parseSentryDsn('https://o12345.ingest.us.sentry.io/67890'), null);
  assert.equal(parseSentryDsn('https://abc123@o12345.ingest.us.sentry.io/not-numeric'), null);
});

test('captureServerError is a no-op when SENTRY_DSN is unset', async () => {
  let called = false;
  const ok = await captureServerError(Error('boom'), {service: 'web'}, {dsn: '', fetchImpl: async () => { called = true; }});
  assert.equal(ok, false);
  assert.equal(called, false);
});

test('captureServerError sends a privacy-scrubbed Sentry envelope and swallows transport errors', async () => {
  const sent = [];
  const dsn = 'https://pub42@o99.ingest.sentry.io/1234';
  const ok = await captureServerError(
    new TypeError('Unexpected state'),
    {service: 'web', method: 'POST', path: '/api/diary', status: 503, cookie: 'secret', email: 'user@example.com'},
    {
      dsn,
      env: {SENTRY_ENVIRONMENT: 'production', SENTRY_RELEASE: 'abc1234'},
      fetchImpl: async (url, init) => {
        sent.push({url, init});
        return {ok: true};
      },
    },
  );
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://o99.ingest.sentry.io/api/1234/envelope/');
  assert.match(sent[0].init.headers['X-Sentry-Auth'], /sentry_key=pub42/);
  const lines = sent[0].init.body.split('\n');
  assert.equal(lines.length, 3);
  const payload = JSON.parse(lines[2]);
  assert.equal(payload.environment, 'production');
  assert.equal(payload.release, 'abc1234');
  assert.deepEqual(payload.tags, {service: 'web', method: 'POST', path: '/api/diary', status: '503'});
  assert.equal(payload.exception.values[0].type, 'TypeError');
  assert.equal(payload.exception.values[0].value, 'Unexpected state');
  assert.ok(!sent[0].init.body.includes('secret'));
  assert.ok(!sent[0].init.body.includes('user@example.com'));

  const failed = await captureServerError(Error('offline'), {service: 'web'}, {
    dsn,
    fetchImpl: async () => { throw Error('network down'); },
  });
  assert.equal(failed, false);
});

test('buildSentryEnvelope includes parsed stack frames in bottom-to-top order', () => {
  const envelope = buildSentryEnvelope(Error('sample'), {service: 'web'}, {dsn: 'https://k@host/1'});
  const event = JSON.parse(envelope.split('\n')[2]);
  const frames = event.exception.values[0].stacktrace?.frames ?? [];
  assert.ok(frames.length > 0);
  assert.equal(typeof frames.at(-1).lineno, 'number');
});
