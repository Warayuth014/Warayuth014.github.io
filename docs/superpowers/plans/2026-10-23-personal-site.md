# Personal Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GearUpIT demo at `warayuth014.github.io` with a bilingual (TH/EN) personal site with a three.js "night desk" hero, a résumé page, articles, and a password-protected `/edit` that saves through a Cloudflare Worker into this repo.

**Architecture:** Plain static files on GitHub Pages, no build step for the site: ES modules in `assets/js/`, all editable content in `content/site.json` and `content/articles/<slug>.json`, uploads in `uploads/`. Article pages are static HTML generated from a shared template module. A Cloudflare Worker (`worker/`) checks the password (hash + rate limits in KV), holds the GitHub token as a secret, validates with the same shared schema module, and commits multi-file changes through the GitHub Git Data API.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), three.js `0.160.0` (importmap from `https://unpkg.com/three@0.160.0/...`), Google Fonts, Cloudflare Workers + KV + wrangler 4, Node 24 `node --test` for unit tests, playwright-core (headless Chrome/Edge) for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-23-personal-site-design.md`

## Global Constraints

- Site is served by GitHub Pages as plain files from `main`; the owner never runs a build. Worker bundling by wrangler is allowed.
- Every user-visible text exists in `th` and `en`; an empty side falls back to the other. UI labels in `/edit` are Thai-first.
- Default theme: background `#0b0f1d → #1d0f2e`, accents `#7cf3ff`, `#a98bff`, `#ff6fd1`; theme is editable.
- Hero = concept "night desk" (two monitors with generic self-typing code, glowing keyboard, game controller, neon strips); ambient background = "threads of light". No WMS/ASRS theme on the site; company names appear only in the Journey section (one line each).
- Contact: `b.warayuth@gmail.com`, LinkedIn `https://www.linkedin.com/in/warayut-bunbanlu-1b621b301/`, Facebook `https://www.facebook.com/warayut.bunbanlu/`, Instagram `https://www.instagram.com/_wryh._`, GitHub `https://github.com/Warayuth014`. Phone hidden by default.
- Journey: University of the Thai Chamber of Commerce (B.Sc. Computer Science, 2025) → Jupiter Software (Jan–Apr 2025) → ACETEC Technology (Sep 2025 – present). Languages: Thai (native), English (basic–intermediate). Hobbies: gaming, badminton. City: Bangkok, Thailand.
- Photo and résumé: placeholder / "coming soon" until uploaded via `/edit`.
- `/ig-followguide/` keeps its URL and files untouched; GearUpIT moves to `/projects/gearupit/` and keeps working.
- Worker: GitHub token only as a Worker secret; password stored only as a salted slow hash in KV; CORS only `https://warayuth014.github.io` and `http://localhost:*`/`http://127.0.0.1:*`; writes only under `content/`, `uploads/`, `articles/`; uploads only images (png, jpg, webp, gif, svg rejected) and PDF, max 8 MB.
- Rate limits: per IP 5 failures / 15 min → refuse that IP 15 min; global > 50 failures / hour → refuse all logins 1 hour. Only failures write to KV. Session ~2 hours.
- Concurrent saves: refuse with "มีคนบันทึกก่อนหน้า กดโหลดใหม่" when the base commit moved.
- Respect `prefers-reduced-motion`; weak devices get a still poster instead of live 3D.
- Thai font that renders tone marks correctly with comfortable line height (e.g. Noto Sans Thai / IBM Plex Sans Thai) + a characterful Latin display face; no "AI default" look (no cream+serif+terracotta, no purple gradient on white, no emoji section markers).
- External scripts pinned to exact versions; no other third-party services.

## Review Focus

- **Injected markup in edited text or articles** (`<script>`, `onerror=`, `javascript:` links): must render as text / be stripped everywhere (site, article pages, edit preview). → tests in Task 2 (sanitizer) and Task 6 (article render).
- **Very long or empty fields** (a 2,000-character About, an empty EN title, a project with no image): layout must wrap, fall back, and never break. → browser check in Task 3 and Task 5.
- **Thai text** with stacked tone marks and long words without spaces: no clipping, sensible line breaking (`word-break: keep-all` is wrong for Thai; use `line-break: auto` + `overflow-wrap: anywhere` on narrow containers). → browser check in Task 3.
- **WebGL unavailable or context lost** (old phone, privacy browser, GPU reset): poster shown, page still usable, no console error loop. → test in Task 4.
- **Saving while GitHub Pages still serves the old version**: after a save the editor must say "live in about a minute" and not reload stale content as if the save failed. → test in Task 8.

