// Decides whether the hero runs the live three.js scene or shows the still poster.
// Pure and browser-free at import time so node can test it. Only technical limits fall back to the
// poster: no WebGL, or a first frame that is too slow. Screen size and motion settings never do.

export const SLOW_FRAME_MS = 120;

export function chooseHeroMode({ webgl, firstFrameMs } = {}) {
  if (!webgl) return 'poster';
  if (firstFrameMs > SLOW_FRAME_MS) return 'poster';
  return 'live';
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
