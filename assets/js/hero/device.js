// Decides whether the hero runs the live three.js scene or shows the still poster.
// Pure and browser-free at import time so node can test it.

export const SLOW_FRAME_MS = 120;

export function chooseHeroMode({ reducedMotion, webgl, width, deviceMemory, firstFrameMs } = {}) {
  if (reducedMotion) return 'poster';
  if (!webgl) return 'poster';
  // Weak phone: narrow screen and (little or unknown) memory.
  if (width <= 480 && !(deviceMemory > 4)) return 'poster';
  if (firstFrameMs > SLOW_FRAME_MS) return 'poster';
  return 'live';
}

// Should the page start downloading the 3D scene before it knows the theme? Only when the device will
// very likely go live, so phones, reduced-motion users and the light theme never pay the ~257 KB.
// The same rule is inlined in index.html (a head script cannot import); tests/preload-script.test.mjs
// runs that script against this function.
export function shouldPreloadHero({ reducedMotion, width, light } = {}) {
  return !reducedMotion && !light && width > 480;
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
