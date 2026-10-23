// "Threads of light": a faint full-page 2D canvas of drifting points joined by thin lines,
// gently pulled toward the cursor. Sits behind the content (CSS: .threads) and ignores pointer input.
//
// mountThreads(el, theme) -> { dispose, setTheme }
// Accent colours are read from the CSS custom properties, so light mode and theme edits follow along.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function cssAccents() {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3].map((i) => cs.getPropertyValue(`--accent${i}`).trim() || ['#7cf3ff', '#a98bff', '#ff6fd1'][i - 1]);
}

function toRgb(c) {
  const s = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const m = s.match(/\d+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : [124, 243, 255];
}

export function mountThreads(el, _theme) {
  const canvas = document.createElement('canvas');
  canvas.className = 'threads';
  canvas.setAttribute('aria-hidden', 'true');
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let colors = cssAccents().map(toRgb);
  let w = 0;
  let h = 0;
  let dpr = 1;
  let pts = [];
  const mouse = { x: -9999, y: -9999 };
  const LINK = 140;
  const PULL = 170;

  function seed() {
    const target = Math.round(clamp((w * h) / 16000, 18, 90)); // cap by viewport area
    while (pts.length < target) {
      pts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        c: pts.length % 3,
      });
    }
    pts.length = target;
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function frame(dt) {
    ctx.clearRect(0, 0, w, h);
    const step = dt * 60;
    for (const p of pts) {
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < PULL * PULL && d2 > 1) {
        const d = Math.sqrt(d2);
        const f = (1 - d / PULL) * 0.02;
        p.vx += (dx / d) * f * step;
        p.vy += (dy / d) * f * step;
      }
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK * LINK) continue;
        const al = (1 - Math.sqrt(d2) / LINK) * 0.2;
        const [r, g, bl] = colors[a.c];
        ctx.strokeStyle = `rgba(${r},${g},${bl},${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (dm < PULL) {
        const [r, g, bl] = colors[a.c];
        ctx.strokeStyle = `rgba(${r},${g},${bl},${((1 - dm / PULL) * 0.3).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
      const [r, g, bl] = colors[a.c];
      ctx.fillStyle = `rgba(${r},${g},${bl},0.45)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let raf = 0;
  let last = 0;
  let disposed = false;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    frame(dt);
  }
  function sync() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!document.hidden && !disposed) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
  const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', sync);
  sync();

  return {
    canvas,
    setTheme() { colors = cssAccents().map(toRgb); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', sync);
      canvas.remove();
    },
  };
}
