import { data, getMe, hasToken, dispatch } from '../store.js';
import { PEOPLE, SUB_SCORES, personName } from '../config.js';
import { html, raw, icon, toast, todayISO, fmtDate } from '../ui.js';
import { newId } from '../ops.js';

const HALF_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

function bowlRater(value) {
  let slots = '';
  for (let b = 1; b <= 5; b++) {
    const halves = [b - 0.5, b]
      .map(
        (v, j) => `<label class="half half-${j ? 'r' : 'l'}">
          <input type="radio" name="overall" value="${v}" ${v === value ? 'checked' : ''} required>
          <span class="sr-only">${v} ${v === 1 ? 'bowl' : 'bowls'}</span>
        </label>`,
      )
      .join('');
    slots += `<span class="rater-bowl" data-bowl="${b}">
        <svg class="ico" aria-hidden="true"><use href="#i-bowl-outline"/></svg>
        <span class="bowl-fill"><svg class="ico" aria-hidden="true"><use href="#i-bowl"/></svg></span>
        ${halves}
      </span>`;
  }
  return raw(`<div class="rater" role="radiogroup" aria-labelledby="overall-label" aria-required="true">${slots}</div>`);
}

function chipRow(sub, value) {
  return html`
    <fieldset class="chips">
      <legend>${sub.label}</legend>
      ${[1, 2, 3, 4, 5].map((n) => html`
        <label class="chip-opt"><input type="radio" name="${sub.id}" value="${n}" ${n === value ? raw('checked') : ''}><span>${n}</span></label>`)}
    </fieldset>`;
}

export function renderRate(restaurantId, visitId, { onDone }) {
  const { restaurants, visits } = data();
  const r = restaurants.find((x) => x.id === restaurantId);
  const visit = visitId ? visits.find((v) => v.id === visitId) : null;
  const wrap = document.createElement('div');
  if (!r || (visitId && !visit)) {
    wrap.innerHTML = `<div class="sheet-head"><h2 id="sheet-title">Can’t find that visit</h2></div><p class="empty">It may have been deleted on the other phone.</p>`;
    return wrap;
  }

  let who = getMe() || PEOPLE[0].id;
  const canSave = hasToken();

  const draw = () => {
    const rt = visit?.ratings[who] || {};
    const hasSubs = SUB_SCORES.some((s) => rt[s.id] != null);
    wrap.innerHTML = html`
      <form class="rate-form" novalidate>
        <div class="sheet-head">
          <h2 id="sheet-title">${visit ? 'Rate this visit' : 'Log a visit'}</h2>
          <p class="detail-meta"><span>${r.name}</span>${visit ? html` · <span>${fmtDate(visit.date)}</span>` : ''}</p>
        </div>

        <label class="as-who">
          Rating as
          <select name="who">
            ${PEOPLE.map((p) => html`<option value="${p.id}" ${p.id === who ? raw('selected') : ''}>${p.name}</option>`)}
          </select>
        </label>

        <div class="field">
          <span class="field-label" id="overall-label">Overall <small>(tap the left half of a bowl for ½)</small></span>
          ${bowlRater(rt.overall ?? null)}
          <output class="rater-value" aria-live="polite">${rt.overall ? `${rt.overall} / 5` : 'Pick a score'}</output>
        </div>

        <details class="more" ${hasSubs ? raw('open') : ''}>
          <summary>More detail <small>(optional)</small></summary>
          ${SUB_SCORES.map((s) => chipRow(s, rt[s.id] ?? null))}
        </details>

        <div class="field">
          <label class="field-label" for="dish">What did you order?</label>
          <input id="dish" name="dish" type="text" maxlength="80" autocomplete="off" placeholder="e.g. Spicy tonkotsu" value="${rt.dish ?? ''}">
        </div>
        <div class="field">
          <label class="field-label" for="note">Notes</label>
          <textarea id="note" name="note" rows="3" maxlength="500" placeholder="Broth, queue, would we go back? (these are public)">${rt.note ?? ''}</textarea>
        </div>
        ${!visit
          ? html`<div class="field">
              <label class="field-label" for="date">Date</label>
              <input id="date" name="date" type="date" value="${todayISO()}" max="${todayISO()}" required>
            </div>`
          : ''}

        ${!canSave ? html`<p class="hint">🔑 <a href="#settings">Add your key in Settings</a> to save ratings.</p>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions">
          <button class="btn btn-primary btn-wide" type="submit" ${canSave ? '' : raw('disabled')}>${icon('bowl')} Save ${personName(who)}’s rating</button>
          ${visit?.ratings[who] ? html`<button class="link-btn danger" type="button" data-unrate>Delete ${personName(who)}’s rating</button>` : ''}
        </div>
      </form>`.s;
    syncRater();
  };

  const form = () => wrap.querySelector('form');

  const syncRater = () => {
    const checked = wrap.querySelector('input[name="overall"]:checked');
    const v = checked ? Number(checked.value) : 0;
    wrap.querySelectorAll('.rater-bowl').forEach((b) => {
      const n = Number(b.dataset.bowl);
      b.querySelector('.bowl-fill').style.width = `${Math.max(0, Math.min(1, v - (n - 1))) * 100}%`;
    });
    const out = wrap.querySelector('.rater-value');
    if (out) out.textContent = v ? `${v} / 5` : 'Pick a score';
  };

  // Tapping an already-selected sub-score chip clears it (sub-scores are optional).
  let wasChecked = null;
  wrap.addEventListener('pointerdown', (e) => {
    const input = e.target.closest('.chip-opt')?.querySelector('input');
    wasChecked = input?.checked ? input : null;
  });
  wrap.addEventListener('click', (e) => {
    const input = e.target.closest('.chip-opt')?.querySelector('input');
    if (input && input === wasChecked && e.target === input) { input.checked = false; wasChecked = null; }
    if (e.target.closest('[data-unrate]')) unrate(e.target.closest('[data-unrate]'));
  });

  wrap.addEventListener('change', (e) => {
    if (e.target.name === 'who') { who = e.target.value; draw(); return; }
    if (e.target.name === 'overall') syncRater();
  });

  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form());
    const overall = Number(f.get('overall'));
    const err = wrap.querySelector('.form-error');
    if (!HALF_STEPS.includes(overall) || overall < 1) {
      err.textContent = 'Pick an overall score: at least 1 bowl.';
      err.hidden = false;
      wrap.querySelector('input[name="overall"]').focus();
      return;
    }
    const rating = { overall };
    for (const s of SUB_SCORES) if (f.get(s.id)) rating[s.id] = Number(f.get(s.id));
    const dish = String(f.get('dish') || '').trim();
    const note = String(f.get('note') || '').trim();
    if (dish) rating.dish = dish;
    if (note) rating.note = note;
    rating.updatedAt = new Date().toISOString();

    dispatch({
      kind: 'rate',
      id: newId(),
      visitId: visit?.id ?? newId(),
      restaurantId: r.id,
      date: visit ? visit.date : String(f.get('date') || todayISO()),
      person: who,
      rating,
    });
    toast(`${personName(who)} gave ${r.name} ${overall} 🍜`, { flourish: true });
    onDone();
  });

  const unrate = (btn) => {
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to delete';
      return;
    }
    dispatch({ kind: 'unrate', id: newId(), visitId: visit.id, restaurantId: r.id, person: who, at: new Date().toISOString() });
    toast('Rating deleted');
    onDone();
  };

  draw();
  return wrap;
}

