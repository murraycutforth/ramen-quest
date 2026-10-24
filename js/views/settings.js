import {
  data, getMe, setMe, getToken, setToken, removeToken, getRepo, setRepo, refresh, flush, pendingCount, dispatch, getState,
} from '../store.js';
import { PEOPLE, OXFORD_CENTRE, DEFAULT_REPO } from '../config.js';
import { testConnection } from '../github.js';
import { html, raw, toast, todayISO } from '../ui.js';
import { newId, slugify } from '../ops.js';
import { loadLeaflet, OSM_TILES, OSM_ATTRIBUTION } from './map.js';

let el;
let miniMap = null;
let pickMarker = null;

export function initSettings(container) {
  el = container;
  el.addEventListener('change', onChange);
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('toggle', (e) => { if (e.target.id === 'add-restaurant' && e.target.open) initMiniMap(); }, true);
}

export function renderSettings() {
  if (!el) return;
  // Don't clobber a half-filled form when data changes in the background.
  if (el.contains(document.activeElement) && el.querySelector('form')) return;
  const me = getMe();
  const token = getToken();
  const repo = getRepo();
  const pending = pendingCount();
  const st = getState();

  el.innerHTML = html`
    <div class="settings">
      <section class="panel">
        <h2>Who’s holding this phone?</h2>
        <div class="segmented segmented-big" role="radiogroup" aria-label="Who am I">
          ${PEOPLE.map((p) => html`<label><input type="radio" name="me" value="${p.id}" ${p.id === me ? raw('checked') : ''}><span><span class="avatar avatar-${p.id}" aria-hidden="true">${p.initial}</span> ${p.name}</span></label>`)}
        </div>
      </section>

      <section class="panel">
        <h2>Saving key</h2>
        <p class="muted">A GitHub fine-grained token for <b>${repo.owner}/${repo.repo}</b> only, with <i>Contents: read &amp; write</i>. It stays on this device.</p>
        <form class="token-form" data-form="token" autocomplete="off">
          <label class="field-label" for="token">GitHub token</label>
          <div class="input-row">
            <input id="token" name="token" type="password" autocomplete="off" spellcheck="false" placeholder="${token ? '•••••••• saved' : 'github_pat_…'}">
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>
        <div class="btn-row">
          <button class="btn" type="button" data-action="test" ${token ? '' : raw('disabled')}>Test connection</button>
          <button class="btn btn-danger-outline" type="button" data-action="remove-token" ${token ? '' : raw('disabled')}>Remove token</button>
        </div>
        <p class="test-result" role="status"></p>
      </section>

      <section class="panel">
        <h2>Sync</h2>
        <p class="muted">${pending ? `${pending} change${pending > 1 ? 's' : ''} waiting to sync.` : 'Everything’s synced.'}
          ${st.source === 'static' ? ' Reading from the published copy (may lag a minute).' : ''}
          ${st.status === 'error' ? html` <span class="error-text">${st.statusDetail}</span>` : ''}</p>
        <div class="btn-row">
          <button class="btn" type="button" data-action="sync">Sync now</button>
          <button class="btn" type="button" data-action="export">Export data (JSON)</button>
        </div>
      </section>

      <details class="panel" id="add-restaurant">
        <summary><h2>Add a restaurant</h2></summary>
        <form class="add-form" data-form="add">
          <div class="field"><label class="field-label" for="r-name">Name</label><input id="r-name" name="name" required maxlength="80"></div>
          <div class="field"><label class="field-label" for="r-address">Address</label><input id="r-address" name="address" required maxlength="140"></div>
          <div class="field"><label class="field-label" for="r-area">Area</label><input id="r-area" name="area" placeholder="e.g. Jericho" required maxlength="40"></div>
          <div class="field"><label class="field-label" for="r-website">Website <small>(optional)</small></label><input id="r-website" name="website" type="url" placeholder="https://"></div>
          <div class="field"><label class="field-label" for="r-tags">Tags <small>(comma separated)</small></label><input id="r-tags" name="tags" placeholder="independent, tonkotsu"></div>
          <label class="check"><input type="checkbox" name="bonus"> Side quest (chain, or ramen isn’t the main thing)</label>
          <div class="field">
            <span class="field-label">Location <small>(tap the map)</small></span>
            <div class="mini-map" id="mini-map" aria-label="Tap to set the restaurant's location"></div>
            <p class="muted pick-coords">No location picked yet.</p>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn btn-primary btn-wide" type="submit" ${token ? '' : raw('disabled')}>Add to the quest</button>
          ${!token ? html`<p class="hint">Add your key above to save restaurants.</p>` : ''}
        </form>
      </details>

      <details class="panel">
        <summary><h2>Repository</h2></summary>
        <form data-form="repo">
          <div class="field"><label class="field-label" for="owner">Owner</label><input id="owner" name="owner" value="${repo.owner}" required></div>
          <div class="field"><label class="field-label" for="repo">Repo</label><input id="repo" name="repo" value="${repo.repo}" required></div>
          <div class="field"><label class="field-label" for="branch">Branch</label><input id="branch" name="branch" value="${repo.branch}" required></div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit">Save</button>
            <button class="btn" type="button" data-action="reset-repo">Reset to default</button>
          </div>
        </form>
      </details>

      <p class="muted small center">Ratings and notes live in a public GitHub repo, so keep notes friendly.<br>
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.</p>
    </div>`.s;
  miniMap = null;
  pickMarker = null;
}

