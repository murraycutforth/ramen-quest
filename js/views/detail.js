import { data, getMe, hasToken, dispatch } from '../store.js';
import { restaurantScores, subScores, visitsFor, fmtScore } from '../scoring.js';
import { PEOPLE, SUB_SCORES } from '../config.js';
import { html, bowls, icon, fmtDate, directionsUrl, toast } from '../ui.js';
import { newId } from '../ops.js';

export function renderDetail(restaurantId, base) {
  const { restaurants, visits } = data();
  const r = restaurants.find((x) => x.id === restaurantId);
  if (!r) {
    return html`<div class="sheet-head"><h2 id="sheet-title">Hmm, no such bowl</h2></div>
      <p class="empty">We couldn’t find that restaurant. It may have been renamed.</p>`.s;
  }
  const me = getMe() || PEOPLE[0].id;
  const s = restaurantScores(visits, r.id);
  const subs = subScores(visits, r.id);
  const vs = visitsFor(visits, r.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const needsMine = vs.find((v) => !v.ratings[me]);
  const anySubs = SUB_SCORES.some((x) => subs[x.id] != null);
  const rateHref = (vid) => `#${base}/rate/${r.id}${vid ? `/${vid}` : ''}`;

  return html`
    <div class="sheet-head">
      <h2 id="sheet-title">${r.name}</h2>
      <p class="detail-meta">
        ${!r.active ? html`<span class="chip chip-closed">Closed 🥲</span>` : s.visitCount ? html`<span class="chip chip-visited">Visited${s.visitCount > 1 ? ` ×${s.visitCount}` : ''}</span>` : html`<span class="chip chip-todo">To try</span>`}
        ${r.bonus ? html`<span class="chip chip-side">Side quest</span>` : ''}
        <span>${r.area}</span>
      </p>
    </div>

    <p class="detail-address">${icon('pin')} ${r.address}</p>
    ${r.tags.length ? html`<ul class="tags">${r.tags.map((t) => html`<li>${t}</li>`)}</ul>` : ''}

    <div class="detail-actions">
      ${r.active
        ? needsMine
          ? html`<a class="btn btn-primary" href="${rateHref(needsMine.id)}">${icon('bowl')} Add my rating</a>
                 <a class="btn" href="${rateHref()}">Log a new visit</a>`
          : html`<a class="btn btn-primary" href="${rateHref()}">${icon('bowl')} Log a visit</a>`
        : ''}
      <a class="btn" href="${directionsUrl(r)}" target="_blank" rel="noopener">${icon('directions')} Directions</a>
      ${r.website ? html`<a class="btn" href="${r.website}" target="_blank" rel="noopener">${icon('link')} Website</a>` : ''}
    </div>
    ${!hasToken() ? html`<p class="hint">🔑 <a href="#settings">Add your key in Settings</a> to save ratings.</p>` : ''}

    ${s.combined != null
      ? html`
        <section class="score-summary" aria-label="Scores">
          <div class="score-combined">
            ${bowls(s.combined, { size: 'lg' })}
            <span class="score-big">${fmtScore(s.combined)}</span>
            <span class="score-label">our score</span>
          </div>
          <ul class="score-people">
            ${PEOPLE.map((p) => html`
              <li class="who-${p.id}">
                <span class="avatar" aria-hidden="true">${p.initial}</span>
                <span class="who-name">${p.name}</span>
                ${s.people[p.id] != null ? html`${bowls(s.people[p.id])}<b>${fmtScore(s.people[p.id])}</b>` : html`<span class="badge badge-wait">waiting for ${p.name}</span>`}
              </li>`)}
          </ul>
          ${anySubs
            ? html`<ul class="subbars">
                ${SUB_SCORES.filter((x) => subs[x.id] != null).map((x) => html`
                  <li><span>${x.label}</span><span class="bar"><i style="width:${(subs[x.id] / 5) * 100}%"></i></span><b>${fmtScore(subs[x.id])}</b></li>`)}
              </ul>`
            : ''}
        </section>`
      : ''}

    <section class="history" aria-label="Visits">
      <h3>Visits</h3>
      ${vs.length
        ? html`<ol class="visit-list">${vs.map((v) => visitItem(v, me, rateHref))}</ol>`
        : html`<p class="empty-small">No visits yet. ${r.active ? 'This one’s waiting for you. 🍜' : ''}</p>`}
    </section>`.s;
}

function visitItem(v, me, rateHref) {
  return html`
    <li class="visit">
      <div class="visit-head">
        <time datetime="${v.date}">${fmtDate(v.date)}</time>
        <button class="link-btn danger" type="button" data-delete-visit="${v.id}">Delete visit</button>
      </div>
      <ul class="visit-ratings">
        ${PEOPLE.map((p) => {
          const rt = v.ratings[p.id];
          if (!rt) {
            return html`<li class="visit-rating who-${p.id} is-missing">
              <span class="avatar" aria-hidden="true">${p.initial}</span>
              <span>${p.id === me ? 'You haven’t rated this one yet.' : `Waiting for ${p.name}…`}</span>
              ${p.id === me ? html`<a class="link-btn" href="${rateHref(v.id)}">Add my rating</a>` : ''}
            </li>`;
          }
          return html`<li class="visit-rating who-${p.id}">
            <span class="avatar" aria-hidden="true">${p.initial}</span>
            <div>
              <div class="visit-score">${bowls(rt.overall)} <b>${fmtScore(rt.overall)}</b>
                ${p.id === me ? html`<a class="link-btn" href="${rateHref(v.id)}">Edit</a>` : ''}</div>
              ${rt.dish ? html`<p class="visit-dish">🍜 ${rt.dish}</p>` : ''}
              ${rt.note ? html`<p class="visit-note">“${rt.note}”</p>` : ''}
            </div>
          </li>`;
        })}
      </ul>
    </li>`;
}

/** Wire up the sheet's buttons once (event delegation on the sheet body). */
export function bindDetail(body) {
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-visit]');
    if (!btn) return;
    if (!hasToken()) { toast('Add your key in Settings first'); return; }
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to delete';
      setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Delete visit'; } }, 4000);
      return;
    }
    const visit = data().visits.find((v) => v.id === btn.dataset.deleteVisit);
    if (!visit) return;
    dispatch({ kind: 'deleteVisit', id: newId(), visitId: visit.id, restaurantId: visit.restaurantId, at: new Date().toISOString() });
    toast('Visit deleted');
  });
}

