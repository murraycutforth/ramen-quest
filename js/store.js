// App state: last-known repo data (cached in localStorage), a queue of pending ops,
// and the derived view (base data + pending ops replayed on top).

import { DEFAULT_REPO, DATA_FILES } from './config.js';
import { getJson, putJson, GitHubError } from './github.js';
import { applyOps, fileForOp, commitMessage } from './ops.js';

const KEY = {
  cache: 'rq.cache.v1',
  pending: 'rq.pending.v1',
  me: 'rq.me',
  token: 'rq.token',
  repo: 'rq.repo',
};

// localStorage can throw (private mode, blocked storage) — never let that break the app.
export const storage = {
  get(k, fallback = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  },
  remove(k) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

const EMPTY = {
  restaurants: { doc: { version: 1, restaurants: [] }, sha: null },
  visits: { doc: { version: 1, visits: [] }, sha: null },
};

const state = {
  base: storage.get(KEY.cache) || structuredClone(EMPTY),
  pending: storage.get(KEY.pending, []),
  view: null,
  loaded: false,
  status: 'idle', // idle | saving | saved | offline | error
  statusDetail: '',
  source: null, // 'api' | 'static' | 'cache'
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const notify = () => listeners.forEach((fn) => fn(state));

function recompute() {
  state.view = {
    restaurants: applyOps(state.base.restaurants.doc, state.pending, 'restaurants').restaurants,
    visits: applyOps(state.base.visits.doc, state.pending, 'visits').visits,
  };
}
recompute();

export const getState = () => state;
export const data = () => state.view;

// ── Preferences ────────────────────────────────────────────────────────────
export const getMe = () => storage.get(KEY.me);
export const setMe = (id) => { storage.set(KEY.me, id); notify(); };
export const getToken = () => storage.get(KEY.token);
export const hasToken = () => !!getToken();
export const setToken = (t) => { storage.set(KEY.token, t.trim()); notify(); flush(); };
export const removeToken = () => { storage.remove(KEY.token); notify(); };
export const getRepo = () => ({ ...DEFAULT_REPO, ...(storage.get(KEY.repo) || {}) });
export const setRepo = (cfg) => { storage.set(KEY.repo, cfg); };
export const pref = (k, fallback) => storage.get(`rq.pref.${k}`, fallback);
export const setPref = (k, v) => storage.set(`rq.pref.${k}`, v);

function setStatus(status, detail = '') {
  state.status = status;
  state.statusDetail = detail;
  notify();
}

function persist() {
  storage.set(KEY.cache, state.base);
  storage.set(KEY.pending, state.pending);
}

// ── Loading ────────────────────────────────────────────────────────────────
async function fetchStatic(path) {
  const res = await fetch(`./${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`static ${res.status}`);
  return { doc: await res.json(), sha: null };
}

async function fetchFile(name) {
  const path = DATA_FILES[name];
  try {
    const r = await getJson(getRepo(), path, getToken());
    return { ...r, source: 'api' };
  } catch {
    return { ...(await fetchStatic(path)), source: 'static' };
  }
}

/** Fetch fresh data (API first, static file as fallback). Keeps the cache if both fail. */
export async function refresh() {
  try {
    const [restaurants, visits] = await Promise.all([fetchFile('restaurants'), fetchFile('visits')]);
    state.base = {
      restaurants: { doc: restaurants.doc, sha: restaurants.sha },
      visits: { doc: visits.doc, sha: visits.sha },
    };
    state.source = restaurants.source === 'api' && visits.source === 'api' ? 'api' : 'static';
    persist();
  } catch {
    state.source = 'cache';
  }
  state.loaded = true;
  recompute();
  notify();
  if (state.pending.length) flush();
}

// ── Writing ────────────────────────────────────────────────────────────────
export function dispatch(op) {
  state.pending.push(op);
  persist();
  recompute();
  notify();
  return flush();
}

let flushing = null;
let flushAgain = false;

/** Push pending ops to the repo: refetch → replay ops → PUT with sha, retrying on conflict. */
export function flush() {
  if (flushing) { flushAgain = true; return flushing; }
  if (!state.pending.length) return Promise.resolve();
  const token = getToken();
  if (!token) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline', 'Will sync when you’re back online');
    return Promise.resolve();
  }

  flushing = (async () => {
    setStatus('saving');
    const repo = getRepo();
    try {
      // Restaurants first, so visits never point at a restaurant the repo doesn't know yet.
      for (const file of ['restaurants', 'visits']) {
        const ops = state.pending.filter((o) => fileForOp(o) === file);
        if (!ops.length) continue;
        for (let attempt = 0; ; attempt++) {
          const { doc, sha } = await getJson(repo, DATA_FILES[file], token);
          const next = applyOps(doc, ops, file);
          const msg = commitMessage(ops, state.view.restaurants, state.view.visits);
          try {
            const newSha = await putJson(repo, DATA_FILES[file], next, sha, msg, token);
            state.base[file] = { doc: next, sha: newSha };
            const done = new Set(ops.map((o) => o.id));
            state.pending = state.pending.filter((o) => !done.has(o.id));
            persist();
            recompute();
            break;
          } catch (e) {
            if (e instanceof GitHubError && e.isConflict && attempt < 3) continue;
            throw e;
          }
        }
      }
      setStatus('saved');
    } catch (e) {
      if (e instanceof GitHubError && e.isNetwork) setStatus('offline', 'Will sync later');
      else if (e instanceof GitHubError && e.isAuth) setStatus('error', 'Your key was refused — check Settings');
      else setStatus('error', e?.message || 'Couldn’t save');
    } finally {
      flushing = null;
    }
    if (flushAgain) { flushAgain = false; return flush(); }
  })();
  return flushing;
}

export const pendingCount = () => state.pending.length;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.loaded) refresh();
  });
}
