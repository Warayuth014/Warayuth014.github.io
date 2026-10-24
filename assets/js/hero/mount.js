// Wires the hero stage and the ambient threads to the site theme.
// Both syncHero() and syncThreads() are safe to call on every boot (preview re-renders): they reuse
// what is mounted, and dispose before replacing, so renderers and RAF loops never stack.
import { chooseHeroMode, hasWebGL } from './device.js';
import { mountThreads } from './threads.js';

const POSTER = '/assets/img/hero-poster.webp';
const POSTER_LIGHT = '/assets/img/hero-poster-light.webp';
let webglCache = null;
const webgl = () => (webglCache ??= hasWebGL());

// ---------- hero ----------
const hero = { stage: null, desk: null, token: 0, theme: null };

function clearLive() {
  hero.token++; // invalidates a pending dynamic import
  hero.desk?.dispose();
  hero.desk = null;
}

// The still that stands in for the scene: the night room, or the day room in light mode.
function showPoster(stage) {
  const src = hero.theme?.mode === 'light' ? POSTER_LIGHT : POSTER;
  const have = stage.querySelector(':scope > .hero-poster');
  if (have) {
    if (have.getAttribute('src') !== src) have.src = src;
    return;
  }
  const img = document.createElement('img');
  img.className = 'hero-poster';
  img.src = src;
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

// Resolves once the frame that shows the text has been painted. Building the scene (shader compile) blocks
// the main thread, so it waits for this, but nothing else: the module download starts immediately.
const afterPaint = () => new Promise((done) => {
  if (typeof requestAnimationFrame !== 'function') { setTimeout(done, 0); return; }
  requestAnimationFrame(() => setTimeout(done, 0));
});

async function startLive(stage) {
  const token = ++hero.token;
  setMode(stage, 'loading');
  let mod;
  try {
    [mod] = await Promise.all([import('./desk.js'), afterPaint()]);
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
      capture,
      onFirstFrame(ms) {
        stage.dataset.heroFirstFrame = String(Math.round(performance.now()));
        // chooseHeroMode owns the "too slow" rule; hand it the measured first frame.
        const mode = chooseHeroMode({ webgl: true, firstFrameMs: ms });
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

  const mode = fx.hero3d === false ? 'poster' : chooseHeroMode({ webgl: webgl() });
  if (mode === 'poster') {
    clearLive();
    setMode(stage, 'poster');
    showPoster(stage);
    return;
  }
  hidePoster(stage);
  if (hero.desk) { hero.desk.setTheme(theme); return; }
  if (stage.dataset.heroMode === 'loading') return; // import in flight; it reads hero.theme when it mounts
  startLive(stage);
}

// ---------- ambient threads ----------
let threads = null;

export function syncThreads(theme) {
  const on = theme?.effects?.threads !== false;
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
