// "Night desk" hero: two monitors typing generic code, a glowing keyboard, a controller, neon strips.
// Built only from three.js primitives and CanvasTextures (no model files).
//
// mountDesk(el, { theme, reducedMotion, capture, onFirstFrame, onLost }) -> { dispose, setTheme, canvas }
//   el            the .hero-stage element (the canvas is appended here)
//   onFirstFrame  called with the milliseconds the first rendered frame took (shaders pre-compiled)
//   onLost        called once if the WebGL context is lost (scene is already disposed by then)
//   capture       deterministic still for tools/capture-poster.mjs (fixed camera, text pre-typed,
//                 preserveDrawingBuffer so toDataURL works)
import * as THREE from 'three';
import { isUiTarget, rotateAccents, nextTint, keysNear, fade, ease } from './interact.js';

const DEFAULT_PALETTE = { bg1: '#0b0f1d', bg2: '#1d0f2e', accent1: '#7cf3ff', accent2: '#a98bff', accent3: '#ff6fd1' };
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function readPalette(theme) {
  const th = theme && typeof theme === 'object' ? theme : {};
  return Object.fromEntries(Object.entries(DEFAULT_PALETTE).map(([k, d]) => [k, hex(th[k], d)]));
}

// ---------- code shown on the monitors (generic on purpose) ----------
const SNIPPETS_MAIN = [
  `// game loop
let last = 0;

function frame(t) {
  const dt = (t - last) / 1000;
  last = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);`,
  `public async Task<User> GetUser(int id)
{
    var res = await http.GetAsync(
        $"/users/{id}");
    res.EnsureSuccessStatusCode();

    return await res.Content
        .ReadFromJsonAsync<User>();
}`,
];
const SNIPPETS_SIDE = [
  `class Counter extends StatelessWidget {
  const Counter({super.key});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () => bump(),
      child: Text('Tap me'),
    );
  }
}`,
  `async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);

  const data = await res.json();
  return data.items.map(toCard);
}`,
];

