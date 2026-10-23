# Personal site: design

Owner: Warayuth Bunbanlu (GitHub `Warayuth014`). Site: `https://warayuth014.github.io` (GitHub Pages, repo `Warayuth014/Warayuth014.github.io`, branch `main`).

## Intent

Replace the current page (a bootcamp e-commerce demo "GearUpIT" copied from someone else's template) with a personal introduction website that feels like the owner: a developer by day and a gamer by night. Visitors should be impressed first, then understand who he is. It is **not** a formal résumé; the résumé lives on its own page as an uploaded image or PDF.

The owner wants to change everything on the site himself, without editing code, from `/edit`, protected by a simple password he chooses (e.g. a 6-digit PIN) and can share with someone he trusts.

## Users

- **Visitors:** HR, potential clients, other developers, friends. Any device; many on phones.
- **Editor:** the owner (and anyone he gives the password to).

## Goals

1. A beautiful, interactive home page with a real-time 3D hero (three.js) and 2D touches.
2. Bilingual: Thai and English, switchable on every page (TH / EN toggle, remembered).
3. A separate Résumé page that shows an uploaded image or PDF, with a download button.
4. Articles: list + reading pages, tags.
5. `/edit`: change all texts (both languages), turn sections on/off and reorder them, change the theme, write/edit/delete articles, upload images and the résumé file, manage projects, change the password.
6. Saves publish to the live site automatically (Git commit to this repo; GitHub Pages redeploys in about a minute).

## Non-goals

- Not a WMS showcase. Work (WMS, ASRS, company names, customer names) is not the theme; at most a one-line mention in the Journey section. Work detail belongs to the résumé file and the GitHub profile.
- No user accounts, comments, analytics dashboards, newsletter, or e-commerce.
- No paid services. No custom domain (can be added later).
- No build step that the owner must run; the site works as plain files served by GitHub Pages (a build tool may be used by the builder only if the output is committed and `/edit` keeps working without the owner running anything).

## Anti-goals (failure even if it "works")

- Looks like a generic template or the "AI-generated" look (cream + serif + terracotta, purple gradient hero on white, emoji section markers, everything centered).
- Slow or janky: the hero must not block reading; a phone must stay smooth.
- The edit password or the GitHub write credential is exposed to visitors, or a short PIN can be brute-forced.
- An edit silently breaks the live site (invalid data published) with no way back.
- Text unreadable in either language (Thai font fallback, clipped Thai vowels/tone marks).

## Design direction (decided)

- **Mood:** dark, neon accents (cyan / violet / pink), "night desk" — matches the owner's GitHub profile banner (`Warayuth014/Warayuth014/assets/banner.svg`: gradient `#7cf3ff → #a98bff → #ff6fd1` on `#0b0f1d → #1d0f2e`). The theme is editable, so this is the default theme, not the only one.
- **Hero 3D (decided: concept "B · night desk", user-approved):** a stylised desk scene: two monitors with code typing itself (generic code, not WMS-specific), a glowing keyboard, a game controller, neon light strips. The camera follows the mouse a little. On scroll the camera moves toward the monitor and the hero hands off to the next section. Name, a one-line intro, and two buttons ("See my work", "Résumé") overlay the scene.
- **Ambient 2D/3D (concept "C · threads of light"):** a light, subtle field of connected light points used as the page background / section transitions; the cursor pulls the threads. Must never compete with text.
- **2D touches:** cards tilt toward the cursor, sections reveal on scroll, a soft cursor glow, hover micro-interactions. Respect `prefers-reduced-motion` (static hero image, no tilt/reveal).
- **Performance:** load three.js and the scene lazily after the page is readable; cap pixel ratio; pause rendering when the hero is off-screen or the tab is hidden; on low-end/mobile use a lighter scene or a pre-rendered image.

## Pages and sections

Home (sections in this default order; each can be hidden/reordered in `/edit`):

1. **Hero** — 3D night desk, name, intro line, buttons.
2. **About** — photo, short story, small 2D fact cards (city, languages, hobbies: gaming, badminton).
3. **Projects** — cards (image, title, short text, tags, links to GitHub / live demo). Click opens a detail view with more text and images. Seed with: FollowGuide (`/ig-followguide/`), GearUpIT (moved, see below), Ariadne (private tool; text only, no link), the Zero-to-Senior course repo, and the owner's other public repos the builder finds suitable (owner can edit later).
4. **Skills** — technology icons grouped (Frontend/Mobile, Backend, Data, Tools), playful hover.
5. **Journey** — short timeline: University of the Thai Chamber of Commerce (B.Sc. Computer Science, 2025) → Jupiter Software (Jan–Apr 2025) → ACETEC Technology (Sep 2025 – present). One line each.
6. **Articles** — latest posts with tags; link to all articles.
7. **Contact** — email `b.warayuth@gmail.com`, LinkedIn, Facebook, Instagram, GitHub (links from the owner's GitHub profile). The phone number is **not** shown by default (owner can add it in `/edit`).

Other pages: **Résumé** (`/resume/`), **Articles list** (`/articles/`), **Article** (one per post), **Project detail** (may be a modal or a page — builder's call), **404**.

Navigation: top bar with section links, TH/EN toggle, Résumé link. Mobile: compact menu.

## Content and data

- All editable content (texts in TH + EN, section order/visibility, theme, projects, skills, journey, contact links, article metadata) lives in data files in the repo (e.g. JSON); article bodies in their own files (e.g. Markdown or JSON per article). Uploads (images, résumé PDF/image) go into an uploads folder in the repo.
- Each text field has `th` and `en`; if one is empty the page shows the other.
- Seed content: from the owner's résumé (summary, education, experience, skills) and GitHub profile, rewritten as a friendly introduction rather than résumé bullet points. Write both languages; keep Thai natural, not translated word for word.
- Article topics (owner left it to the builder): developer notes, things learned, behind-the-scenes of projects, some gaming. Seed **one** short welcome article per language so the section isn't empty; no invented accomplishments.

## Existing content (decided by Claude, owner informed)

- Move the GearUpIT demo (current `index.html`, `style.css`, `css/`, `js/`, `pic/`, `video/`, `products/`) to `/projects/gearupit/`, fixing its relative links so it still works there; list it as a project.
- Keep `/ig-followguide/` exactly at its current URL, untouched.
- Remove `note.txt` from the published root (move into the GearUpIT folder or delete).

## The editor (`/edit`) and the backend

- `/edit` is a page of this site, not linked from the public pages, with `noindex`.
- **Password check and saving happen in a Cloudflare Worker** in the owner's existing Cloudflare account (free plan). The Worker:
  - stores a GitHub fine-grained personal access token limited to **this one repo**, contents read/write, as a Worker secret — never sent to the browser;
  - stores the password only as a salted hash (secret or KV), never in the repo;
  - exposes a small API: log in with the password → returns a short-lived session token (e.g. signed, ~2 hours); save content / upload file / delete file / change password, each requiring the session token;
  - writes to the repo through the GitHub API as commits with readable messages (e.g. "edit: about text (th)"), several file changes per save as one commit where practical;
  - limits failed password attempts (e.g. 5 per 15 minutes per IP plus a global cap) so a 6-digit PIN cannot be brute-forced; responds generically on failure;
  - only accepts writes to the site's content/upload paths (never workflow files, never other repos), validates file size/type (images, PDF; a sensible size cap) and validates content data before committing;
  - allows CORS only from `https://warayuth014.github.io` (and a local dev origin).
- `/edit` UI (Thai-first labels, English available): login with password; tabs or sidebar for Sections, Texts, Theme, Projects, Skills, Journey, Articles, Résumé & files, Contact, Settings (change password). Live preview of changes before saving. Article editor with headings, bold/italic, lists, links, images, code blocks — no code knowledge needed. Show "saved — live in about a minute". Show a clear error if the Worker or GitHub rejects a save.
- **Theme editor:** primary/accent colours, background style (dark/light), font pairing from a short list that supports Thai, intensity of effects (3D on/off, background threads on/off), and a "reset to default theme".
- **Safety:** before saving, validate data so the live site can't be broken by a bad edit; every save is a Git commit, so any version can be restored from GitHub history.

## Setup the owner does once (guided)

1. Create the GitHub fine-grained token for this repo only.
2. Deploy the Worker (builder provides the code, `wrangler.toml`, and step-by-step Thai instructions), put the token and initial password hash in as secrets, note the Worker URL.
3. Put the Worker URL in the site config.

## Constraints

- Hosting: GitHub Pages (static) + one Cloudflare Worker (free tier). No other servers.
- Libraries only from reputable CDNs or vendored into the repo, pinned versions; three.js for 3D.
- Thai typography: a web font that renders Thai well (e.g. from Google Fonts) with proper line height; English and Thai both look intentional.
- Accessible: keyboard navigation, visible focus, alt text, sufficient contrast, reduced-motion support.
- Repo size: keep new assets reasonable; compress images; the 3D scene built from code/geometry (no huge model files) unless a small model is clearly worth it.
- Must work on current Chrome, Edge, Safari, Firefox; phones and desktop.

## Decisions from the builder check (Claude's calls unless marked)

- **Photo (owner):** the first release uses a tasteful placeholder (e.g. initials / illustrated avatar in the theme); the owner uploads his real photo later from `/edit`. Same for the résumé file: `/resume/` shows a friendly "coming soon" state until a file is uploaded.
- **Known facts for seed content:** city Bangkok, Thailand; languages Thai (native), English (basic–intermediate); hobbies gaming, badminton; social links: LinkedIn `https://www.linkedin.com/in/warayut-bunbanlu-1b621b301/`, Facebook `https://www.facebook.com/warayut.bunbanlu/`, Instagram `https://www.instagram.com/_wryh._`, GitHub `https://github.com/Warayuth014`. The builder may read the owner's public GitHub repos with `gh` to seed projects.
- **`/edit` is a public static page** (login screen and editor code visible to anyone); security is enforced only by the Worker. The editor's code is separate from the visitor pages so visitors never download it.
- **Worker state in Cloudflare KV** (one extra guided setup step: create one KV namespace): the password hash (salted, slow hash; change-password updates it) and rate-limit counters. The initial password is set by a one-time setup call or a `wrangler` command, documented in the Thai setup guide.
- **Lockout numbers:** per IP 5 failed attempts per 15 minutes → that IP is refused for 15 minutes; globally more than 50 failed attempts in an hour → all logins refused for 1 hour (stops distributed guessing of a 6-digit PIN). Only failures write to KV, so the free-tier KV write limit is not a concern. **Recovery** if the owner is locked out or forgets the password: a documented `wrangler` command run by the owner resets the password and clears the counters.
- **Validation in both places:** one shared schema/validation module (plain JS) used by `/edit` (instant feedback) and by the Worker (the authority; rejects invalid data before committing). Wrangler's own bundling for the Worker is fine; "no build step" applies to the website only.
- **Concurrent edits:** saves send whole files with the last-known Git SHA; if someone else saved in between, the Worker refuses with a clear message ("มีคนบันทึกก่อนหน้า กดโหลดใหม่") instead of overwriting. `/edit` previews from its own unsaved state; after a save it shows "live in about a minute".
- **Articles get real URLs:** publishing an article commits a static HTML page per article (with title/description/share-image meta tags) plus the data file, so each article has a shareable link and works without JavaScript routing. Same approach for the article list.
- **Pages are real folders** (`/resume/`, `/articles/`, `/articles/<slug>/`, `/edit/`), plus a styled `404.html`.
- **Weak-device fallback is in scope:** reduced motion, or a small screen with low memory/slow first frames (a short frame-time probe), shows a still poster of the hero (an image the builder captures from the real scene and commits) with light 2D effects instead of the live 3D.
- **GearUpIT move:** the builder inspects every link and asset path in the old site and in `/ig-followguide/` and verifies both work after the move (success check 7).

## Left to the builder

- Exact file/data layout, framework or no framework (plain JS is fine; must not require the owner to build).
- Scene modelling details, post-processing, exact animations, loading choreography.
- Font choices within the constraints, icon sets.
- Project detail as modal vs page; article storage format.
- Worker implementation details (KV vs secrets for the hash and rate-limit state, session token format).
- Which extra public repos to seed as projects.

## Success checks

1. Opening the home page on desktop shows a smooth, good-looking 3D night-desk hero within ~2 s on a normal connection; on a mid-range phone it scrolls smoothly.
2. TH/EN toggle switches every visible text; the choice is remembered.
3. `/resume/` shows an uploaded PDF or image and downloads it.
4. In `/edit`, with the right password, changing the About text (TH) and saving shows the change on the live site after the Pages redeploy; a wrong password is refused, and repeated wrong attempts get locked out.
5. Writing a new article with an image in `/edit` publishes it to the Articles list and its own page.
6. Changing the theme accent colour in `/edit` changes the live site.
7. `/ig-followguide/` and `/projects/gearupit/` still work.
8. The GitHub token never appears in any file in the repo or any response to the browser.
