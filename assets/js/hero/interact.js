// Pure helpers for the interactive desk (no three.js, no DOM at import time) so node can test them.

// Text and controls that sit above the canvas: pointer events that start on them belong to the page.
export const UI_SELECTOR = 'a, button, input, textarea, select, summary, label, h1, h2, h3, h4, p, li, nav, [role="button"]';

/** True when the event target is a link/button/text element (the desk must not react to it). */
export function isUiTarget(target) {
  return typeof target?.closest === 'function' && target.closest(UI_SELECTOR) !== null;
}

/** The accent colours shifted by `step`: step 0 is [a1, a2, a3], step 1 is [a2, a3, a1], and so on. */
export function rotateAccents(accents, step) {
  const n = accents.length;
  const s = ((Math.trunc(step) % n) + n) % n;
  return accents.map((_, i) => accents[(i + s) % n]);
}

/** Next palette step after a click on the controller (accent1 -> accent2 -> accent3 -> back). */
export const nextTint = (step, count = 3) => (step + 1) % count;

/**
 * Keys close to a point on the keyboard plane, with a 0..1 weight that falls off with distance.
 * keys: [{ x, z, sx }] in keyboard-local units; sx is the key width in key units (the space bar is wide).
 */
export function keysNear(keys, x, z, radius = 0.05) {
  const out = [];
  keys.forEach((k, i) => {
    const half = (k.sx ?? 1) * 0.025; // half the cap width
    const dx = Math.max(0, Math.abs(x - k.x) - half);
    const dz = Math.max(0, Math.abs(z - k.z) - 0.024);
    const d = Math.hypot(dx, dz);
    if (d < radius) out.push({ i, w: 1 - d / radius });
  });
  return out;
}

/** Linear fade of an effect level that is 1 when triggered and 0 after `seconds`. */
export const fade = (level, dt, seconds) => Math.max(0, level - dt / seconds);

/** Exponential ease of `current` towards `target` (frame-rate independent). */
export const ease = (current, target, dt, rate = 10) => current + (target - current) * (1 - Math.exp(-dt * rate));
