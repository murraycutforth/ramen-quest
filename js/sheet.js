// Bottom sheet: opens at half height (or full), drag the handle up to expand / down to
// dismiss, tap the backdrop or press Escape to close. Closing is delegated to the router
// via `onRequestClose`, so the back button and the UI behave the same.

import { reducedMotion } from './ui.js';

let root, panel, body, backdrop, handle;
let onRequestClose = () => {};
let lastFocus = null;
let isOpen = false;

export function initSheet(requestClose) {
  onRequestClose = requestClose;
  root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <button class="sheet-handle" type="button" aria-label="Expand or collapse"><span></span></button>
      <button class="sheet-x" type="button" data-close aria-label="Close">×</button>
      <div class="sheet-body"></div>
    </section>`;
  panel = root.querySelector('.sheet');
  body = root.querySelector('.sheet-body');
  backdrop = root.querySelector('.sheet-backdrop');
  handle = root.querySelector('.sheet-handle');

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) onRequestClose();
  });
  document.addEventListener('keydown', (e) => {
    if (isOpen && e.key === 'Escape') onRequestClose();
  });
  handle.addEventListener('click', () => setSize(panel.dataset.size === 'full' ? 'half' : 'full'));
  setupDrag();
}

function setSize(size) {
  panel.dataset.size = size;
}

export function openSheet(content, { size = 'half', key } = {}) {
  const sameKey = isOpen && key && panel.dataset.key === key;
  if (!sameKey) {
    body.replaceChildren();
    body.scrollTop = 0;
  }
  if (typeof content === 'string') body.innerHTML = content;
  else body.replaceChildren(content);
  panel.dataset.key = key || '';
  if (!sameKey) setSize(size);
  if (!isOpen) {
    lastFocus = document.activeElement;
    root.classList.add('open');
    document.body.classList.add('sheet-open');
    isOpen = true;
    requestAnimationFrame(() => panel.focus({ preventScroll: true }));
  }
  return body;
}

export function closeSheet() {
  if (!isOpen) return;
  isOpen = false;
  root.classList.remove('open');
  document.body.classList.remove('sheet-open');
  panel.style.transform = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

export const sheetBody = () => body;
export const sheetIsOpen = () => isOpen;
export const sheetKey = () => (isOpen ? panel.dataset.key : null);

function setupDrag() {
  let startY = 0;
  let dy = 0;
  let dragging = false;

  const start = (e) => {
    // Drag from the handle, or from the top of the content when it's scrolled to the top.
    const fromHandle = e.target.closest('.sheet-handle');
    if (!fromHandle && (body.scrollTop > 0 || !e.target.closest('.sheet-head'))) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    panel.classList.add('dragging');
  };
  const move = (e) => {
    if (!dragging) return;
    dy = e.clientY - startY;
    if (Math.abs(dy) > 4) e.preventDefault();
    const clamped = panel.dataset.size === 'full' ? Math.max(0, dy) : dy;
    panel.style.transform = `translateY(${clamped}px)`;
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
    panel.style.transform = '';
    if (dy < -60) setSize('full');
    else if (dy > 80) {
      if (panel.dataset.size === 'full' && dy < 260) setSize('half');
      else onRequestClose();
    }
  };
  panel.addEventListener('pointerdown', start);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  if (reducedMotion()) panel.classList.add('no-anim');
}
