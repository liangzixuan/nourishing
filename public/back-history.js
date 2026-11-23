/**
 * Sub-screens and sheets share one browser history entry. The JS stack owns
 * their order, so disposing a buried screen never removes another screen.
 */
const stack = [];
const marker = 'nourishing-back-stack';
let draining = false;
let handling = false;

export function hasAppBack() {
  return stack.length > 0;
}

function atMarker() {
  return history.state?.nourishingBack === marker;
}

function syncHistory() {
  if (handling || draining) return;
  if (hasAppBack()) {
    if (!atMarker()) history.pushState({...history.state, nourishingBack: marker}, '');
  } else if (atMarker()) {
    // A replacement sheet can open before this traversal reaches the base.
    // The popstate listener restores the marker for the live stack.
    draining = true;
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
    if (draining || atMarker()) {
      draining = false;
      syncHistory();
    } else {
      requestAppBack();
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
