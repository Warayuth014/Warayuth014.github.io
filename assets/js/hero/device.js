// Decides whether the hero runs the live three.js scene or shows the still poster.
// Pure and browser-free at import time so node can test it.

export const SLOW_FRAME_MS = 120;

// `forced`: the visitor pressed "turn on 3D", so only missing WebGL keeps the poster.
export function chooseHeroMode({ reducedMotion, webgl, width, deviceMemory, firstFrameMs, forced } = {}) {
  if (!webgl) return 'poster';
  if (forced) return 'live';
  if (reducedMotion) return 'poster';
  // Weak phone: narrow screen and (little or unknown) memory.
  if (width <= 480 && !(deviceMemory > 4)) return 'poster';
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
