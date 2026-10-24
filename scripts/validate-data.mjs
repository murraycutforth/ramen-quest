#!/usr/bin/env node
// Checks data/restaurants.json and data/visits.json against the shapes in the spec.
// Usage: node scripts/validate-data.mjs   (exits 1 on any problem)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const PEOPLE = ['murray', 'liat'];
const SUBS = ['broth', 'noodles', 'toppings', 'vibe', 'value'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isIso = (v) => isStr(v) && !Number.isNaN(Date.parse(v));

function load(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    err(rel, `could not read/parse (${e.message})`);
    return null;
  }
}

const R = load('data/restaurants.json');
const V = load('data/visits.json');
const ids = new Set();

if (R) {
  if (R.version !== 1) err('restaurants', 'version must be 1');
  if (!Array.isArray(R.restaurants)) err('restaurants', 'restaurants must be an array');
  for (const [i, r] of (R.restaurants || []).entries()) {
    const at = `restaurants[${i}]${r && r.id ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') { err(at, 'not an object'); continue; }
    if (!isStr(r.id) || !SLUG.test(r.id)) err(at, 'id must be a kebab-case slug');
    if (ids.has(r.id)) err(at, 'duplicate id');
    ids.add(r.id);
    for (const k of ['name', 'address', 'area']) if (!isStr(r[k]) || !r[k].trim()) err(at, `${k} must be a non-empty string`);
    if (!isNum(r.lat) || r.lat < 51.6 || r.lat > 51.9) err(at, 'lat missing or outside the Oxford area');
    if (!isNum(r.lng) || r.lng < -1.5 || r.lng > -1.0) err(at, 'lng missing or outside the Oxford area');
    if (r.website !== undefined && !isStr(r.website)) err(at, 'website must be a string');
    if (isStr(r.website) && r.website && !/^https:\/\//.test(r.website)) err(at, 'website must start with https://');
    if (!Array.isArray(r.tags) || !r.tags.every(isStr)) err(at, 'tags must be an array of strings');
    if (typeof r.bonus !== 'boolean') err(at, 'bonus must be boolean');
    if (typeof r.active !== 'boolean') err(at, 'active must be boolean');
    if (!isStr(r.addedAt) || !DATE.test(r.addedAt)) err(at, 'addedAt must be YYYY-MM-DD');
  }
}

if (V) {
  if (V.version !== 1) err('visits', 'version must be 1');
  if (!Array.isArray(V.visits)) err('visits', 'visits must be an array');
  const vids = new Set();
  for (const [i, v] of (V.visits || []).entries()) {
    const at = `visits[${i}]${v && v.id ? ` (${v.id})` : ''}`;
    if (!v || typeof v !== 'object') { err(at, 'not an object'); continue; }
    if (!isStr(v.id) || !v.id) err(at, 'id must be a string');
    if (vids.has(v.id)) err(at, 'duplicate id');
    vids.add(v.id);
    if (!ids.has(v.restaurantId)) err(at, `unknown restaurantId "${v.restaurantId}"`);
    if (!isStr(v.date) || !DATE.test(v.date)) err(at, 'date must be YYYY-MM-DD');
    if (!isIso(v.createdAt)) err(at, 'createdAt must be an ISO timestamp');
    if (!isIso(v.updatedAt)) err(at, 'updatedAt must be an ISO timestamp');
    if (!v.ratings || typeof v.ratings !== 'object') { err(at, 'ratings must be an object'); continue; }
    for (const [who, rt] of Object.entries(v.ratings)) {
      const rat = `${at}.ratings.${who}`;
      if (!PEOPLE.includes(who)) err(rat, 'unknown person');
      if (!rt || typeof rt !== 'object') { err(rat, 'not an object'); continue; }
      if (!isNum(rt.overall) || rt.overall < 1 || rt.overall > 5 || (rt.overall * 2) % 1 !== 0) {
        err(rat, 'overall must be 1–5 in half steps');
      }
      for (const s of SUBS) {
        if (rt[s] === undefined || rt[s] === null) continue;
        if (!Number.isInteger(rt[s]) || rt[s] < 1 || rt[s] > 5) err(rat, `${s} must be an integer 1–5`);
      }
      for (const s of ['dish', 'note']) if (rt[s] !== undefined && !isStr(rt[s])) err(rat, `${s} must be a string`);
      if (!isIso(rt.updatedAt)) err(rat, 'updatedAt must be an ISO timestamp');
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ data OK — ${R.restaurants.length} restaurants, ${V.visits.length} visits`);
