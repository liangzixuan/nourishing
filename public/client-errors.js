const MAX_REPORTS = 5;
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /AbortError/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
];

let reported = 0;
const seen = new Set();

function isIgnored(name, message) {
  const combined = `${name}: ${message}`;
  return IGNORED_PATTERNS.some(pattern => pattern.test(combined));
}

function sendClientError({name, message, stack}) {
  if (reported >= MAX_REPORTS || !navigator.onLine) return;
  const safeName = String(name || 'Error').slice(0, 100);
  const safeMessage = String(message || 'Unknown client error').slice(0, 500);
  if (isIgnored(safeName, safeMessage)) return;
  const key = `${safeName}:${safeMessage}`;
  if (seen.has(key)) return;
  seen.add(key);
  reported++;
  const payload = {
    name: safeName,
    message: safeMessage,
    stack: typeof stack === 'string' ? stack.slice(0, 4000) : '',
    source: location.pathname.slice(0, 200),
  };
  void fetch('/api/client-error', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

window.addEventListener('error', event => {
  if (event.filename && !event.filename.startsWith(location.origin)) return;
  const err = event.error;
  sendClientError({
    name: err?.name || 'Error',
    message: err?.message || event.message,
    stack: err?.stack || (event.filename ? `at ${event.filename.split('?')[0]}:${event.lineno}:${event.colno}` : ''),
  });
});

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  if (!reason) return;
  sendClientError({
    name: reason?.name || 'UnhandledRejection',
    message: reason?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection'),
    stack: reason?.stack || '',
  });
});
