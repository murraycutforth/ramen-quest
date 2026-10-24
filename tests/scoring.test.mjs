import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personScore, restaurantScores, progress, ranking, stats, fmtScore, subScores } from '../js/scoring.js';

const R = (id, extra = {}) => ({ id, name: id, address: 'x', lat: 51.75, lng: -1.25, area: 'x', tags: [], bonus: false, active: true, addedAt: '2026-10-24', ...extra });
const rating = (overall, extra = {}) => ({ overall, updatedAt: '2026-11-01T12:00:00Z', ...extra });
let n = 0;
const V = (restaurantId, date, ratings) => ({ id: `v${n++}`, restaurantId, date, ratings, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z` });

test('half-step scores average correctly', () => {
  const visits = [V('a', '2026-11-01', { murray: rating(4.5), liat: rating(3.5) })];
  const s = restaurantScores(visits, 'a');
  assert.equal(s.people.murray, 4.5);
  assert.equal(s.people.liat, 3.5);
  assert.equal(s.combined, 4);
  assert.equal(s.waitingFor, null);
});

test('missing partner rating: combined is the one score, waiting for the other', () => {
  const visits = [V('a', '2026-11-01', { murray: rating(4.5) })];
  const s = restaurantScores(visits, 'a');
  assert.equal(s.combined, 4.5);
  assert.equal(s.people.liat, null);
  assert.equal(s.waitingFor, 'liat');
});

test('revisits: per-person score is the mean across visits, combined is mean of people', () => {
  const visits = [
    V('a', '2026-11-01', { murray: rating(4), liat: rating(5) }),
    V('a', '2026-12-01', { murray: rating(3) }),
    V('b', '2026-12-02', { murray: rating(1), liat: rating(1) }),
  ];
  assert.equal(personScore(visits, 'a', 'murray'), 3.5);
  assert.equal(personScore(visits, 'a', 'liat'), 5);
  const s = restaurantScores(visits, 'a');
  assert.equal(s.combined, 4.25);
  assert.equal(s.visitCount, 2);
  assert.equal(s.lastVisit, '2026-12-01');
  assert.equal(fmtScore(s.combined), '4.3');
});

test('unvisited restaurant has null scores', () => {
  const s = restaurantScores([], 'a');
  assert.equal(s.combined, null);
  assert.equal(s.visitCount, 0);
  assert.equal(s.waitingFor, null);
});

test('progress: side quests separate; closed-unvisited excluded; closed-visited still counts', () => {
  const restaurants = [R('a'), R('b'), R('closed-never', { active: false }), R('closed-done', { active: false }), R('side', { bonus: true })];
  const visits = [V('a', '2026-11-01', { murray: rating(4) }), V('closed-done', '2026-11-02', { liat: rating(3) }), V('side', '2026-11-03', { liat: rating(2) })];
  const p = progress(restaurants, visits);
  assert.equal(p.mainTotal, 3); // a, b, closed-done
  assert.equal(p.mainVisited, 2);
  assert.equal(p.sideTotal, 1);
  assert.equal(p.sideVisited, 1);
  assert.equal(p.complete, false);
  visits.push(V('b', '2026-11-04', { murray: rating(5) }));
  assert.equal(progress(restaurants, visits).complete, true);
});

test('progress with no restaurants is not "complete"', () => {
  assert.equal(progress([], []).complete, false);
});

test('ranking excludes side quests by default and sorts best first', () => {
  const restaurants = [R('a'), R('b'), R('s', { bonus: true })];
  const visits = [V('a', '2026-11-01', { murray: rating(3) }), V('b', '2026-11-01', { murray: rating(5) }), V('s', '2026-11-01', { murray: rating(5) })];
  assert.deepEqual(ranking(restaurants, visits).map((x) => x.restaurant.id), ['b', 'a']);
  assert.deepEqual(ranking(restaurants, visits, { bonus: true }).map((x) => x.restaurant.id), ['s']);
});

test('stats: disagreement, agreement, favourites, bowls, best broth', () => {
  const restaurants = [R('a'), R('b'), R('c')];
  const visits = [
    V('a', '2026-11-05', { murray: rating(5, { broth: 5 }), liat: rating(2, { broth: 3 }) }),
    V('b', '2026-11-01', { murray: rating(4, { broth: 2, noodles: 5 }), liat: rating(4) }),
    V('c', '2026-11-03', { murray: rating(1) }),
  ];
  const st = stats(restaurants, visits);
  assert.equal(st.biggestDisagreement.restaurant.id, 'a');
  assert.equal(st.biggestDisagreement.gap, 3);
  assert.equal(st.mostAgreed.restaurant.id, 'b');
  assert.equal(st.favourites.murray.restaurant.id, 'a');
  assert.equal(st.favourites.liat.restaurant.id, 'b');
  assert.equal(st.totalBowls, 6);
  assert.equal(st.questStarted, '2026-11-01');
  assert.equal(st.bestBroth.restaurant.id, 'a');
  assert.equal(st.bestBroth.value, 4);
  assert.equal(st.bestNoodles.restaurant.id, 'b');
  assert.equal(subScores(visits, 'c').broth, null);
});
