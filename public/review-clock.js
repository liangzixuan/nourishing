// Review windows use the server clock. Keep its last observation in this page
// and persist the time of approval with the queued write.
let sample;

export function observeReviewTime(header) {
  if (!header) return;
  const server = Number(header);
  if (Number.isSafeInteger(server) && server > 0) {
    sample = {server, monotonic: performance.now(), wall: Date.now()};
  }
}

export function reviewTimeAtSave() {
  if (!sample) return Date.now();
  // The wall clock also advances when a mobile OS suspends the page's timers.
  const elapsed = Math.max(performance.now() - sample.monotonic, Date.now() - sample.wall);
  return sample.server + Math.floor(elapsed);
}
