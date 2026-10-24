import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, mergeVisitDocs, commitMessage, slugify } from '../js/ops.js';

const empty = () => ({ version: 1, visits: [] });
const rate = (person, overall, updatedAt, extra = {}) => ({
  kind: 'rate', id: `op-${person}-${updatedAt}`, visitId: 'v1', restaurantId: 'ramen-kulture', date: '2026-11-01', person,
  rating: { overall, updatedAt }, ...extra,
});

test('rate creates a visit, second person adds to the same visit', () => {
  const doc = applyOps(empty(), [rate('murray', 4.5, '2026-11-01T19:42:00Z'), rate('liat', 4, '2026-11-01T20:00:00Z')], 'visits');
  assert.equal(doc.visits.length, 1);
  assert.equal(doc.visits[0].ratings.murray.overall, 4.5);
  assert.equal(doc.visits[0].ratings.liat.overall, 4);
  assert.equal(doc.visits[0].updatedAt, '2026-11-01T20:00:00Z');
});

test('replaying on top of a remote that changed in the meantime keeps both edits', () => {
  // Liat saved first (remote), Murray's queued op is replayed onto it after a 409.
  const remote = applyOps(empty(), [rate('liat', 3, '2026-11-01T20:00:00Z')], 'visits');
  const merged = applyOps(remote, [rate('murray', 5, '2026-11-01T20:01:00Z')], 'visits');
  assert.equal(merged.visits[0].ratings.liat.overall, 3);
  assert.equal(merged.visits[0].ratings.murray.overall, 5);
});

test('an older queued rating never clobbers a newer one for the same person', () => {
  const remote = applyOps(empty(), [rate('murray', 2, '2026-11-02T10:00:00Z')], 'visits');
  const merged = applyOps(remote, [rate('murray', 5, '2026-11-01T10:00:00Z')], 'visits');
  assert.equal(merged.visits[0].ratings.murray.overall, 2);
});

test('applyOps does not mutate its input', () => {
  const doc = empty();
  applyOps(doc, [rate('murray', 4, '2026-11-01T10:00:00Z')], 'visits');
  assert.equal(doc.visits.length, 0);
});

test('unrate removes one rating; removing the last one removes the visit', () => {
  let doc = applyOps(empty(), [rate('murray', 4, '2026-11-01T10:00:00Z'), rate('liat', 3, '2026-11-01T11:00:00Z')], 'visits');
  doc = applyOps(doc, [{ kind: 'unrate', id: 'u1', visitId: 'v1', person: 'murray', at: '2026-11-01T12:00:00Z' }], 'visits');
  assert.deepEqual(Object.keys(doc.visits[0].ratings), ['liat']);
  doc = applyOps(doc, [{ kind: 'unrate', id: 'u2', visitId: 'v1', person: 'liat', at: '2026-11-01T12:00:00Z' }], 'visits');
  assert.equal(doc.visits.length, 0);
});

test('deleteVisit removes the visit', () => {
  let doc = applyOps(empty(), [rate('murray', 4, '2026-11-01T10:00:00Z')], 'visits');
  doc = applyOps(doc, [{ kind: 'deleteVisit', id: 'd', visitId: 'v1', at: '2026-11-01T12:00:00Z' }], 'visits');
  assert.equal(doc.visits.length, 0);
});

test('addRestaurant is idempotent and only touches the restaurants file', () => {
  const r = { id: 'new-place', name: 'New Place' };
  const op = { kind: 'addRestaurant', id: 'a1', restaurant: r };
  const doc = applyOps(applyOps({ version: 1, restaurants: [] }, [op], 'restaurants'), [op], 'restaurants');
  assert.equal(doc.restaurants.length, 1);
  assert.equal(applyOps(empty(), [op], 'visits').visits.length, 0);
});

test('mergeVisitDocs: per-person last updatedAt wins', () => {
  const a = applyOps(empty(), [rate('murray', 4, '2026-11-01T10:00:00Z'), rate('liat', 2, '2026-11-01T13:00:00Z')], 'visits');
  const b = applyOps(empty(), [rate('murray', 5, '2026-11-01T12:00:00Z'), rate('liat', 1, '2026-11-01T11:00:00Z')], 'visits');
  const m = mergeVisitDocs(a, b);
  assert.equal(m.visits[0].ratings.murray.overall, 5);
  assert.equal(m.visits[0].ratings.liat.overall, 2);
});

test('commit messages are readable', () => {
  const restaurants = [{ id: 'ramen-kulture', name: 'Ramen Kulture' }];
  assert.equal(commitMessage([rate('murray', 4.5, 't')], restaurants), '🍜 Murray rated Ramen Kulture (4.5)');
  const multi = commitMessage([rate('murray', 4.5, 't'), rate('liat', 4, 't2')], restaurants);
  assert.match(multi, /^🍜 2 ramen updates\n\n- Murray rated Ramen Kulture \(4\.5\)\n- Liat rated Ramen Kulture \(4\)$/);
});

test('slugify', () => {
  assert.equal(slugify('Kibou Japanese Kitchen & Bar'), 'kibou-japanese-kitchen-and-bar');
  assert.equal(slugify('Edamamé'), 'edamame');
});
