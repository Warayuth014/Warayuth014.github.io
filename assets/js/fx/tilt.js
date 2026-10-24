// Card tilt that follows the mouse. Does nothing under reduced motion or on coarse pointers.
// Returns dispose(): removes listeners and clears the inline transform.
import { prefersReducedMotion, coarsePointer, noop } from './env.js';

const MAX_DEG = 5;

export function enableTilt(root = document) {
  if (prefersReducedMotion() || coarsePointer()) return noop;
  const cards = [...root.querySelectorAll('.card')];
  const undo = [];

  for (const card of cards) {
    const move = (ev) => {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      card.classList.add('is-tilting');
      card.style.transform = `perspective(800px) rotateX(${(-y * MAX_DEG).toFixed(2)}deg) rotateY(${(x * MAX_DEG).toFixed(2)}deg)`;
    };
    const leave = () => {
      card.classList.remove('is-tilting');
      card.style.transform = '';
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', leave);
    undo.push(() => {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', leave);
      leave();
    });
  }
  return () => undo.splice(0).forEach((f) => f());
}
