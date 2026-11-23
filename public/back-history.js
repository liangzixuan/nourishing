/**
 * Shared LIFO browser-history back stack for PWA sub-screens and modal sheets.
 * The browser reports native Back without a gesture origin or edge direction.
 */
const stack = [];
let nextId = 0;
let pendingProgrammaticPops = 0;
let listening = false;
let batchedReleases = null;

export function requestAppBack(){
  if(!stack.length)return false;
  history.back();
  return true;
}

// Closing several owned layers for Home needs one browser traversal. Separate
// back() calls in the same event can coalesce into a single popstate.
export function batchBackReleases(action){
  batchedReleases=0;
  try{return action();}
  finally{
    const count=batchedReleases;
    batchedReleases=null;
    if(count){
      pendingProgrammaticPops++;
      history.go(-count);
    }
  }
}

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
      if(batchedReleases!==null){batchedReleases++;return;}
      if (popHistory) {
        pendingProgrammaticPops++;
        history.back();
      } else {
        history.replaceState(null, '');
      }
    },
  };
}
