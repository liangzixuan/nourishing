// Serialized background write queue for optimistic UI updates.
// Runs mutations in FIFO order so rapid edits never collide on workspace revision.

const queue = [];
const listeners = new Set();
let draining = false;
let activeLabel = '';

function notify(extra = {}) {
  const snapshot = {pending: queue.length + (draining ? 1 : 0), label: activeLabel, ...extra};
  for (const listener of listeners) listener(snapshot);
}

function beforeUnload(event) {
  if (draining || queue.length > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', beforeUnload);
}

async function runWithRetry(task) {
  try {
    return await task.run();
  } catch (error) {
    // Only auto-retry transient network/5xx errors; never retry 4xx client/validation errors.
    if (error?.status >= 400 && error?.status < 500) throw error;
    await new Promise(resolve => setTimeout(resolve, 1200));
    return task.run();
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift();
      activeLabel = task.label || 'Syncing…';
      notify();
      try {
        const result = await runWithRetry(task);
        await task.onSuccess?.(result);
      } catch (error) {
        const retry = () => enqueue(task);
        await task.onError?.(error, retry);
        notify({error, retry});
      }
    }
  } finally {
    draining = false;
    activeLabel = '';
    notify();
  }
}

export function enqueueWrite(task) {
  queue.push(task);
  notify();
  void drain();
}

export function onWriteQueueStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingWriteCount() {
  return queue.length + (draining ? 1 : 0);
}
