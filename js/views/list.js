import { data, pref, setPref } from '../store.js';
import { restaurantScores, isVisited, distanceKm, fmtScore } from '../scoring.js';
import { html, raw, bowls, personScores, icon, reducedMotion } from '../ui.js';
import { getPosition, hasGeoPermission, lastPosition } from '../geo.js';
import { navigate } from '../router.js';

const FILTERS = [
  ['all', 'All'],
  ['todo', 'To try'],
  ['visited', 'Visited'],
  ['side', 'Side quests'],
];

let el;
let geoGranted = false;

export function initList(container) {
  el = container;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  hasGeoPermission().then((ok) => {
    geoGranted = ok || !!lastPosition();
    if (geoGranted) renderList();
  });
}

function statusChip(r, s) {
  if (!r.active) return html`<span class="chip chip-closed">Closed 🥲</span>`;
  if (s.visitCount) return html`<span class="chip chip-visited">Visited${s.visitCount > 1 ? ` ×${s.visitCount}` : ''}</span>`;
  return html`<span class="chip chip-todo">To try</span>`;
}

function card(r, s, dist) {
  return html`
    <li>
      <a class="card${r.active ? '' : ' is-closed'}${r.bonus ? ' is-side' : ''}" href="#list/r/${r.id}">
        <div class="card-top">
          <h3 class="card-title">${r.name}</h3>
          ${statusChip(r, s)}
        </div>
        <p class="card-meta">${r.area}${r.bonus ? ' · side quest' : ''}${dist != null ? ` · ${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}` : ''}</p>
        ${r.tags.length ? html`<ul class="tags">${r.tags.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
        ${s.combined != null
          ? html`<div class="card-score">${bowls(s.combined)}<span class="score-num">${fmtScore(s.combined)}</span>${personScores(s.people, s)}</div>`
          : ''}
      </a>
    </li>`;
}

export function renderList() {
  if (!el) return;
  const { restaurants, visits } = data();
  const filter = pref('filter', 'all');
  const sortOpts = [
    ['score', 'Our score'],
    ['az', 'A–Z'],
    ['recent', 'Most recent visit'],
    ...(geoGranted ? [['near', 'Nearest']] : []),
  ];
  let sort = pref('sort', 'score');
  if (!sortOpts.some(([k]) => k === sort)) sort = 'score';

  const pos = sort === 'near' ? lastPosition() : null;
  let rows = restaurants.map((r) => ({
    r,
    s: restaurantScores(visits, r.id),
    dist: pos ? distanceKm(pos, r) : null,
  }));

  rows = rows.filter(({ r, s }) => {
    if (filter === 'todo') return !r.bonus && r.active && !s.visitCount;
    if (filter === 'visited') return s.visitCount > 0;
    if (filter === 'side') return r.bonus;
    return true;
  });

  const byName = (a, b) => a.r.name.localeCompare(b.r.name);
  const sorters = {
    score: (a, b) => (b.s.combined ?? -1) - (a.s.combined ?? -1) || byName(a, b),
    az: byName,
    recent: (a, b) => (b.s.lastVisit ?? '').localeCompare(a.s.lastVisit ?? '') || byName(a, b),
    near: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9),
  };
  rows.sort(sorters[sort]);
  // Closed places sink to the bottom whatever the sort.
  rows.sort((a, b) => Number(!a.r.active) - Number(!b.r.active));

  const anyTodo = restaurants.some((r) => !r.bonus && r.active && !isVisited(visits, r.id));

  el.innerHTML = html`
    <div class="list-tools">
      <div class="segmented" role="radiogroup" aria-label="Filter restaurants">
        ${FILTERS.map(
          ([k, label]) => html`<label><input type="radio" name="filter" value="${k}" ${k === filter ? raw('checked') : ''}><span>${label}</span></label>`,
        )}
      </div>
      <div class="list-row">
        <label class="sort">
          <span class="sr-only">Sort by</span>
          ${icon('sort')}
          <select name="sort">
            ${sortOpts.map(([k, label]) => html`<option value="${k}" ${k === sort ? raw('selected') : ''}>${label}</option>`)}
          </select>
        </label>
        <button class="btn btn-spin" type="button" data-action="spin" ${anyTodo ? '' : raw('disabled')}>
          <span class="chopsticks" aria-hidden="true">🥢</span> Spin the chopsticks
        </button>
      </div>
    </div>
    ${rows.length
      ? html`<ul class="cards">${rows.map(({ r, s, dist }) => card(r, s, dist))}</ul>`
      : html`<p class="empty">${filter === 'todo' ? 'Nothing left to try. Look at you two! 🎉' : filter === 'visited' ? 'No bowls slurped yet. Time to go out for ramen.' : 'Nothing here yet.'}</p>`}
  `;
}

function onChange(e) {
  if (e.target.name === 'filter') { setPref('filter', e.target.value); renderList(); }
  if (e.target.name === 'sort') {
    const v = e.target.value;
    if (v === 'near') {
      getPosition().then(() => { setPref('sort', v); renderList(); }).catch(() => { setPref('sort', 'score'); renderList(); });
    } else { setPref('sort', v); renderList(); }
  }
}

function onClick(e) {
  if (e.target.closest('[data-action="spin"]')) spin();
}

/** Pick a random unvisited main-quest restaurant, with a little spinning flourish. */
export function spin() {
  const { restaurants, visits } = data();
  const pool = restaurants.filter((r) => !r.bonus && r.active && !isVisited(visits, r.id));
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (reducedMotion() || pool.length === 1) { navigate(`#list/r/${pick.id}`); return; }

  const overlay = document.createElement('div');
  overlay.className = 'spin-overlay';
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `<div class="spin-card"><div class="spin-sticks" aria-hidden="true">🥢</div><p class="spin-name"></p></div>`;
  document.body.append(overlay);
  const name = overlay.querySelector('.spin-name');
  let i = 0;
  let delay = 60;
  const tick = () => {
    name.textContent = pool[i++ % pool.length].name;
    delay *= 1.18;
    if (delay < 320) setTimeout(tick, delay);
    else {
      name.textContent = pick.name;
      overlay.classList.add('landed');
      setTimeout(() => { overlay.remove(); navigate(`#list/r/${pick.id}`); }, 750);
    }
  };
  tick();
}