const KEYWORDS = /^(const|let|var|function|async|await|return|if|throw|new|class|extends|public|override|static|final|void|import)$/;
const TOKEN = /\/\/.*|"[^"]*"|'[^']*'|`[^`]*`|\$"[^"]*"|\b\d+\b|[A-Za-z_]\w*|\s+|./g;

// A canvas texture that types its snippets one after another.
function createScreen(snippets, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const font = '20px ui-monospace, Consolas, "Courier New", monospace';
  let ink = { bg: '#0a0d18', kw: '#a98bff', str: '#ff6fd1', type: '#7cf3ff', num: '#ffd479', com: '#5d6688', fg: '#d8def5' };
  const st = { si: 0, ci: 0, hold: 0, dirty: true, acc: 0, blink: 0, typed: 0 };

  ctx.font = font;
  const charW = ctx.measureText('M').width;
  const lineH = 25;
  const top = 50;
  const left = 54;

  function draw() {
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, w, 32);
    ['#ff6b6b', '#ffd479', '#7cf3a0'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(18 + i * 18, 16, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const text = snippets[st.si].slice(0, st.ci);
    const lines = text.split('\n');
    lines.forEach((line, li) => {
      const y = top + li * lineH;
      ctx.fillStyle = ink.com;
      ctx.fillText(String(li + 1).padStart(2, ' '), 12, y);
      let x = left;
      for (const tok of line.match(TOKEN) ?? []) {
        let c = ink.fg;
        if (tok.startsWith('//')) c = ink.com;
        else if (/^[`"'$]/.test(tok)) c = ink.str;
        else if (/^\d+$/.test(tok)) c = ink.num;
        else if (KEYWORDS.test(tok)) c = ink.kw;
        else if (/^[A-Z]/.test(tok)) c = ink.type;
        ctx.fillStyle = c;
        ctx.fillText(tok, x, y);
        x += tok.length * charW;
      }
      if (li === lines.length - 1 && st.blink < 0.5) {
        ctx.fillStyle = ink.type;
        ctx.fillRect(x + 1, y - 17, 10, 21);
      }
    });
    texture.needsUpdate = true;
  }

  return {
    texture,
    setInk(next) { ink = { ...ink, ...next }; st.dirty = true; },
    complete() { st.ci = snippets[st.si].length; st.dirty = true; },
    // a short burst of fast typing (a click on the keyboard); a finished snippet moves on right away
    burst(n) {
      st.acc += n;
      if (st.ci >= snippets[st.si].length) st.hold = Math.max(st.hold, 3.3);
    },
    // returns how many characters were typed this step
    step(dt, speed) {
      let typed = 0;
      const full = snippets[st.si].length;
      if (st.ci < full) {
        st.acc += dt * speed;
        const n = Math.floor(st.acc);
        if (n > 0) {
          st.acc -= n;
          st.ci = Math.min(full, st.ci + n);
          typed = n;
          st.dirty = true;
        }
      } else {
        st.hold += dt;
        if (st.hold > 3.2) {
          st.hold = 0;
          st.si = (st.si + 1) % snippets.length;
          st.ci = 0;
          st.dirty = true;
        }
      }
      const blink = (st.blink + dt) % 1;
      if ((blink < 0.5) !== (st.blink < 0.5)) st.dirty = true;
      st.blink = blink;
      return typed;
    },
    // redraw at most ~12 times a second
    flush(now) {
      if (!st.dirty || now - (st.last ?? -1) < 0.08) return;
      st.last = now;
      st.dirty = false;
      draw();
    },
    draw() { st.dirty = false; draw(); },
  };
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mountDesk(el, opts = {}) {
  const { reducedMotion = false, capture = false, onFirstFrame, onLost } = opts;
  const animate = !reducedMotion && !capture;
  const pal = readPalette(opts.theme);
  const C = { bg1: new THREE.Color(), bg2: new THREE.Color(), a1: new THREE.Color(), a2: new THREE.Color(), a3: new THREE.Color() };
  const binders = [];
  const onPalette = (fn) => { binders.push(fn); fn(); };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.setClearColor(0x000000, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero-canvas';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);

  // ----- materials shared by several meshes -----
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x171c31, roughness: 0.5, metalness: 0.15 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x0f1322, roughness: 0.45, metalness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x111528, roughness: 1 });
  const neonA1 = new THREE.MeshBasicMaterial();
  const neonA2 = new THREE.MeshBasicMaterial();
  const neonA3 = new THREE.MeshBasicMaterial();

  // ----- wall + desk -----
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
  wall.position.set(0, 1.4, -0.9);
  scene.add(wall);

  const desk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.07, 1.5), deskMat);
  desk.position.set(0, 0, -0.05);
  scene.add(desk);

  const stripFront = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.018, 0.018), neonA2);
  stripFront.position.set(0, -0.012, 0.705);
  scene.add(stripFront);

  // ----- neon strips on the wall -----
  const strip = (mat, w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat);
    m.position.set(x, y, -0.87);
    scene.add(m);
  };
  strip(neonA1, 4.8, 0.03, 0, 1.62);
  strip(neonA3, 0.03, 1.9, 2.15, 0.9);
  strip(neonA2, 1.6, 0.03, -1.8, 1.2);
  strip(neonA1, 0.03, 0.9, -2.45, 0.5);

  // ----- monitors -----
  const screens = [];
  function monitor(x, z, rotY, w, h, snippets) {
    const g = new THREE.Group();
    g.position.set(x, 0.035, z);
    g.rotation.y = rotY;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.018, 0.22), plastic);
    base.position.y = 0.009;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.04), plastic);
    neck.position.set(0, 0.16, -0.03);
    const cy = 0.2 + h / 2 + 0.03;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.04), plastic);
    frame.position.set(0, cy, 0);
    const scr = createScreen(snippets, 640, Math.round(640 * (h / w)));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: scr.texture, toneMapped: false }));
    face.position.set(0, cy, 0.0215);
    g.add(base, neck, frame, face);
    scene.add(g);
    screens.push(scr);
    return { scr, face, group: g, cy, size: [w, h], center: new THREE.Vector3(x, 0.035 + cy, z) };
  }
  const main = monitor(-0.35, -0.12, 0, 1.3, 0.76, SNIPPETS_MAIN);
  const side = monitor(1.05, -0.05, -0.42, 0.9, 0.56, SNIPPETS_SIDE);

  // ----- keyboard: dark caps + glowing legends (two instanced meshes) -----
  const kb = new THREE.Group();
  kb.position.set(-0.35, 0.035, 0.46);
  kb.rotation.x = -0.04;
  scene.add(kb);
  const kbBase = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.024, 0.33), plastic);
  kbBase.position.y = 0.012;
  kb.add(kbBase);

  const rows = [14, 14, 13, 12];
  const keyPos = [];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      keyPos.push({ x: (i - (n - 1) / 2) * 0.061 + (r === 2 ? 0.01 : 0) + (r === 3 ? 0.02 : 0), z: -0.105 + r * 0.056, sx: 1 });
    }
  });
  keyPos.push({ x: 0, z: -0.105 + 4 * 0.056, sx: 5.4 }); // space bar
  const KEYS = keyPos.length;
  const capGeo = new THREE.BoxGeometry(0.05, 0.016, 0.048);
  const caps = new THREE.InstancedMesh(capGeo, plastic, KEYS);
  const legendGeo = new THREE.PlaneGeometry(0.03, 0.026);
  legendGeo.rotateX(-Math.PI / 2);
  const legends = new THREE.InstancedMesh(legendGeo, new THREE.MeshBasicMaterial(), KEYS);
  const m4 = new THREE.Matrix4();
  const white = new THREE.Color(1, 1, 1);
  function placeKey(i, lift, grow = 0) {
    const k = keyPos[i];
    m4.makeScale(k.sx, 1 + grow, 1 + grow * 0.5).setPosition(k.x, 0.032 + lift, k.z);
    caps.setMatrixAt(i, m4);
    m4.makeScale((k.sx > 1 ? 4.2 : 1) * (1 + grow), 1, 1 + grow).setPosition(k.x, 0.0405 + lift + grow * 0.008, k.z);
    legends.setMatrixAt(i, m4);
  }
  const lifted = new Uint8Array(KEYS);
  let liftDirty = false;
  keyPos.forEach((_, i) => {
    placeKey(i, 0);
    legends.setColorAt(i, C.a1);
    caps.setColorAt(i, white);
  });
  caps.instanceMatrix.needsUpdate = true;
  legends.instanceMatrix.needsUpdate = true;
  kb.add(caps, legends);
  const flash = new Float32Array(KEYS);
  const keyHover = new Float32Array(KEYS); // 1 when the pointer is on a key, fades out over ~400 ms

  // ----- glow sprites (cheap bloom) -----
  const glowTex = glowTexture();
  const glows = [];
  const glow = (x, y, z, s, op) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z);
    sp.scale.set(s, s, 1);
    scene.add(sp);
    glows.push(sp);
    return sp;
  };
  const glowA = glow(-0.35, 0.75, -0.5, 3.4, 0.28);
  const glowB = glow(1.2, 0.7, -0.4, 2.4, 0.22);
  const glowK = glow(-0.35, 0.09, 0.46, 1.5, 0.35);

  // ----- game controller -----
  const pad = new THREE.Group();
  pad.position.set(0.5, 0.035, 0.5);
  pad.rotation.y = 0.55;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 12), plastic);
  body.scale.set(1.35, 0.42, 0.9);
  body.position.y = 0.03;
  pad.add(body);
  [-1, 1].forEach((s) => {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), plastic);
    grip.position.set(s * 0.095, 0.026, 0.055);
    grip.rotation.set(Math.PI / 2 - 0.25, 0, s * 0.35);
    pad.add(grip);
  });
  const stickGeo = new THREE.CylinderGeometry(0.014, 0.017, 0.02, 14);
  const stickMat = new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.6 });
  [[-0.05, 0.015], [0.035, 0.035]].forEach(([x, z]) => {
    const s = new THREE.Mesh(stickGeo, stickMat);
    s.position.set(x, 0.062, z);
    pad.add(s);
  });
  const dpadA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.01), stickMat);
  const dpadB = dpadA.clone();
  dpadB.rotation.y = Math.PI / 2;
  [dpadA, dpadB].forEach((d) => { d.position.set(-0.035, 0.06, -0.025); pad.add(d); });
  const btnGeo = new THREE.SphereGeometry(0.0085, 10, 8);
  const btnMats = [neonA1, neonA2, neonA3, neonA1];
  [[0.058, -0.045], [0.082, -0.03], [0.058, -0.015], [0.034, -0.03]].forEach(([x, z], i) => {
    const b = new THREE.Mesh(btnGeo, btnMats[i]);
    b.position.set(x, 0.061, z);
    pad.add(b);
  });
  const padLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.006), neonA3);
  padLight.position.set(0, 0.0605, -0.065);
  pad.add(padLight);
  scene.add(pad);

  // ----- hit volumes for the pointer (never drawn; slightly generous so small things are easy to hit) -----
  const hitMat = new THREE.MeshBasicMaterial();
  const hitBox = (parent, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat);
    m.position.set(x, y, z);
    m.visible = false;
    parent.add(m);
    return m;
  };
  const hitMonitor = hitBox(main.group, main.size[0] + 0.1, main.size[1] + 0.1, 0.1, 0, main.cy, 0.02);
  const hitPad = hitBox(pad, 0.32, 0.1, 0.22, 0, 0.04, 0.02);
  const hitKeys = hitBox(kb, 0.94, 0.06, 0.35, 0, 0.03, 0);
  const hitTargets = [hitMonitor, hitPad, hitKeys];

  // ----- desk lamp -----
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 20), plastic);
  lampBase.position.set(-1.6, 0.045, -0.2);
  const arm1 = new THREE.Group();
  arm1.position.set(0, 0.01, 0);
  arm1.rotation.z = -0.3;
  const a1m = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.5, 8), plastic);
  a1m.position.y = 0.25;
  arm1.add(a1m);
  const arm2 = new THREE.Group();
  arm2.position.set(0, 0.5, 0);
  arm2.rotation.z = 1.25;
  const a2m = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.42, 8), plastic);
  a2m.position.y = 0.21;
  arm2.add(a2m);
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0);
  head.rotation.z = 1.0;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.13, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1f36, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
  shade.position.y = 0.03;
  shade.rotation.x = Math.PI; // opening faces away from the arm (down)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
  bulb.position.y = -0.01;
  head.add(shade, bulb);
  arm2.add(head);
  arm1.add(arm2);
  lampBase.add(arm1);
  scene.add(lampBase);
  scene.updateMatrixWorld(true);
  const bulbPos = new THREE.Vector3();
  bulb.getWorldPosition(bulbPos);
  const lampGlow = glow(bulbPos.x, bulbPos.y, bulbPos.z, 0.9, 0.5);
  lampGlow.material.color.set(0xffc27a);

  // ----- lights -----
  scene.add(new THREE.HemisphereLight(0x8a96ff, 0x120a1e, 0.55));
  const lightWall1 = new THREE.PointLight(0xffffff, 6, 7, 2);
  lightWall1.position.set(0, 1.45, -0.55);
  const lightWall3 = new THREE.PointLight(0xffffff, 4, 6, 2);
  lightWall3.position.set(1.95, 0.9, -0.45);
  const lightKb = new THREE.PointLight(0xffffff, 1.6, 2.5, 2);
  lightKb.position.set(-0.35, 0.45, 0.7);
  const lamp = new THREE.SpotLight(0xffd29a, 9, 4, 0.7, 0.7, 2);
  lamp.position.copy(bulbPos);
  lamp.target.position.set(-0.9, 0.04, 0.35);
  scene.add(lightWall1, lightWall3, lightKb, lamp, lamp.target);

  // ----- theme -----
  function applyPalette() {
    C.bg1.set(pal.bg1);
    C.bg2.set(pal.bg2);
    C.a1.set(pal.accent1);
    C.a2.set(pal.accent2);
    C.a3.set(pal.accent3);
    binders.forEach((fn) => fn());
  }
  // The neon strips, wall lights and wall glows take the accents rotated by `tint` (a click on the
  // controller steps it); `pulse` briefly boosts them. A theme change resets tint to 0.
  let tint = 0;
  let pulse = 0;
  const accents = [C.a1, C.a2, C.a3]; // the Color objects are mutated in place, so this never goes stale
  let neonHex = '';
  let rot = accents;
  // retint: the tint or the palette changed (rotate, recolour lights/glows, publish the hex); the per-frame
  // pulse fade passes false and only rescales the strips and lights, with no allocation.
  function applyNeon(retint = true) {
    if (retint) rot = rotateAccents(accents, tint);
    const [s1, s2, s3] = rot;
    const boost = 1 + pulse * 1.4;
    neonA1.color.copy(s1).multiplyScalar(boost);
    neonA2.color.copy(s2).multiplyScalar(boost);
    neonA3.color.copy(s3).multiplyScalar(boost);
    lightWall1.intensity = 6 * (1 + pulse * 0.9);
    lightWall3.intensity = 4 * (1 + pulse * 0.9);
    if (!retint) return;
    lightWall1.color.copy(s1);
    lightWall3.color.copy(s3);
    glowA.material.color.copy(s1);
    glowB.material.color.copy(s3);
    const hex = `#${s1.getHexString()}`; // current colour of the first neon strip (read by tools/check-hero.mjs)
    if (hex !== neonHex) { neonHex = hex; el.dataset.heroNeon = hex; }
  }
  onPalette(() => {
    scene.background.copy(C.bg1).multiplyScalar(0.8);
    wallMat.color.copy(C.bg2).lerp(C.bg1, 0.35).multiplyScalar(1.5);
    applyNeon();
    lightKb.color.copy(C.a2);
    glowK.material.color.copy(C.a2);
    const css = (c) => `#${c.getHexString()}`; // linear -> sRGB hex for the 2D canvas
    const ink = { kw: css(C.a2), str: css(C.a3), type: css(C.a1) };
    screens.forEach((s) => s.setInk({ ...ink, bg: css(C.bg1.clone().multiplyScalar(0.55)) }));
  });
  const tmp = new THREE.Color();

  // ----- sizing -----
  function resize() {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect >= 1.2 ? 32 : 32 + (1.2 - aspect) * 45;
    if (aspect > 1.15) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); // push the desk right, text lives left
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (!animate) renderOnce();
  }

  // ----- interaction state -----
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let scrollP = 0;
  let smoothP = 0;
  const camBase = new THREE.Vector3(0.1, 1.35, 4.5);
  const lookBase = new THREE.Vector3(0.1, 0.42, 0);
  const camNear = new THREE.Vector3(main.center.x, main.center.y - 0.02, 1.9);
  const lookNear = main.center.clone();
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();

  const onPointer = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => {
    const parent = el.parentElement ?? el;
    scrollP = clamp(window.scrollY / Math.max(1, parent.offsetHeight * 0.85), 0, 1);
  };

  // ----- pointer interaction: monitor, controller, keyboard -----
  // Hover is raycast at most once per frame (the move handler only stores the latest position);
  // a click or tap is raycast on the spot. Events that start on text or a control are ignored.
  const host = el.parentElement ?? el; // the hero section: the canvas itself sits behind the text
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aim = { x: 0, y: 0, pending: false };
  const hov = { monitor: 0, pad: 0 };
  const padY = pad.position.y;
  const capTint = new THREE.Color();
  const kbLocal = new THREE.Vector3();
  let hovered = null;
  let rumble = 0;

  function castAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || scrollP > 0.6) return null; // scrolled past the hero
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hitTargets, false)[0];
    if (!hit) return null;
    return { kind: hit.object === hitMonitor ? 'monitor' : hit.object === hitPad ? 'pad' : 'keyboard', point: hit.point };
  }
  function lightKeys(point, level) {
    kbLocal.copy(point);
    kb.worldToLocal(kbLocal);
    for (const { i, w } of keysNear(keyPos, kbLocal.x, kbLocal.z)) keyHover[i] = Math.max(keyHover[i], w * level);
  }
  function setHovered(kind) {
    if (kind === hovered) return;
    hovered = kind;
    document.body.style.cursor = kind === 'monitor' || kind === 'pad' ? 'pointer' : '';
    if (kind) el.dataset.heroHover = kind;
    else delete el.dataset.heroHover;
  }
  const onHostMove = (e) => {
    if (e.pointerType === 'touch') return; // touch only taps; it never needs hover
    if (isUiTarget(e.target)) { aim.pending = false; setHovered(null); return; }
    aim.x = e.clientX;
    aim.y = e.clientY;
    aim.pending = true;
  };
  const onHostLeave = () => { aim.pending = false; setHovered(null); };
  const onHostClick = (e) => {
    if (disposed || isUiTarget(e.target)) return;
    const hit = castAt(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === 'monitor') {
      document.getElementById('projects')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    } else if (hit.kind === 'pad') {
      tint = nextTint(tint);
      pulse = 1;
      rumble = 1;
      applyNeon();
    } else {
      main.scr.burst(60);
      lightKeys(hit.point, 1);
    }
  };

  // ----- loop -----
  let clock = 0;
  function update(dt) {
    clock += dt;
    if (aim.pending) {
      aim.pending = false;
      const hit = castAt(aim.x, aim.y);
      setHovered(hit?.kind ?? null);
      if (hit?.kind === 'keyboard') lightKeys(hit.point, 1);
    }
    hov.monitor = ease(hov.monitor, hovered === 'monitor' ? 1 : 0, dt, 9);
    hov.pad = ease(hov.pad, hovered === 'pad' ? 1 : 0, dt, 9);
    main.face.material.color.setScalar(1 + hov.monitor * 0.5);
    glowA.material.opacity = 0.28 + hov.monitor * 0.22;
    rumble = fade(rumble, dt, 0.5);
    pad.position.y = padY + hov.pad * 0.012;
    pad.rotation.z = Math.sin(clock * 70) * 0.07 * rumble;
    pad.rotation.x = Math.sin(clock * 53 + 1) * 0.05 * rumble;
    if (pulse > 0) {
      pulse = fade(pulse, dt, 0.7);
      applyNeon(false);
    }
    smoothP += (scrollP - smoothP) * (1 - Math.exp(-dt * 5));
    const k = 1 - Math.exp(-dt * 3);
    pointer.sx += (pointer.x - pointer.sx) * k;
    pointer.sy += (pointer.y - pointer.sy) * k;
    const e = smoothP * smoothP * (3 - 2 * smoothP);
    camPos.lerpVectors(camBase, camNear, e);
    look.lerpVectors(lookBase, lookNear, e);
    const amt = 1 - e;
    camPos.x += pointer.sx * 0.28 * amt;
    camPos.y += -pointer.sy * 0.12 * amt;
    camera.position.copy(camPos);
    camera.lookAt(look);

    el.style.opacity = String(1 - smoothP);

    // typing + screens
    const typedMain = main.scr.step(dt, 34);
    side.scr.step(dt, 28);
    main.scr.flush(clock);
    side.scr.flush(clock + 0.04);
    for (let n = 0; n < typedMain; n++) flash[Math.floor(Math.random() * (KEYS - 1))] = 1;

    // key glow: slow wave across the board in the accents + flashes for "typed" keys
    for (let i = 0; i < KEYS; i++) {
      const kp = keyPos[i];
      const wave = 0.5 + 0.5 * Math.sin(kp.x * 4.2 + kp.z * 3 - clock * 1.1);
      tmp.copy(C.a1).lerp(C.a2, wave).lerp(C.a3, Math.max(0, Math.sin(clock * 0.4 + kp.x * 2)) * 0.5);
      const h = keyHover[i];
      tmp.lerp(C.a1, h * 0.7).lerp(white, h * 0.35); // towards the lead accent, a touch of white at the peak
      tmp.multiplyScalar(0.28 + 0.4 * wave + flash[i] * 0.9 + h * 2.8);
      legends.setColorAt(i, tmp);
      flash[i] = Math.max(0, flash[i] - dt * 3.5);
      keyHover[i] = fade(h, dt, 0.4);
      if (h > 0 || lifted[i]) { // a lit key rises, swells and takes the accent on its cap, then settles as it fades
        placeKey(i, h * 0.012, h * 0.12);
        caps.setColorAt(i, h > 0 ? capTint.copy(C.a1).multiplyScalar(1 + h * 7) : white);
        lifted[i] = h > 0 ? 1 : 0;
        liftDirty = true;
      }
    }
    if (liftDirty) {
      liftDirty = false;
      caps.instanceMatrix.needsUpdate = true;
      caps.instanceColor.needsUpdate = true;
      legends.instanceMatrix.needsUpdate = true;
    }
    legends.instanceColor.needsUpdate = true;
  }

  function renderOnce() {
    renderer.render(scene, camera);
  }

  let disposed = false;
  let raf = 0;
  let running = false;
  let inView = true;
  let last = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt);
    renderOnce();
  }
  function sync() {
    const should = animate && inView && !document.hidden && !disposed;
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(raf);
    io?.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScroll);
    host.removeEventListener('pointermove', onHostMove);
    host.removeEventListener('pointerleave', onHostLeave);
    host.removeEventListener('click', onHostClick);
    setHovered(null);
    delete el.dataset.heroNeon;
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    const textures = new Set([glowTex]);
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => { if (m.map) textures.add(m.map); m.dispose(); });
    });
    textures.forEach((t) => t.dispose());
    caps.dispose();
    legends.dispose();
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss(); // three warns if the context is already gone
    canvas.remove();
    el.style.opacity = '';
  }

  let contextLost = false;
  function onContextLost(ev) {
    contextLost = true;
    ev.preventDefault();
    if (disposed) return;
    dispose();
    onLost?.();
  }
  canvas.addEventListener('webglcontextlost', onContextLost);

  const ro = new ResizeObserver(() => { if (!disposed) resize(); });
  ro.observe(el);
  let io = null;
  if (animate) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    host.addEventListener('pointermove', onHostMove, { passive: true });
    host.addEventListener('pointerleave', onHostLeave);
    host.addEventListener('click', onHostClick);
    document.addEventListener('visibilitychange', sync);
    io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(el);
    onScroll();
    smoothP = scrollP;
  }

  applyPalette();
  if (capture || !animate) screens.forEach((s) => { s.complete(); s.draw(); });
  else screens.forEach((s) => s.draw());
  resize();
  update(0.016);

  // The probe times the first frame that actually draws the scene. One untimed warm-up render comes
  // first so one-off shader link and texture/buffer uploads (which say nothing about steady fps) are
  // not counted against the device.
  renderer.compile(scene, camera);
  renderOnce();
  renderer.getContext().finish();
  const t0 = performance.now();
  renderOnce();
  renderer.getContext().finish();
  const firstFrameMs = performance.now() - t0;
  sync();
  onFirstFrame?.(firstFrameMs);

  return {
    canvas,
    dispose,
    setTheme(theme) {
      if (disposed) return;
      const next = readPalette(theme);
      if (Object.keys(next).some((k) => next[k] !== pal[k])) { tint = 0; pulse = 0; } // a new theme starts from its own accent order
      Object.assign(pal, next);
      applyPalette();
      if (!animate) renderOnce();
    },
  };
}
