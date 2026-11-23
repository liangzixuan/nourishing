/**
 * Sub-screens and sheets share one browser history entry. The JS stack owns
 * their order, so disposing a buried screen never removes another screen.
 */
const stack = [];
const marker = 'nourishing-back-stack';
let traversing = false;
let handling = false;

export function hasAppBack() {
  return stack.length > 0;
}

function atMarker() {
  return history.state?.nourishingBack === marker;
}

// Installed browsers can send a system Back as a close request before they
// begin a visual history traversal. Native dialogs and popovers own theirs.
const useCloseRequests = typeof window !== 'undefined' && 'CloseWatcher' in window &&
  window.matchMedia('(display-mode: standalone)').matches;
let closeWatcher = null;

function releaseCloseWatcher() {
  closeWatcher?.destroy();
  closeWatcher = null;
}

function syncCloseWatcher() {
  if (!useCloseRequests) return;
  if (!hasAppBack() || document.querySelector('dialog[open],:popover-open')) {
    releaseCloseWatcher();
    return;
  }
  if (closeWatcher) return;
  closeWatcher = new CloseWatcher();
  closeWatcher.onclose = () => {
    closeWatcher = null;
    requestAppBack();
  };
}

if (useCloseRequests) {
  document.addEventListener('beforetoggle', event => {
    if (!event.target.matches('dialog,[popover]')) return;
    if (event.newState === 'open') releaseCloseWatcher();
  }, true);
  document.addEventListener('toggle', event => {
    if (event.target.matches('dialog,[popover]')) syncCloseWatcher();
  }, true);
}

function syncHistory() {
  syncCloseWatcher();
  if (handling || traversing) return;
  if (hasAppBack()) {
    if (!atMarker()) history.pushState({...history.state, nourishingBack: marker}, '');
  } else if (atMarker()) {
    // A replacement sheet can open before this traversal reaches the base.
    // The popstate listener restores the marker for the live stack.
    traversing = true;
    history.back();
  }
}

export function requestAppBack() {
  const entry = stack.at(-1);
  if (!entry) return false;
  if (handling) return true;
  handling = true;
  try {
    if (entry.onBack() !== 'keep') entry.release();
  } finally {
    handling = false;
    syncHistory();
  }
  return true;
}

if (typeof window !== 'undefined' && window.history) {
  window.addEventListener('popstate', () => {
    if (atMarker()) {
      traversing = false;
      syncHistory();
      return;
    }
    const appReleasedMarker = traversing;
    traversing = true;
    try {
      if (!appReleasedMarker) requestAppBack();
    } finally {
      // Reuse the marker created when the user opened the screen. Pushing a
      // new one here makes Chrome skip the app on the next system Back.
      if (hasAppBack()) history.forward();
      else traversing = false;
    }
  });
  // A reload starts at the root even if a sheet owned the current entry.
  syncHistory();
}

export function pushBackHandler(onBack) {
  const entry = {
    onBack,
    release() {
      const index = stack.indexOf(entry);
      if (index < 0) return;
      stack.splice(index, 1);
      syncHistory();
    },
  };
  stack.push(entry);
  syncHistory();
  return entry;
}
