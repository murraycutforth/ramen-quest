// Small DOM helpers shared by the views.

import { PEOPLE } from './config.js';
import { fmtScore } from './scoring.js';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Tagged template that escapes interpolations, except values wrapped with raw(). */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    const one = (x) => (x instanceof Raw ? x.s : x === false || x == null ? '' : esc(x));
    out += (Array.isArray(v) ? v.map(one).join('') : one(v)) + strings[i + 1];
  });
  return raw(out);
}

export const icon = (name, cls = '') => raw(`<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`);

/** Five bowls, partially filled to `value` (e.g. 3.5 or an average like 4.25). */
export function bowls(value, { size = 'sm', label } = {}) {
  const v = value ?? 0;
  let inner = '';
  for (let i = 0; i < 5; i++) {
    const pct = Math.round(Math.max(0, Math.min(1, v - i)) * 100);
    inner += `<span class="bowl"><svg class="ico" aria-hidden="true"><use href="#i-bowl-outline"/></svg><span class="bowl-fill" style="width:${pct}%"><svg class="ico" aria-hidden="true"><use href="#i-bowl"/></svg></span></span>`;
  }
  const aria = label ?? (value == null ? 'Not rated yet' : `${fmtScore(value)} out of 5 bowls`);
  return raw(`<span class="bowls bowls-${size}" role="img" aria-label="${esc(aria)}">${inner}</span>`);
}

/** "M 4.5 · L 4" avatar pair. */
export function personScores(people, { waitingFor } = {}) {
  return raw(
    `<span class="who-scores">` +
      PEOPLE.map(
        (p) =>
          `<span class="who who-${p.id}${people[p.id] == null ? ' who-empty' : ''}" title="${esc(p.name)}"><span class="avatar" aria-hidden="true">${p.initial}</span><span class="sr-only">${esc(p.name)}</span> ${people[p.id] == null ? '–' : fmtScore(people[p.id])}</span>`,
      ).join('') +
      (waitingFor ? `<span class="badge badge-wait">waiting for ${esc(PEOPLE.find((p) => p.id === waitingFor).name)}</span>` : '') +
      `</span>`,
  );
}

export function toast(message, { flourish = false, timeout = 2400 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (flourish && !reducedMotion() ? ' toast-steam' : '');
  el.innerHTML = `${flourish ? '<span class="steam" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}<span>${esc(message)}</span>`;
  root.append(el);
  setTimeout(() => el.classList.add('toast-out'), timeout);
  setTimeout(() => el.remove(), timeout + 400);
}

export function confetti(count = 60) {
  if (reducedMotion()) return;
  const colours = ['var(--amber)', 'var(--pink)', 'var(--nori)', 'var(--chilli)', 'var(--cream-strong)'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colours[i % colours.length];
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    s.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    s.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    s.style.setProperty('--spin', `${(Math.random() - 0.5) * 1080}deg`);
    if (i % 3 === 0) s.className = 'round';
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3800);
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function directionsUrl(r) {
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  return isApple
    ? `https://maps.apple.com/?daddr=${r.lat},${r.lng}&q=${encodeURIComponent(r.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
}

/** Status chip text for the store's sync state. */
export function statusChip(state, { hasToken, pending }) {
  if (state.status === 'saving') return { cls: 'saving', text: 'saving…' };
  if (state.status === 'offline' || (pending && navigator.onLine === false)) return { cls: 'offline', text: 'will sync later' };
  if (state.status === 'error') return { cls: 'error', text: 'not saved', title: state.statusDetail };
  if (pending && hasToken) return { cls: 'offline', text: 'will sync later' };
  if (state.status === 'saved') return { cls: 'saved', text: 'saved ✓' };
  return null;
}
