// Pure data operations. Every change the app makes is recorded as an "op" and replayed
// on top of whatever is currently in the repo. That's how we avoid losing edits when
// Murray and Liat save at the same time: on a sha conflict we refetch and replay.
//
// Op shapes:
//   { kind: 'rate',   id, visitId, restaurantId, date, person, rating }   rating.updatedAt required
//   { kind: 'unrate', id, visitId, person, at }
//   { kind: 'deleteVisit', id, visitId, at }
//   { kind: 'addRestaurant', id, restaurant }

import { personName } from './config.js';

export const fileForOp = (op) => (op.kind === 'addRestaurant' ? 'restaurants' : 'visits');

const clone = (x) => JSON.parse(JSON.stringify(x));
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

function touch(visit) {
  const stamps = Object.values(visit.ratings).map((r) => r.updatedAt);
  visit.updatedAt = stamps.reduce(later, visit.createdAt);
}

/** Apply one op to a visits doc in place. */
function applyVisitOp(doc, op) {
  const idx = doc.visits.findIndex((v) => v.id === op.visitId);
  const visit = idx >= 0 ? doc.visits[idx] : null;

  if (op.kind === 'rate') {
    let v = visit;
    if (!v) {
      v = {
        id: op.visitId,
        restaurantId: op.restaurantId,
        date: op.date,
        ratings: {},
        createdAt: op.rating.updatedAt,
        updatedAt: op.rating.updatedAt,
      };
      doc.visits.push(v);
    }
    const existing = v.ratings[op.person];
    // Last write wins per person's rating — never clobber a newer one from another device.
    if (!existing || existing.updatedAt <= op.rating.updatedAt) {
      v.ratings[op.person] = clone(op.rating);
      if (op.date) v.date = op.date;
    }
    touch(v);
  } else if (op.kind === 'unrate') {
    if (!visit) return;
    const existing = visit.ratings[op.person];
    if (existing && existing.updatedAt <= op.at) delete visit.ratings[op.person];
    touch(visit);
    // A visit nobody has rated any more is just noise.
    if (!Object.keys(visit.ratings).length) doc.visits.splice(idx, 1);
  } else if (op.kind === 'deleteVisit') {
    if (visit) doc.visits.splice(idx, 1);
  }
}

function applyRestaurantOp(doc, op) {
  if (op.kind !== 'addRestaurant') return;
  if (doc.restaurants.some((r) => r.id === op.restaurant.id)) return;
  doc.restaurants.push(clone(op.restaurant));
}

/** Return a new doc with ops replayed on top. `file` is 'visits' or 'restaurants'. */
export function applyOps(doc, ops, file) {
  const out = clone(doc);
  for (const op of ops) {
    if (fileForOp(op) !== file) continue;
    if (file === 'visits') applyVisitOp(out, op);
    else applyRestaurantOp(out, op);
  }
  if (file === 'visits') out.visits.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return out;
}

/**
 * Merge two versions of visits.json by visit id; per person, the rating with the later
 * updatedAt wins. Used when a cached copy and a freshly fetched copy disagree.
 */
export function mergeVisitDocs(a, b) {
  const byId = new Map(clone(a).visits.map((v) => [v.id, v]));
  for (const v of clone(b).visits) {
    const mine = byId.get(v.id);
    if (!mine) { byId.set(v.id, v); continue; }
    for (const [who, r] of Object.entries(v.ratings)) {
      if (!mine.ratings[who] || mine.ratings[who].updatedAt < r.updatedAt) mine.ratings[who] = r;
    }
    if (v.updatedAt > mine.updatedAt) mine.date = v.date;
    touch(mine);
  }
  return { ...a, visits: [...byId.values()].sort((x, y) => x.date.localeCompare(y.date)) };
}

function describe(op, restaurantsById, visitsById) {
  const rid = op.restaurantId ?? visitsById.get(op.visitId)?.restaurantId ?? op.restaurant?.id;
  const place = restaurantsById.get(rid)?.name ?? op.restaurant?.name ?? 'a ramen spot';
  switch (op.kind) {
    case 'rate': return `${personName(op.person)} rated ${place} (${op.rating.overall})`;
    case 'unrate': return `${personName(op.person)} removed their rating for ${place}`;
    case 'deleteVisit': return `Deleted a visit to ${place}`;
    case 'addRestaurant': return `Added ${place} to the quest`;
    default: return 'Updated data';
  }
}

/** Human-friendly commit message, e.g. "🍜 Murray rated Ramen Kulture (4.5)". */
export function commitMessage(ops, restaurants, visits = []) {
  const rById = new Map(restaurants.map((r) => [r.id, r]));
  const vById = new Map(visits.map((v) => [v.id, v]));
  const lines = ops.map((op) => describe(op, rById, vById));
  const emoji = ops.every((o) => o.kind === 'deleteVisit') ? '🗑️' : ops.every((o) => o.kind === 'addRestaurant') ? '📍' : '🍜';
  if (lines.length === 1) return `${emoji} ${lines[0]}`;
  return `${emoji} ${lines.length} ramen updates\n\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
