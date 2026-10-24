// Wires the hero stage and the ambient threads to the site theme.
// Both syncHero() and syncThreads() are safe to call on every boot (preview re-renders): they reuse
// what is mounted, and dispose before replacing, so renderers and RAF loops never stack.
import { chooseHeroMode, hasWebGL } from './device.js';
import { mountThreads } from './threads.js';

const POSTER = '/assets/img/hero-poster.webp';
const reduceQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);
const prefersReduced = () => Boolean(reduceQuery()?.matches);

let webglCache = null;
const webgl = () => (webglCache ??= hasWebGL());

// ---------- hero ----------
const hero = { stage: null, desk: null, token: 0, theme: null };

function clearLive() {
  hero.token++; // invalidates a pending dynamic import
  hero.desk?.dispose();
  hero.desk = null;
}

function showPoster(stage) {
  if (stage.querySelector(':scope > .hero-poster')) return;
  const img = document.createElement('img');
  img.className = 'hero-poster';
  img.src = POSTER;
  img.alt = '';
  img.decoding = 'async';
  stage.prepend(img);
}

function hidePoster(stage) {
  stage.querySelector(':scope > .hero-poster')?.remove();
}

function setMode(stage, mode) {
  stage.dataset.heroMode = mode;
  stage.classList.toggle('is-live', mode === 'live');
}

// Start right after the first paint (not after window load / idle), so the scene shows within ~2 s.
function afterFirstPaint(fn) {
  if (typeof requestAnimationFrame !== 'function') { setTimeout(fn, 100); return; }
  requestAnimationFrame(() => setTimeout(fn, 100));
}

async function startLive(stage) {
  const token = ++hero.token;
  setMode(stage, 'loading');
  let mod;
  try {
    mod = await import('./desk.js');
  } catch {
    if (token === hero.token) { setMode(stage, 'poster'); showPoster(stage); }
    return;
  }
  if (token !== hero.token || !stage.isConnected) return;
  const capture = new URLSearchParams(location.search).get('capture') === '1';
  const toPoster = () => {
    if (token !== hero.token) return;
    clearLive();
    setMode(stage, 'poster');
    showPoster(stage);
  };
  let desk;
  try {
    desk = mod.mountDesk(stage, {
      theme: hero.theme,
      reducedMotion: false,
      capture,
      onFirstFrame(ms) {
        // chooseHeroMode owns the "too slow" rule; hand it the measured first frame.
        const mode = chooseHeroMode({ reducedMotion: false, webgl: true, width: Infinity, deviceMemory: 8, firstFrameMs: ms });
        if (mode === 'poster') queueMicrotask(toPoster);
      },
      onLost: toPoster,
    });
  } catch {
    toPoster();
    return;
  }
  if (token !== hero.token) { desk.dispose(); return; }
  hero.desk = desk;
  if (stage.dataset.heroMode === 'loading') setMode(stage, 'live');
}

export function syncHero(stage, theme) {
  if (!stage) return;
  if (hero.stage && hero.stage !== stage) { clearLive(); }
  hero.stage = stage;
  hero.theme = theme;
  const fx = theme?.effects ?? {};

  // Light mode keeps the plain gradient: the night scene would sit behind dark text.
  if (theme?.mode === 'light') {
    clearLive();
    hidePoster(stage);
    setMode(stage, 'off');
    return;
  }
  const mode = fx.hero3d === false ? 'poster' : chooseHeroMode({
    reducedMotion: prefersReduced(),
    webgl: webgl(),
    width: window.innerWidth,
    deviceMemory: navigator.deviceMemory,
  });
  if (mode === 'poster') {
    clearLive();
    setMode(stage, 'poster');
    showPoster(stage);
    return;
  }
  hidePoster(stage);
  if (hero.desk) { hero.desk.setTheme(theme); return; }
  if (stage.dataset.heroMode === 'loading') return; // import in flight; it reads hero.theme when it mounts
  setMode(stage, 'loading');
  afterFirstPaint(() => {
    if (hero.stage === stage && stage.dataset.heroMode === 'loading' && !hero.desk) startLive(stage);
  });
}

// ---------- ambient threads ----------
let threads = null;

export function syncThreads(theme) {
  const on = theme?.effects?.threads !== false && !prefersReduced();
  if (!on) {
    threads?.dispose();
    threads = null;
    return;
  }
  if (threads && threads.canvas.isConnected) threads.setTheme(theme);
  else {
    threads?.dispose();
    threads = mountThreads(document.body);
  }
}
