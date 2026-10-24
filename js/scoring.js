// Pure scoring + stats functions. No DOM, no storage — safe to unit test in Node.

import { PEOPLE, SUB_SCORES } from './config.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const visitsFor = (visits, restaurantId) => visits.filter((v) => v.restaurantId === restaurantId);

/** Mean of one person's `overall` across all visits to a restaurant, or null. */
export function personScore(visits, restaurantId, person) {
  return mean(
    visitsFor(visits, restaurantId)
      .map((v) => v.ratings?.[person]?.overall)
      .filter((x) => typeof x === 'number'),
  );
}

/**
 * Per-person and combined scores for a restaurant.
 * Combined = mean of the two people's scores; if only one has rated, it's that score
 * and `waitingFor` names whoever hasn't.
 */
export function restaurantScores(visits, restaurantId) {
  const vs = visitsFor(visits, restaurantId);
  const people = {};
  for (const p of PEOPLE) people[p.id] = personScore(vs, restaurantId, p.id);
  const rated = PEOPLE.filter((p) => people[p.id] !== null);
  const combined = mean(rated.map((p) => people[p.id]));
  const waitingFor = rated.length === 1 ? PEOPLE.find((p) => people[p.id] === null).id : null;
  const dates = vs.map((v) => v.date).sort();
  return {
    people,
    combined,
    waitingFor,
    visitCount: vs.length,
    lastVisit: dates.at(-1) ?? null,
    firstVisit: dates[0] ?? null,
  };
}

/** Mean of each sub-score across both people and all visits (null when nobody filled it in). */
export function subScores(visits, restaurantId) {
  const vs = visitsFor(visits, restaurantId);
  const out = {};
  for (const s of SUB_SCORES) {
    out[s.id] = mean(
      vs.flatMap((v) => Object.values(v.ratings || {}).map((r) => r?.[s.id])).filter((x) => typeof x === 'number'),
    );
  }
  return out;
}

export const isVisited = (visits, restaurantId) => visits.some((v) => v.restaurantId === restaurantId);

/**
 * Main-quest progress. Closed restaurants only count towards the total if we got there
 * before they closed — no penalty for places that vanished.
 */
export function progress(restaurants, visits) {
  const visited = (r) => isVisited(visits, r.id);
  const counts = (r) => r.active || visited(r);
  const main = restaurants.filter((r) => !r.bonus && counts(r));
  const side = restaurants.filter((r) => r.bonus && counts(r));
  return {
    main,
    mainTotal: main.length,
    mainVisited: main.filter(visited).length,
    sideTotal: side.length,
    sideVisited: side.filter(visited).length,
    complete: main.length > 0 && main.every(visited),
  };
}

/** Restaurants with a combined score, best first. Ties broken by name. */
export function ranking(restaurants, visits, { bonus = false } = {}) {
  return restaurants
    .filter((r) => !!r.bonus === bonus)
    .map((r) => ({ restaurant: r, ...restaurantScores(visits, r.id) }))
    .filter((x) => x.combined !== null)
    .sort((a, b) => b.combined - a.combined || a.restaurant.name.localeCompare(b.restaurant.name));
}

function bestBySub(restaurants, visits, sub) {
  let best = null;
  for (const r of restaurants) {
    const v = subScores(visits, r.id)[sub];
    if (v !== null && (best === null || v > best.value)) best = { restaurant: r, value: v };
  }
  return best;
}

/** Everything the Stats view needs, in one pure call. */
export function stats(restaurants, visits) {
  const both = restaurants
    .map((r) => ({ restaurant: r, ...restaurantScores(visits, r.id) }))
    .filter((x) => PEOPLE.every((p) => x.people[p.id] !== null));
  const [a, b] = PEOPLE.map((p) => p.id);
  const gap = (x) => Math.abs(x.people[a] - x.people[b]);

  const biggestDisagreement = both.length
    ? both.reduce((m, x) => (gap(x) > gap(m) ? x : m))
    : null;
  const mostAgreed = both.length
    ? both.reduce((m, x) => (gap(x) < gap(m) || (gap(x) === gap(m) && x.combined > m.combined) ? x : m))
    : null;

  const favourites = {};
  for (const p of PEOPLE) {
    let fav = null;
    for (const r of restaurants) {
      const s = personScore(visits, r.id, p.id);
      if (s !== null && (fav === null || s > fav.score)) fav = { restaurant: r, score: s };
    }
    favourites[p.id] = fav;
  }

  const dates = visits.map((v) => v.date).sort();
  return {
    ranking: ranking(restaurants, visits),
    sideRanking: ranking(restaurants, visits, { bonus: true }),
    bestBroth: bestBySub(restaurants, visits, 'broth'),
    bestNoodles: bestBySub(restaurants, visits, 'noodles'),
    biggestDisagreement: biggestDisagreement && { ...biggestDisagreement, gap: gap(biggestDisagreement) },
    mostAgreed: mostAgreed && { ...mostAgreed, gap: gap(mostAgreed) },
    favourites,
    totalBowls: visits.length * PEOPLE.length,
    totalVisits: visits.length,
    questStarted: dates[0] ?? null,
    progress: progress(restaurants, visits),
  };
}

/** Format a score for display: 4 → "4", 4.25 → "4.3", null → "–". */
export function fmtScore(x) {
  if (x === null || x === undefined) return '–';
  return Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, '');
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
