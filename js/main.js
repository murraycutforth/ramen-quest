// Boot, routing, header + tab bar.

import { data, subscribe, refresh, getState, getMe, setMe, hasToken, pendingCount, storage } from './store.js';
import { progress } from './scoring.js';
import { PEOPLE } from './config.js';
import { startRouter, onRoute, closeOverlay, back, current } from './router.js';
import { initSheet, openSheet, closeSheet, sheetKey, sheetBody } from './sheet.js';
import { html, statusChip, confetti, esc } from './ui.js';
import { initList, renderList } from './views/list.js';
import { initMap, showMap, renderMarkers, focusRestaurant, clearFocus } from './views/map.js';
import { initStats, renderStats } from './views/stats.js';
import { initSettings, renderSettings } from './views/settings.js';
import { renderDetail, bindDetail } from './views/detail.js';
import { renderRate } from './views/rate.js';

const views = {
  list: document.getElementById('v-list'),
  map: document.getElementById('v-map'),
  stats: document.getElementById('v-stats'),
  settings: document.getElementById('v-settings'),
};

initList(views.list);
initMap(views.map);
initStats(views.stats);
initSettings(views.settings);
initSheet(closeOverlay);
bindDetail(sheetBody());

// ── Header ──────────────────────────────────────────────────────────────────
function renderHeader() {
  const { restaurants, visits } = data();
  const p = progress(restaurants, visits);
  const pct = p.mainTotal ? (p.mainVisited / p.mainTotal) * 100 : 0;
  const bar = document.querySelector('.progress');
  bar.setAttribute('aria-valuenow', String(p.mainVisited));
  bar.setAttribute('aria-valuemax', String(p.mainTotal));
  bar.setAttribute('aria-valuetext', `${p.mainVisited} of ${p.mainTotal} bowls slurped`);
  bar.querySelector('span').style.width = `${pct}%`;

  const visitedIds = new Set(visits.map((v) => v.restaurantId));
  document.querySelector('.bowl-row').innerHTML = p.main
    .map((r) => `<li title="${esc(r.name)}" class="${visitedIds.has(r.id) ? 'done' : ''}"><svg class="ico" aria-hidden="true"><use href="#i-${visitedIds.has(r.id) ? 'bowl' : 'bowl-outline'}"/></svg></li>`)
    .join('');

  document.querySelector('.progress-text').innerHTML = html`<b>${p.mainVisited} of ${p.mainTotal}</b> bowls slurped${p.sideTotal ? html` · ${p.sideVisited} side quest${p.sideVisited === 1 ? '' : 's'}` : ''}`.s;

  const chip = statusChip(getState(), { hasToken: hasToken(), pending: pendingCount() });
  const chipEl = document.getElementById('sync-chip');
  chipEl.hidden = !chip;
  if (chip) {
    chipEl.className = `sync-chip sync-${chip.cls}`;
    chipEl.textContent = chip.text;
    chipEl.title = chip.title || '';
  }
}

// Clear "saved ✓" after a moment so the header stays calm.
let savedTimer;
function settleChip() {
  clearTimeout(savedTimer);
  if (getState().status === 'saved') {
    savedTimer = setTimeout(() => { getState().status = 'idle'; renderHeader(); }, 2500);
  }
}

// ── Celebration (once per device) ───────────────────────────────────────────
function maybeCelebrate() {
  const { restaurants, visits } = data();
  const p = progress(restaurants, visits);
  if (p.complete && getState().loaded && !storage.get('rq.celebrated')) {
    storage.set('rq.celebrated', true);
    confetti(120);
    setTimeout(() => (location.hash = '#stats'), 400);
  }
}

// ── Routing ─────────────────────────────────────────────────────────────────
let activeBase = null;

function renderBase(base) {
  if (base === 'list') renderList();
  if (base === 'stats') renderStats();
  if (base === 'settings') renderSettings();
  if (base === 'map') showMap();
}

// Deep links can arrive before data has loaded (fresh device, or a visit made on the
// other phone). Wait for the first refresh rather than flashing "not found".
let deferredOverlay = false;
function resolvable({ overlay }) {
  const { restaurants, visits } = data();
  if (!restaurants.some((r) => r.id === overlay.restaurantId)) return false;
  return !overlay.visitId || visits.some((v) => v.id === overlay.visitId);
}

function renderOverlay(route) {
  const { base, overlay } = route;
  deferredOverlay = false;
  if (overlay && !getState().loaded && !resolvable(route)) {
    deferredOverlay = true;
    return;
  }
  if (!overlay) {
    closeSheet();
    clearFocus();
    return;
  }
  if (overlay.kind === 'detail') {
    openSheet(renderDetail(overlay.restaurantId, base), {
      size: base === 'map' ? 'half' : 'full',
      key: `detail:${overlay.restaurantId}`,
    });
    if (base === 'map') focusRestaurant(overlay.restaurantId);
  } else if (overlay.kind === 'rate') {
    const node = renderRate(overlay.restaurantId, overlay.visitId, {
      onDone: () => back(`#${base}/r/${overlay.restaurantId}`),
    });
    openSheet(node, { size: 'full', key: `rate:${overlay.restaurantId}:${overlay.visitId || 'new'}` });
  }
}

onRoute((route) => {
  if (route.base !== activeBase) {
    for (const [name, node] of Object.entries(views)) node.hidden = name !== route.base;
    document.body.dataset.view = route.base;
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.tab === route.base) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    activeBase = route.base;
    renderBase(route.base);
    if (!route.overlay) document.getElementById('main').scrollTop = 0;
  }
  renderOverlay(route);
});

subscribe(() => {
  renderHeader();
  settleChip();
  const route = current();
  if (route.base === 'list') renderList();
  if (route.base === 'stats') renderStats();
  renderMarkers();
  if (deferredOverlay && getState().loaded) renderOverlay(route);
  // Live-update an open detail sheet (never the rate form — that would eat your typing).
  if (route.overlay?.kind === 'detail' && sheetKey() === `detail:${route.overlay.restaurantId}`) {
    const body = sheetBody();
    const top = body.scrollTop;
    body.innerHTML = renderDetail(route.overlay.restaurantId, route.base);
    body.scrollTop = top;
  }
  maybeCelebrate();
});

// ── First run: who's holding this phone? ────────────────────────────────────
function askWhoAmI() {
  if (getMe()) return;
  const dlg = document.getElementById('whoami');
  dlg.innerHTML = `
    <form method="dialog" class="whoami">
      <svg class="ico ico-hero" aria-hidden="true"><use href="#i-naruto"/></svg>
      <h2 id="whoami-title">Who’s holding this phone?</h2>
      <p class="muted">So your ratings go under the right name. You can change it in Settings.</p>
      <div class="whoami-btns">
        ${PEOPLE.map((p) => `<button class="btn btn-primary btn-big" value="${p.id}"><span class="avatar avatar-${p.id}" aria-hidden="true">${p.initial}</span> ${p.name}</button>`).join('')}
      </div>
    </form>`;
  dlg.addEventListener('close', () => {
    if (PEOPLE.some((p) => p.id === dlg.returnValue)) setMe(dlg.returnValue);
  }, { once: true });
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

// ── Boot ────────────────────────────────────────────────────────────────────
renderHeader();
startRouter();
refresh().then(() => {
  renderHeader();
  askWhoAmI();
});

window.addEventListener('online', renderHeader);
window.addEventListener('offline', renderHeader);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