---

## File Structure

```
index.html                      home page shell (sections rendered from content)
404.html                        styled not-found page
resume/index.html               résumé page
articles/index.html             static article list (generated)
articles/<slug>/index.html      static article pages (generated)
edit/index.html                 editor shell (noindex), loads assets/edit/*
assets/css/site.css             site styles, theme via CSS variables
assets/js/site.js               boot: load content, theme, language, render sections, lazy hero
assets/js/sections/*.js         one renderer per section: about, projects, skills, journey, articles, contact
assets/js/fx/*.js               2D effects: tilt, reveal, cursor-glow
assets/js/hero/desk.js          three.js night-desk scene
assets/js/hero/threads.js       ambient threads background
assets/js/hero/device.js        capability / weak-device detection
assets/img/hero-poster.webp     still of the hero (captured from the scene)
assets/edit/*.js, edit.css      editor UI
shared/schema.js                validateSite, validateArticle (browser + Worker)
shared/i18n.js                  t(), pick language, fallback
shared/sanitize.js              escapeHtml, sanitizeRichText
shared/render-article.js        renderArticlePage, renderArticleList (static HTML strings)
content/site.json               all editable site content
content/articles/<slug>.json    article data (bilingual, rich text)
uploads/                        uploaded images and résumé
projects/gearupit/...           moved demo
ig-followguide/...              untouched
worker/src/*.js, wrangler.toml, package.json, README.th.md, test/*.test.js
tests/*.test.mjs                node --test unit tests for shared/
tools/check-links.mjs           local link/asset checker
tools/browser-check.mjs         playwright-core smoke checks
package.json                    test scripts (dev only; site does not need it)
```

---

### Task 1: Move GearUpIT and add the link checker

**Files:**
- Move: `index.html`, `style.css`, `css/`, `js/`, `pic/`, `video/`, `products/`, `note.txt` → `projects/gearupit/`
- Create: `tools/check-links.mjs`, `package.json`, `tests/check-links.test.mjs`
- Untouched: `ig-followguide/`

**Interfaces:**
- Produces: `node tools/check-links.mjs <html files…>` → exit 0 when every local `href`/`src`/`url()` resolves to a file; prints each missing path and exits 1 otherwise. `npm test` runs `node --test tests/`.

- [ ] **Step 1: Write the failing test** `tests/check-links.test.mjs`: a temp folder with a page linking `./a.css` (exists) and `./missing.png` → checker reports exactly `missing.png`; a page with only existing links → exit 0. External `https://` links and `#anchors` are ignored.
- [ ] **Step 2:** `npm test` → FAIL (no checker).
- [ ] **Step 3:** Implement `tools/check-links.mjs` (parse attributes with a regex is fine; decode `%20`; resolve relative to the page).
- [ ] **Step 4:** `git mv` the GearUpIT files into `projects/gearupit/`; fix any root-absolute paths (`/css/...`) so the demo works from its new folder; run `node tools/check-links.mjs projects/gearupit/index.html projects/gearupit/products/*.html ig-followguide/index.html` → exit 0; confirm `git diff --stat ig-followguide` is empty.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `chore: move GearUpIT demo to /projects/gearupit, add link checker`

### Task 2: Shared content model (schema, i18n, sanitizer) and seed content

**Files:**
- Create: `shared/schema.js`, `shared/i18n.js`, `shared/sanitize.js`, `content/site.json`, `tests/schema.test.mjs`, `tests/i18n.test.mjs`, `tests/sanitize.test.mjs`

