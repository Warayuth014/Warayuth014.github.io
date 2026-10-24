// Scroll reveal. Content is fully visible at rest: only elements that start below the fold are
// marked (.rv) and they fade/slide in via opacity + translate (no layout change) when they enter.
// Without IntersectionObserver, or under reduced motion, nothing is marked.
import { prefersReducedMotion, noop } from './env.js';

const SELECTOR = '.card, .skill-row, .step, .fact, .about-story, .contact-mail, .social, .articles-list > *';

export function enableReveal(root = document) {
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return noop;
  const fold = window.innerHeight || document.documentElement.clientHeight;
  const targets = [...root.querySelectorAll(SELECTOR)].filter((el) => el.getBoundingClientRect().top > fold);
  if (!targets.length) return noop;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('rv-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });

  for (const el of targets) {
    el.classList.add('rv');
    io.observe(el);
  }
  return () => {
    io.disconnect();
    for (const el of targets) el.classList.remove('rv', 'rv-in');
  };
}
