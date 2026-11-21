// Both signed review formats use a fixed 30-minute window. Existing photo
// tokens encode its end. Barcode tokens also encode its start.
export const signedReviewLifetimeMs = 30 * 60 * 1000;

export function reviewCanBeSaved(issued, expires, now, savedAt = now) {
  return Number.isSafeInteger(issued) && Number.isSafeInteger(expires)
    && expires === issued + signedReviewLifetimeMs
    && Number.isSafeInteger(now) && Number.isSafeInteger(savedAt)
    && issued <= savedAt && savedAt < expires && savedAt <= now;
}

// An offline browser can check the window and owner before accepting a Save.
// Only the server verifies the HMAC and the canonical food or image.
export function checkLocalReviewSave(type, payload, owner, savedAt) {
  const photo = type === 'photo.log';
  let claims;
  try {
    const [encoded, signature, extra] = payload.reviewToken.split('.');
    if (extra === undefined && /^[\w-]{43}$/.test(signature)) {
      const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
      claims = JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch { /* Missing or unreadable claims cannot authorize a local save. */ }
  const expires = photo ? claims?.expiresAt : claims?.expires;
  const issued = photo ? expires - signedReviewLifetimeMs : claims?.issued;
  const bound = photo ? claims?.v === 1 && claims.photoId === payload.photo?.id : claims?.version === 1;
  if (!bound || claims.owner !== owner || !reviewCanBeSaved(issued, expires, savedAt)) {
    throw Error(photo ? 'This photo review expired or changed. Scan the photo again.' : 'Look up this product again.');
  }
}
