/**
 * Shared LIFO browser-history back stack for PWA sub-screens and modal sheets.
 * Lets Android left/right edge-swipe Back gestures step back inside the app
 * instead of exiting the PWA to the launcher.
 */
const stack = [];
let nextId = 0;
let pendingProgrammaticPops = 0;
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', () => {
    if (pendingProgrammaticPops > 0) {
      pendingProgrammaticPops--;
      return;
    }
    const entry = stack.pop();
    if (!entry) return;
    entry.active = false;
    const result = entry.onBack();
    if (result === 'keep') {
      entry.active = true;
      stack.push(entry);
      history.pushState({nourishingBack: ++nextId}, '');
    }
  });
}

export function pushBackHandler(onBack) {
  ensureListener();
  const entry = {id: ++nextId, onBack, active: true};
  stack.push(entry);
  history.pushState({nourishingBack: entry.id}, '');
  return {
    release({popHistory = true} = {}) {
      if (!entry.active) return;
      entry.active = false;
      const index = stack.lastIndexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      if (popHistory) {
        pendingProgrammaticPops++;
        history.back();
      } else {
        history.replaceState(null, '');
      }
    },
  };
}