function onChange(e) {
  if (e.target.name === 'me') {
    setMe(e.target.value);
    toast(`Hi ${PEOPLE.find((p) => p.id === e.target.value).name}! 👋`);
  }
}

async function onClick(e) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const out = el.querySelector('.test-result');
  if (action === 'test') {
    out.textContent = 'Checking…';
    try {
      const r = await testConnection(getRepo(), getToken());
      out.textContent = `✓ Can read the data.${r.canPush ? ' Your account can write to this repo; the first save will confirm the token can too.' : ' ⚠️ No write access to this repo.'}`;
    } catch (err) {
      out.textContent = err.isAuth
        ? '✗ GitHub refused this token. Check it’s for this repo with Contents access.'
        : err.status === 404
          ? '✗ Repo or data file not found. Check the repo settings, and that this token can see it.'
          : `✗ ${err.message}`;
    }
  } else if (action === 'remove-token') {
    removeToken();
    renderSettings();
    toast('Token removed from this device');
  } else if (action === 'sync') {
    await flush();
    await refresh();
    toast(pendingCount() ? 'Still some changes waiting to sync' : 'All synced ✓');
  } else if (action === 'export') {
    const { restaurants, visits } = data();
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), restaurants, visits }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ramen-quest-${todayISO()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if (action === 'reset-repo') {
    setRepo({});
    renderSettings();
    refresh();
  }
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const kind = form.dataset.form;

  if (kind === 'token') {
    const t = String(f.get('token') || '').trim();
    if (!t) return;
    setToken(t);
    form.reset();
    renderSettings();
    toast('Key saved on this device 🔑');
  } else if (kind === 'repo') {
    const cfg = { owner: f.get('owner').trim(), repo: f.get('repo').trim(), branch: f.get('branch').trim() || DEFAULT_REPO.branch };
    setRepo(cfg);
    toast('Repo saved');
    document.activeElement?.blur();
    refresh();
  } else if (kind === 'add') {
    const err = form.querySelector('.form-error');
    const name = String(f.get('name')).trim();
    const id = slugify(name);
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (!name || !id) return fail('Give it a name.');
    if (data().restaurants.some((r) => r.id === id)) return fail('That one’s already on the list.');
    if (!pickMarker) return fail('Tap the map to set where it is.');
    const website = String(f.get('website') || '').trim();
    if (website && !/^https:\/\//.test(website)) return fail('Website should start with https://');
    const { lat, lng } = pickMarker.getLatLng();
    const restaurant = {
      id,
      name,
      address: String(f.get('address')).trim(),
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      area: String(f.get('area')).trim(),
      website,
      tags: String(f.get('tags') || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      bonus: f.get('bonus') === 'on',
      active: true,
      addedAt: todayISO(),
    };
    if (!restaurant.address || !restaurant.area) return fail('Address and area are needed too.');
    dispatch({ kind: 'addRestaurant', id: newId(), restaurant });
    document.activeElement?.blur();
    toast(`${name} added to the quest 📍`, { flourish: true });
    renderSettings();
  }
}

async function initMiniMap() {
  if (miniMap) return;
  const L = await loadLeaflet();
  const node = el.querySelector('#mini-map');
  if (!node) return;
  miniMap = L.map(node, { zoomControl: true }).setView(OXFORD_CENTRE, 13);
  L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(miniMap);
  miniMap.on('click', (e) => {
    if (!pickMarker) pickMarker = L.marker(e.latlng, { draggable: true }).addTo(miniMap);
    else pickMarker.setLatLng(e.latlng);
    const show = () => {
      const { lat, lng } = pickMarker.getLatLng();
      el.querySelector('.pick-coords').textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    };
    pickMarker.off('dragend').on('dragend', show);
    show();
  });
  setTimeout(() => miniMap.invalidateSize(), 50);
}