**Interfaces:**
- Produces:
  - `content/site.json` shape: `{ version: 1, theme: { bg1, bg2, accent1, accent2, accent3, mode: "dark"|"light", fontPair: "default"|..., effects: { hero3d: bool, threads: bool } }, nav: [...], sections: [{ id: "hero"|"about"|"projects"|"skills"|"journey"|"articles"|"contact", visible: bool }], hero: { name: L, intro: L, ctaWork: L, ctaResume: L }, about: { photo: string|null, story: L, facts: [{ icon, label: L, value: L }] }, projects: [{ id, title: L, summary: L, body: L, tags: [string], image: string|null, links: { repo?, demo? } }], skills: [{ group: L, items: [string] }], journey: [{ when: L, title: L, place: L }], contact: { email, phone: string|null, links: [{ kind, url }] }, resume: { file: string|null, kind: "pdf"|"image"|null }, workerUrl: string }` where `L = { th: string, en: string }`.
  - `validateSite(obj) -> { ok: boolean, errors: string[] }` and `validateArticle(obj) -> { ok, errors }`; article: `{ slug: /^[a-z0-9-]{1,60}$/, title: L, summary: L, body: { th: RichText, en: RichText }, tags: [string], cover: string|null, date: "YYYY-MM-DD", published: bool }`, RichText = sanitized HTML string limited to `p, h2, h3, ul, ol, li, strong, em, a[href^=https:|mailto:], img[src^=/uploads/|https:], pre, code, blockquote, br`.
  - `t(field: L, lang: "th"|"en") -> string` (falls back to the other language, then `""`); `detectLang() -> "th"|"en"` (localStorage `lang`, else `navigator.language` starts with `th` → `th`, else `en`).
  - `escapeHtml(s)`, `sanitizeRichText(html) -> html` (allowlist above; strips everything else incl. event handlers and `javascript:`; must work in both browser and Worker without DOM — implement a small tokenizer, no DOMParser).

- [ ] **Step 1: Write failing tests:** schema rejects missing `hero.name`, a section id not in the list, a non-https link, an upload path outside `/uploads/`; accepts the seed file. i18n: `t({th:"",en:"Hi"},"th") === "Hi"`. Sanitizer: `<img src=x onerror=alert(1)>` → `<img src="x">` dropped (src not allowed) or stripped of the handler; `<a href="javascript:alert(1)">x</a>` → link without href; `<script>alert(1)</script>` → removed; `<p>สวัสดี <strong>โลก</strong></p>` unchanged.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement the three modules (pure ES modules, no dependencies).
- [ ] **Step 4:** Write `content/site.json` seed: friendly intro (not résumé bullets) in natural Thai and English, facts from Global Constraints, projects seeded from FollowGuide, GearUpIT (`/projects/gearupit/`), Ariadne (text only, private), `zero-to-senior-flutter-dotnet-course`, plus up to 2 more suitable public repos read with `gh repo list Warayuth014 --json name,description,isFork` (no forks); skills grouped Mobile/Frontend, Backend, Data, Tools; `workerUrl: ""`.
- [ ] **Step 5:** `npm test` → PASS (seed validates).
- [ ] **Step 6: Commit** `feat: shared content schema, i18n, sanitizer and seed content`

### Task 3: Site shell, theme, language, sections

**Files:**
- Create: `index.html`, `404.html`, `assets/css/site.css`, `assets/js/site.js`, `assets/js/sections/{about,projects,skills,journey,articles,contact}.js`, `tools/browser-check.mjs`

**Interfaces:**
- Consumes: Task 2 modules and `content/site.json`.
- Produces: `boot({ content?: SiteContent, preview?: true })` exported from `assets/js/site.js` (Task 8 calls it inside the preview iframe with draft content); each section module exports `render(el, content, lang)`; `applyTheme(theme)` sets CSS variables `--bg1 --bg2 --accent1 --accent2 --accent3`; `setLang(lang)` re-renders and stores `localStorage.lang`. `index.html` contains `<section id>` placeholders only; hero slot `#hero` is filled by Task 4. `tools/browser-check.mjs <url> [--mobile]` launches headless Chrome/Edge via playwright-core, prints console errors, failed requests, external hosts, and saves a screenshot; exits 1 on console errors.

- [ ] **Step 1:** Build the shell and section renderers (all text via `t()` and `escapeHtml`; rich text only via `sanitizeRichText`). Nav: section links, TH/EN toggle, Résumé link; compact menu below 720 px. Hidden sections are not rendered; order follows `sections`.
- [ ] **Step 2: Browser check** (`npx http-server`-free: `node tools/serve.mjs` or `python -m http.server` from repo root on a free port): desktop + `--mobile`; TH/EN toggle changes every text and persists after reload; a fixture copy of site.json with a 2,000-char About, an empty EN project title and a project with no image renders without overflow (no horizontal scroll); Thai tone marks not clipped; console clean; only allowed external hosts (fonts.googleapis.com, fonts.gstatic.com, unpkg.com). Save screenshots to `docs/superpowers/shots/task3-*.png`.
- [ ] **Step 3:** Run link checker on `index.html` and `404.html` → exit 0.
- [ ] **Step 4: Commit** `feat: site shell with theme, TH/EN and content-driven sections`

