// Soft glow that trails the mouse. Does nothing on coarse pointers (no hover).
import { coarsePointer, noop } from './env.js';

let last = null; // survives dispose/enable so a re-render does not snap the glow away

export function enableCursorGlow() {
  if (coarsePointer()) return noop;
  const el = document.createElement('div');
  el.className = 'cursor-glow';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let raf = 0;
  const paint = () => {
    raf = 0;
    if (!last) return;
    el.style.transform = `translate3d(${last.x}px, ${last.y}px, 0)`;
    el.classList.add('on');
  };
  const move = (ev) => {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    last = { x: ev.clientX, y: ev.clientY };
    if (!raf) raf = requestAnimationFrame(paint);
  };
  const out = () => el.classList.remove('on');
  document.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', out);
  paint();

  return () => {
    document.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', out);
    if (raf) cancelAnimationFrame(raf);
    el.remove();
  };
}
