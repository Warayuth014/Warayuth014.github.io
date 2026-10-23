// Fills the journey timeline line as the visitor scrolls. Static (fully drawn) under reduced motion.
import { prefersReducedMotion, noop } from './env.js';

export function enableTimelineProgress(root = document) {
  if (prefersReducedMotion()) return noop;
  const lines = [...root.querySelectorAll('.timeline')];
  if (!lines.length) return noop;

  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    for (const el of lines) {
      const r = el.getBoundingClientRect();
      const p = r.height ? (vh * 0.65 - r.top) / r.height : 1;
      el.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
    for (const el of lines) el.style.removeProperty('--p');
  };
}