### Task 4: Hero 3D night desk, ambient threads, device fallback

**Files:**
- Create: `assets/js/hero/desk.js`, `assets/js/hero/threads.js`, `assets/js/hero/device.js`, `assets/img/hero-poster.webp`, `tests/device.test.mjs`
- Modify: `assets/js/site.js` (lazy-load hero after first paint), `assets/css/site.css`

**Interfaces:**
- Produces: `mountDesk(el, { theme, reducedMotion }) -> { dispose() }`; `mountThreads(el, theme) -> { dispose() }`; `chooseHeroMode({ reducedMotion, webgl, width, deviceMemory, firstFrameMs }) -> "live"|"poster"` (pure, tested); `hasWebGL() -> boolean`.

- [ ] **Step 1: Failing tests** for `chooseHeroMode`: reduced motion → poster; no WebGL → poster; width 390 + deviceMemory 2 → poster; first frame > 120 ms → poster; desktop default → live.
- [ ] **Step 2:** `npm test` → FAIL; implement `device.js`; → PASS.
- [ ] **Step 3:** Implement the scene from code/geometry (no large model files): desk, two monitors with canvas-texture code typing generic snippets (not WMS), glowing keyboard, controller, neon strips, theme accent colours; camera eases toward mouse; scroll moves camera toward the monitor and fades the hero out; pause when off-screen (IntersectionObserver) or `document.hidden`; cap pixel ratio at 2; handle `webglcontextlost` by switching to the poster.
- [ ] **Step 4:** `threads.js`: subtle connected points behind content (low opacity, cursor pull), off when `theme.effects.threads` false or reduced motion.
- [ ] **Step 5:** Capture `assets/img/hero-poster.webp` from the live scene with playwright-core (≤ 200 KB).
- [ ] **Step 6: Browser check:** desktop: hero readable text visible before three.js finishes loading, frame time sampled over 3 s average ≤ 20 ms on this machine; `--mobile` emulation and a run with WebGL disabled (`--disable-gpu --disable-webgl`) show the poster with no console errors; reduced-motion emulation shows the poster. Screenshots to `docs/superpowers/shots/task4-*.png`.
- [ ] **Step 7: Commit** `feat: three.js night-desk hero, ambient threads and weak-device poster`

### Task 5: 2D interactions and section polish

**Files:**
- Create: `assets/js/fx/tilt.js`, `assets/js/fx/reveal.js`, `assets/js/fx/cursor-glow.js`
- Modify: section renderers (projects detail view, skills hover, journey timeline), `assets/css/site.css`, `404.html`

**Interfaces:**
- Produces: `enableTilt(root)`, `enableReveal(root)`, `enableCursorGlow()`, each returning `dispose()` and doing nothing under reduced motion or coarse pointers where noted.

- [ ] **Step 1:** Implement effects; project card opens an accessible detail dialog (focus trap, Esc closes, URL hash `#project-<id>` deep-links and works on reload); keyboard reachable everywhere with visible focus.
- [ ] **Step 2: Browser check:** keyboard-only pass through nav → project dialog → close; `#project-<id>` deep link opens it; no layout shift on reveal (content visible at rest without JS animation); reduced motion disables tilt/reveal/glow; mobile has no hover-only content. Screenshots `task5-*.png`.
- [ ] **Step 3: Commit** `feat: tilt, reveal, cursor glow, project detail dialog`

### Task 6: Résumé page and static article pages

**Files:**
- Create: `resume/index.html`, `shared/render-article.js`, `content/articles/welcome.json`, `articles/index.html`, `articles/welcome/index.html`, `tools/render-articles.mjs`, `tests/render-article.test.mjs`

**Interfaces:**
- Consumes: Task 2 schema/sanitizer/i18n.
- Produces: `renderArticlePage(article: Article, site: SiteContent) -> string` (full HTML document: both languages embedded, TH/EN toggle, `<title>`, `<meta name=description>`, Open Graph `og:title/og:description/og:image/og:url` from the article, canonical URL `https://warayuth014.github.io/articles/<slug>/`); `renderArticleList(articles: Article[], site) -> string` (published only, newest first); `node tools/render-articles.mjs` regenerates both from `content/articles/*.json` (used locally and mirrored by the Worker in Task 7).

