// Project detail dialog (native <dialog> + showModal: background is inert, Esc closes).
// One dialog lives on <body>, outside the re-rendered sections, so a language toggle or a preview
// message can refill it without losing focus. Deep link: #project-<id>.
import { t } from '../../shared/i18n.js';
import { ui } from './sections/_util.js';
import { projectDetailHtml, isDeepLinkId, projectHash, projectIdFromHash } from './sections/projects.js';

const st = { content: null, lang: 'en', index: -1, dlg: null, body: null, closeBtn: null, wired: false };

const projects = () => (Array.isArray(st.content?.projects) ? st.content.projects : []);
const supported = () => typeof HTMLDialogElement === 'function' && typeof HTMLDialogElement.prototype.showModal === 'function';

function build() {
  if (st.dlg) return st.dlg;
  const dlg = document.createElement('dialog');
  dlg.className = 'proj-dialog';
  dlg.setAttribute('aria-labelledby', 'project-dialog-title');
  dlg.innerHTML = '<div class="proj-inner"><button class="proj-close mono" type="button"></button><div class="proj-content"></div></div>';
  document.body.appendChild(dlg);
  st.dlg = dlg;
  st.body = dlg.querySelector('.proj-content');
  st.closeBtn = dlg.querySelector('.proj-close');

  let downOnBackdrop = false;
  dlg.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && downOnBackdrop) dlg.close(); });
  dlg.addEventListener('close', onClose);
  st.closeBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dlg.querySelectorAll('button, a[href]')].filter((n) => !n.disabled);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  return dlg;
}

function fill() {
  const p = projects()[st.index];
  if (!p) return;
  const hadHeading = document.activeElement?.id === 'project-dialog-title';
  st.dlg.lang = st.lang;
  st.closeBtn.textContent = ui('close', st.lang);
  st.closeBtn.setAttribute('aria-label', `${ui('close', st.lang)}: ${t(p.title, st.lang).trim()}`.trim());
  st.body.innerHTML = projectDetailHtml(p, st.lang);
  const stillIn = document.activeElement && st.dlg.contains(document.activeElement) && document.activeElement !== st.dlg;
  if (hadHeading) st.body.querySelector('#project-dialog-title')?.focus();
  else if (!stillIn) st.closeBtn.focus();
}

function setHash(h) {
  try { history.replaceState(history.state, '', location.pathname + location.search + h); } catch { /* ignore */ }
}

function onClose() {
  const idx = st.index;
  st.index = -1;
  const closedId = projects()[idx]?.id;
  if (closedId && location.hash === projectHash(closedId)) setHash(''); // only the hash this dialog set
  const btn = document.querySelector(`.card-open[data-i="${idx}"]`);
  btn?.focus();
}

function open(index) {
  if (!supported() || !projects()[index]) return;
  build();
  st.index = index;
  fill();
  if (!st.dlg.open) st.dlg.showModal();
  st.closeBtn.focus();
  const h = projectHash(projects()[index].id);
  if (h && location.hash !== h) setHash(h);
}

function handleHash() {
  const id = projectIdFromHash(location.hash);
  if (!id) {
    if (st.dlg?.open) st.dlg.close();
    return;
  }
  const idx = projects().findIndex((p) => p?.id === id && isDeepLinkId(p.id));
  if (idx >= 0 && (!st.dlg?.open || st.index !== idx)) open(idx);
}

function wire() {
  if (st.wired) return;
  st.wired = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.card-open');
    if (b) open(Number(b.dataset.i));
  });
  window.addEventListener('hashchange', handleHash);
}

/** Call after every render. Refills an open dialog with the new language/content, or opens a deep link. */
export function syncProjectDialog(content, lang) {
  st.content = content;
  st.lang = lang;
  wire();
  if (st.dlg?.open) {
    const p = projects()[st.index];
    if (!p) { st.dlg.close(); return; }
    fill();
    return;
  }
  handleHash();
}
