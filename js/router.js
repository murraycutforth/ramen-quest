// Hash routing.
//   #list  #map  #stats  #settings                 base views
//   #<base>/r/<restaurantId>                        detail sheet over a base view
//   #<base>/rate/<restaurantId>[/<visitId>]         rating form sheet
//   #r/<restaurantId>                               shareable link (opens over the list)

export const BASES = ['list', 'map', 'stats', 'settings'];

export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  let base = 'list';
  if (BASES.includes(parts[0])) base = parts.shift();
  let overlay = null;
  if (parts[0] === 'r' && parts[1]) overlay = { kind: 'detail', restaurantId: parts[1] };
  if (parts[0] === 'rate' && parts[1]) overlay = { kind: 'rate', restaurantId: parts[1], visitId: parts[2] || null };
  return { base, overlay };
}

let depth = 0; // how many overlay entries we pushed on top of the base view
let pushing = false;
const listeners = new Set();

export const onRoute = (fn) => listeners.add(fn);
export const current = () => parse();

export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    emit();
  } else {
    pushing = true;
    location.hash = hash;
  }
}

/** Close any overlay, returning to the base view — via history when we can. */
export function closeOverlay() {
  const { base, overlay } = parse();
  if (!overlay) return;
  if (depth > 0) history.go(-depth);
  else navigate(`#${base}`, { replace: true });
}

/** Go back one step (e.g. rate form → detail). */
export function back(fallback) {
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}

function emit() {
  const r = parse();
  if (!r.overlay) depth = 0;
  listeners.forEach((fn) => fn(r));
}

export function startRouter() {
  // Any in-app link counts as a push, so closing can unwind it with history.go().
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && !e.defaultPrevented && a.getAttribute('href') !== location.hash) pushing = true;
  }, true);
  window.addEventListener('hashchange', () => {
    const r = parse();
    if (r.overlay) depth = pushing ? depth + 1 : Math.max(0, depth - 1);
    pushing = false;
    emit();
  });
  if (!location.hash) history.replaceState(null, '', '#list');
  emit();
}
