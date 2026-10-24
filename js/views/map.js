import { data } from '../store.js';
import { restaurantScores, fmtScore } from '../scoring.js';
import { esc } from '../ui.js';
import { getPosition, onPosition } from '../geo.js';
import { navigate } from '../router.js';
import { OXFORD_CENTRE } from '../config.js';

const LEAFLET = {
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  cssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  jsSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};

let leafletPromise = null;

/** Load Leaflet on first use only, so the List view stays light. */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement('link'), {
      rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: '',
    });
    const script = Object.assign(document.createElement('script'), {
      src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: '', async: true,
    });
    // Wait for the stylesheet too, or Leaflet measures an unstyled container.
    const loaded = (node) => new Promise((ok, fail) => { node.onload = ok; node.onerror = fail; });
    Promise.all([loaded(link), loaded(script)])
      .then(() => resolve(window.L))
      .catch(() => { leafletPromise = null; link.remove(); script.remove(); reject(new Error('Could not load the map')); });
    document.head.append(link, script);
  });
  return leafletPromise;
}

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let el;
let map = null;
let markers = new Map();
let meMarker = null;
let fitted = false;
let selectedId = null;

export function initMap(container) {
  el = container;
  el.innerHTML = `
    <div class="map-wrap">
      <div id="map" class="map" role="application" aria-label="Map of ramen restaurants"></div>
      <button class="map-btn map-locate" type="button" aria-label="Show my location">
        <svg class="ico" aria-hidden="true"><use href="#i-locate"/></svg>
      </button>
      <div class="map-legend" aria-hidden="true">
        <span><i class="dot dot-todo"></i>to try</span>
        <span><i class="dot dot-visited"></i>visited</span>
        <span><i class="dot dot-closed"></i>closed</span>
      </div>
    </div>`;
  el.querySelector('.map-locate').addEventListener('click', locate);
  onPosition(showMe);
}

function markerHtml(r, s) {
  const state = !r.active ? 'closed' : s.visitCount ? 'visited' : 'todo';
  const glyph = state === 'visited' ? 'bowl' : 'bowl-outline';
  return `<div class="pin pin-${state}${r.bonus ? ' pin-side' : ''}${r.id === selectedId ? ' pin-selected' : ''}">
      <svg class="ico" aria-hidden="true"><use href="#i-${glyph}"/></svg>
      ${s.combined != null ? `<b>${fmtScore(s.combined)}</b>` : ''}
    </div>`;
}

export async function showMap() {
  let L;
  try {
    L = await loadLeaflet();
  } catch (e) {
    el.querySelector('#map').innerHTML = `<p class="empty">${esc(e.message)}. Check your connection and try again.</p>`;
    return;
  }
  if (!map) {
    map = L.map('map', { zoomControl: false, tap: true }).setView(OXFORD_CENTRE, 14);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
  }
  map.invalidateSize();
  renderMarkers();
}

export function renderMarkers() {
  if (!map) return;
  const L = window.L;
  const { restaurants, visits } = data();
  const seen = new Set();
  for (const r of restaurants) {
    seen.add(r.id);
    const s = restaurantScores(visits, r.id);
    const size = r.bonus ? 34 : 44;
    const iconOpts = L.divIcon({
      className: 'pin-icon',
      html: markerHtml(r, s),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    const label = `${r.name}${!r.active ? ', closed' : s.visitCount ? `, visited, score ${fmtScore(s.combined)}` : ', to try'}`;
    let m = markers.get(r.id);
    if (!m) {
      m = L.marker([r.lat, r.lng], { icon: iconOpts, title: r.name, alt: label, keyboard: true, riseOnHover: true })
        .addTo(map)
        .on('click', () => navigate(`#map/r/${r.id}`));
      markers.set(r.id, m);
    } else {
      m.setIcon(iconOpts);
      m.setLatLng([r.lat, r.lng]);
    }
    m.setZIndexOffset(r.bonus ? 0 : 500);
    m.getElement()?.setAttribute('aria-label', label);
  }
  for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }

  if (!fitted && restaurants.length) {
    const bounds = L.latLngBounds(restaurants.map((r) => [r.lat, r.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    fitted = true;
  }
}

/** Highlight + bring a restaurant into view above the half-height sheet. */
export function focusRestaurant(id) {
  selectedId = id;
  if (!map) return;
  renderMarkers();
  const r = data().restaurants.find((x) => x.id === id);
  if (!r) return;
  const sheetPx = Math.min(window.innerHeight * 0.5, 460);
  const target = map.project([r.lat, r.lng], map.getZoom()).add([0, sheetPx / 2 - 20]);
  map.panTo(map.unproject(target, map.getZoom()), { animate: true });
}

export function clearFocus() {
  if (selectedId === null) return;
  selectedId = null;
  renderMarkers();
}

async function locate() {
  const btn = el.querySelector('.map-locate');
  btn.classList.add('busy');
  try {
    const p = await getPosition();
    map?.flyTo([p.lat, p.lng], 15);
  } catch {
    btn.classList.add('denied');
  } finally {
    btn.classList.remove('busy');
  }
}

function showMe(p) {
  if (!map) return;
  const L = window.L;
  if (!meMarker) {
    meMarker = L.circleMarker([p.lat, p.lng], {
      radius: 8, color: '#fff', weight: 3, fillColor: '#3a7bd5', fillOpacity: 1,
    }).addTo(map);
  } else meMarker.setLatLng([p.lat, p.lng]);
}