- [ ] **Step 1: Failing tests:** rendered page escapes `<script>` in the title and drops it from the body; contains `og:title` with the TH title when TH is the default; list excludes `published:false` and sorts by date desc; slug in canonical URL.
- [ ] **Step 2:** `npm test` → FAIL; implement; → PASS.
- [ ] **Step 3:** Seed one short welcome article in natural TH and EN (no invented achievements); run the generator; résumé page shows the PDF in an `<iframe>`/`<object>` with download button when `resume.kind=="pdf"`, an `<img>` for images, and a friendly "เร็วๆ นี้ / Coming soon" state when null.
- [ ] **Step 4: Browser check** of `/resume/`, `/articles/`, `/articles/welcome/` (both languages, mobile), link checker on all three → exit 0.
- [ ] **Step 5: Commit** `feat: résumé page and static article pages`

### Task 7: Cloudflare Worker (auth, rate limits, commits)

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/src/index.js`, `worker/src/auth.js`, `worker/src/ratelimit.js`, `worker/src/github.js`, `worker/src/routes.js`, `worker/test/*.test.js`, `worker/README.th.md`, `worker/scripts/set-password.mjs`

**Interfaces:**
- Consumes: `shared/schema.js`, `shared/sanitize.js`, `shared/render-article.js` (imported by relative path; wrangler bundles).
- Produces (HTTP, JSON, all `POST` except `GET /health`):
  - `POST /login {password}` → `200 {token, expiresAt}` | `401 {error:"รหัสไม่ถูกต้อง"}` | `429 {error, retryAfter}`
  - `GET /state` (auth) → `{ headSha, site, articles: [...] }` read from the repo
  - `POST /save {baseSha, site?, articles?: Article[], deleteArticles?: [slug]}` (auth) → validates, regenerates article pages + list, commits all files in **one** commit (Git Data API: blobs → tree → commit → update ref) → `{ commitSha }`; `409 {error:"มีคนบันทึกก่อนหน้า กดโหลดใหม่"}` when `baseSha` ≠ current head
  - `POST /upload {name, contentType, dataBase64}` (auth) → `{ path:"/uploads/<yyyy>/<random>-<safe-name>" }`; rejects types/sizes outside Global Constraints
  - `POST /delete-upload {path}` (auth)
  - `POST /password {current, next}` (auth) → updates the KV hash, revokes other sessions
  - Session token: HMAC-SHA256 signed `{exp, ver}` with secret `SESSION_SECRET`; `ver` stored in KV (bump on password change).
  - Secrets: `GITHUB_TOKEN`, `SESSION_SECRET`; vars: `REPO="Warayuth014/Warayuth014.github.io"`, `BRANCH="main"`, `ALLOWED_ORIGINS`; KV binding `STATE` (keys `pw:hash`, `pw:ver`, `fail:ip:<ip>`, `fail:global:<hour>`).
  - Password hash: PBKDF2-SHA256 (WebCrypto), 16-byte salt, 210,000 iterations; constant-time compare.

- [ ] **Step 1: Failing tests** (`node --test worker/test`, fake KV and fake `fetch` to GitHub): correct PIN → token; wrong PIN ×5 from one IP → 6th is `429` even with the right PIN, works again after 15 min (inject clock); 51 global failures in an hour → `429` for everyone; `/save` without token → 401; path outside `content/|uploads/|articles/` never committed; invalid site.json → `400` with errors and no GitHub write; stale `baseSha` → `409`; a save with site + 2 articles makes exactly one commit containing site.json, both article JSON, both article pages and the list; upload of `image/svg+xml` or 9 MB → 400; CORS preflight from another origin → no `Access-Control-Allow-Origin`; responses and logs never contain `GITHUB_TOKEN`.
- [ ] **Step 2:** run → FAIL; implement modules; run → PASS.
- [ ] **Step 3:** `wrangler dev` smoke: `/health` 200; login with a password set through `worker/scripts/set-password.mjs --local`.
- [ ] **Step 4:** `worker/README.th.md`: Thai step-by-step for the owner — create the fine-grained token (only this repo; Contents: Read and write; Metadata: Read), `npx wrangler login`, `npx wrangler kv namespace create STATE`, put the id in `wrangler.toml`, `npx wrangler secret put GITHUB_TOKEN`, `... SESSION_SECRET`, `node scripts/set-password.mjs` (sets first PIN), `npx wrangler deploy`, copy the Worker URL into `/edit` Settings; plus "ลืมรหัส / ถูกล็อก" reset command.
- [ ] **Step 5: Commit** `feat: Cloudflare Worker for password login and commits`

### Task 8: Editor `/edit`

**Files:**
- Create: `edit/index.html` (`<meta name="robots" content="noindex,nofollow">`), `assets/edit/edit.css`, `assets/edit/app.js`, `assets/edit/api.js`, `assets/edit/panels/{sections,texts,theme,projects,skills,journey,articles,resume,contact,settings}.js`, `assets/edit/richtext.js`

**Interfaces:**
- Consumes: Worker API (Task 7), `boot({content, preview:true})` (Task 3), schema/sanitize (Task 2).
- Produces: `api.login(pw)`, `api.state()`, `api.save(payload)`, `api.upload(file)`, `api.deleteUpload(path)`, `api.changePassword(cur, next)`; worker URL from `content/site.json.workerUrl`, overridable in Settings (stored in localStorage) so the owner can connect before the first save.

- [ ] **Step 1:** Login screen (Thai labels, password field, error/lockout messages from the API verbatim); session kept in `sessionStorage` only.
- [ ] **Step 2:** Panels: every `L` field shows TH and EN inputs side by side; Sections = drag (and keyboard up/down) to reorder + visibility switch; Theme = 5 colour pickers, mode, font pair list, effect switches, "รีเซ็ตเป็นธีมเริ่มต้น"; Projects/Skills/Journey = add/edit/delete/reorder with image upload; Articles = list + editor (`richtext.js`: contenteditable with toolbar for h2/h3, bold, italic, lists, link, image upload, code block, quote; output passed through `sanitizeRichText`), slug auto from EN title, date, tags, published switch; Résumé = upload PDF/image, preview, remove; Contact = email, optional phone, links; Settings = Worker URL, change password.
- [ ] **Step 3:** Live preview: an iframe of `/index.html?preview=1` receiving the draft via `postMessage` → `boot({content: draft, preview:true})`; article preview renders with `renderArticlePage`.
- [ ] **Step 4:** Save: validate locally first (show errors next to fields), send `baseSha`; on success show "บันทึกแล้ว — เว็บจริงจะเปลี่ยนในประมาณ 1 นาที" and keep the saved draft as the new baseline (do **not** re-fetch the live site and treat stale content as failure); on 409 show the Worker message with a reload button; on network/Worker errors show a clear Thai message and keep the draft (also autosave the draft to localStorage).
- [ ] **Step 5: Browser check against `wrangler dev`** with a test branch or a fake GitHub (Worker started with `REPO` pointing to a throwaway repo the controller provides, or with a local fake): login wrong ×5 → lockout message; right PIN → panels load; edit About TH + save → one commit; add an article with an image → article page generated; change accent colour → preview updates instantly; 409 path shown when baseSha is stale; console clean. Screenshots `task8-*.png`.
- [ ] **Step 6: Commit** `feat: /edit editor with live preview and Worker saves`

### Task 9: Go live with the owner (controller-run)

- [ ] **Step 1:** Push `main`; wait for Pages; run `tools/browser-check.mjs https://warayuth014.github.io/` desktop + mobile; check `/ig-followguide/`, `/projects/gearupit/`, `/resume/`, `/articles/welcome/`.
- [ ] **Step 2:** Walk the owner through `worker/README.th.md` (token, KV, secrets, first PIN, deploy); put the Worker URL in Settings and save once (this writes `workerUrl` to `content/site.json`).
- [ ] **Step 3:** Owner runs success checks 4–6 from the spec on the live site (edit About TH, add an article with image, change accent colour); controller verifies the commits on GitHub and that `GITHUB_TOKEN` appears nowhere in the repo (`git grep -n "github_pat_\|ghp_"` → nothing).
- [ ] **Step 4:** README for the repo (Thai + English short: what the site is, how to edit at `/edit`, where the Worker lives).
