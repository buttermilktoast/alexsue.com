# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm run dev        # Vite dev server (localhost:5173)
npm run build      # outputs dist/ (git-ignored)
npm run preview    # serve the production build

# Tests — plain node:test, no runner, no install
node --test src/composables/useLiveStatus.test.mjs   # front-end pure logic
node --test src/composables/useSky.test.mjs          # solar position and sky palette
node --test infra/lambda/status.test.mjs             # Lambda status computation
node --test src/xmas26/data.test.mjs                 # the family card's data loading
node --test --test-name-pattern='wall-clock slots' src/composables/useLiveStatus.test.mjs   # single test
```

There is no lint step.

## Architecture

A static Vue 3 + Vite personal status dashboard deployed to GitHub Pages, plus a
small AWS pipeline that feeds it live health data pushed from a phone.

### Front end

- **`src/data/site.js` is the single source of truth for page content** — the NOW
  section, projects, hand-written status rows, and links. Components read from it;
  routine content edits never touch markup. `src/App.vue` composes the seven
  section components under `src/components/`.
- **Live status** (`src/composables/useLiveStatus.js`) polls one S3 JSON object
  and turns it into extra rows appended to the static ones in `StatusSection.vue`.
  Two rules drive its design: polls are aligned to **wall-clock slots**
  (`msUntilNextSlot`, e.g. :05/:20/:35/:50) so a fetch lands just after the
  phone's scheduled push rather than at page-load phase; and polling pauses while
  the tab is hidden. Rows keep rendering once data goes stale but every status
  dot drops to neutral (`buildRows`) — an old step count is information, a
  confident label on it would be a lie. Age is measured from the payload's own
  `updated` timestamp, not the fetch time.
- **Local conditions** (`src/composables/useWeather.js`) fetches Open-Meteo on a
  15-minute interval, also paused while the tab is hidden. The coordinates are a
  fixed city in `site.weather` — never device location — and there is no API key.
  Readings past `staleAfterMs` are withheld rather than shown stale, the opposite
  of the live-status rule above: a step count keeps its meaning as it ages, a
  temperature does not. °C/°F converts locally and persists per visitor.
- **Theming** (`src/composables/useTheme.js`) is four-state: sky (the default),
  light, dark, or system. Light and dark are stamped as `data-theme` on
  `<html>`; `system` stamps nothing and falls through to the
  `prefers-color-scheme` rules in `src/style.css`, so the OS is tracked by CSS
  rather than by a listener. Every component already draws from the tokens in
  `:root`, so a palette change is a token change. A tiny inline script in
  `index.html` re-stamps the stored choice before first paint; the `theme-color`
  meta is read back from whichever palette won. Theme state lives at module
  scope because the toggle and the backdrop both read it and must not drift.
- **The sky** (`src/composables/useSky.js`) is what the default mode follows.
  The sun's altitude over the fixed city in `site.weather` is computed locally
  from the coordinates rather than fetched, so the page dresses itself before
  the network answers and keeps doing so if it never does. Altitude becomes a
  smoothstepped `daylight` value across the -12°..+6° twilight band, and three
  things hang off it: the palette (`data-theme` flips about a degree above the
  horizon, so dawn is dark and getting lighter until the sun is actually up),
  a gradient backdrop interpolated between six anchor skies, and — from the
  shared weather reading — a tint and optional precipitation layer.

  Three rules shape it. **Weather tints, the sun decides**: a thunderstorm at
  noon is a darker noon, never a night, so the palette never keys off a weather
  code. **The sky gradates, the text does not**: interpolating text colours
  through twilight lands on mid-grey on mid-grey, so the backdrop carries the
  gradation and the palette flips once, masked to fade down the viewport so
  nothing is asked to hold contrast against a horizon. **Legibility is solved,
  not tuned**: `skyStrength` picks the largest opacity at which the palette's
  own `--muted` still clears 4.5:1 against the composited sky, reading the
  tokens back from the document so the stylesheet stays the only place the
  colours are written. That is why a brightening pre-dawn sky needs no ceiling
  — it is simply turned down until it fits.
- `useWeather` is created **once** in `App.vue` and handed to both
  `ConditionsSection` and the sky through `provide`/`inject` (`weatherKey`);
  calling the composable twice would poll Open-Meteo twice for one number.
- The **footer** shows the deployed commit from `VITE_GIT_COMMIT`, injected by
  the deploy workflow, as plain text — deliberately not linked to the repo;
  locally it reads `version development`.
- Pure, exported functions in the composables/lambda carry the logic and the
  tests; the Vue wrapper and the Lambda handler are thin shells around them.

### The family card (`xmas26/`)

`alexsue.com/xmas26/` is the Sue family's 2026 Christmas card, reached from the
QR code on the printed card. It is a second Vite entry (`xmas26/index.html`,
registered in `vite.config.js`), plain JS rather than Vue, and shares the GA4
initializer with the dashboard. The design and the API live in the **merryroll** repo
(`plans/xmas26-design.html`, `api/`); this is the port.

- `src/xmas26/main.js` is the three.js scene: the printed card under a tree of
  the year's photos, ported from the draft unchanged. `samples.js` paints the
  sample year and card it shows until real ones exist.
- **Photo count:** the tree looks best at up to 60 photos and gets crowded past 80
  (`TREE_PHOTOS` in `data.js`; polaroids stop shrinking at `max`). It's a soft limit:
  the page shows every pick, and the MerryRoll app warns past these numbers. Change
  both together.
- `src/xmas26/data.js` (pure, tested) reads public `GET /card` from the
  MerryRoll API: `photos` is the family collection (being in it is being on
  the page; there is no publish step), and `card.cardFront`/`cardBack` are the
  printed card's images, set from the app. A personal link (`?to=<code>`,
  made in the app's "Share the card" screen) also returns `recipient`: the
  page greets that person by name and opens with the family's note instead of
  asking who they are. The code is taken out of the address sent to GA4.
  Whatever is missing falls back to
  the samples, and the masthead's "Preview" label says which parts.
  `VITE_MERRYROLL_API` overrides the API base; the default is committed
  because the page has to call it anyway (the admin routes need the family key).
- **Privacy:** fonts are self-hosted in `src/xmas26/fonts/` (SIL OFL), three.js
  is bundled from npm rather than a CDN, and the page is `noindex`.
  `public/robots.txt` asks AI crawlers to stay out of `/xmas26` (MerryRoll
  PRIVACY.md P10); keep its list in step with that rule. In addition
  to the MerryRoll API and its photo CDN, the card uses the shared
  `src/analytics.js` GA4 initializer, enabled at the owner's request. Analytics
  runs only in production on the site's domains with a valid measurement ID.
- **Emoji reactions:** under each photo in the lightbox, visitors tap one of a fixed set
  (`REACTION_EMOJI` in `data.js`, the same keys as `REACTIONS` in the merryroll API: warm,
  family-safe, mostly faces, nothing past Emoji 14) and see anonymous counts. Built for phones: the row is
  always one line, the six `QUICK_REACTIONS` and a "more" chip that opens a bottom sheet with the rest.
  Counts are corner badges so a chip never widens, and once picker emoji are used on a photo the chip
  shows the top two and their total (`moreSummary`) instead of growing the row. Above the row, "Tap to react ·
  no one will know it's you" shows until this browser's first reaction (`createReactionMemory().any()`);
  "Added by" is commented out (index.html and main.js) to leave it the room; `POST /reactions` adds or takes one back, and localStorage remembers this
  browser's taps. The row shows only when `GET /card` lists `reactions` (`null` = the family turned
  them off with `reactions: false` in the card JSON; an older API sends nothing) and never on the samples.
- **Tree zoom and move:** pinch/scroll zooms toward the fingers/cursor, and a two-finger drag
  (right- or shift-drag with a mouse) slides up and down the tree. `keepOnTree` keeps the view on
  the trunk (so turning still spins the tree in place), between the card and the star, and sets
  the closest distance from the tree's width at that height so a zoom stops at the photos.
- **Card view zoom:** in card view (only), pinch or scroll zooms toward the fingers/cursor up to
  `CARD_ZOOM`× the fitted size; zoomed in, a drag pans and stops at the card's edges (`keepOnCard`),
  and a tap fits it back. The tree's own limits (`TREE_MIN_DIST`, no pan) come back on leaving.
  Card view holds still: no auto-rotate, no bobbing.
- **Lightbox sizing:** `fitLightbox` in `main.js` measures the caption, place, reactions and ‹ › row and
  gives the photo what's left. Don't go back to a `vh` max-height: on iOS, `vh` is the height with
  Safari's toolbars hidden, which pushed the ✕ and the arrows off a phone screen. A phone on its side
  puts them beside the photo instead. The meta is pinned to the bottom (or the right, on its side) and the
  photo floats in the room left, so the reactions and arrows don't move between tall and wide photos.
- **Lightbox gestures:** one pointer handler on the whole lightbox (`touch-action: none`, so a pinch never
  zooms the page). A sideways drag carries the photo with the finger and commits past a quarter of its
  width or on a flick; a drag down closes it; pinch, double tap or the wheel zooms the photo inside its
  polaroid (`.lb-photo` clips it), and a zoomed photo pans instead of swiping. Swipes work on a video
  except its bottom `VIDEO_CONTROLS` px, where the scrubber is. The arrows, arrow keys and swipes all go
  through `stepLightbox`, and the next photo slides in from the side it's on. Going past either end
  wraps, and `#lb-note` says so.
- **The masthead hint** (`updateHint`) describes what's on screen: the card's gestures in card view, what
  a month button lit up, and on the tree the how-to, until a photo has been opened (session only). It
  fades rather than going, so the masthead keeps its height for `framing()`. When there are new photos,
  a second line explains the gold dot. A touch tap that just misses a polaroid opens the nearest one on
  the near side of the tree (`nearestPhoto`).
- **Hiding the words and buttons:** the expand button top right (or `H`) fades the
  masthead, dock and version stamp, and turns into a collapse button that brings them back, so nothing covers the tree; `framing()` then reserves no room for them, and a view at
  home glides to fill the screen. It isn't remembered, so the next visit opens with the greeting.
- "Get the app" posts to the API's `POST /waitlist`. The API's CORS list allows
  `https://alexsue.com` and `http://localhost:5173` only, so test locally on
  5173 (`npm run dev`, or `npx vite preview --port 5173`).

### Deployment

Push to `main` → `.github/workflows/deploy-pages.yml` builds with Vite and
publishes `dist/` to Pages. Nothing generated is committed; there is no
`gh-pages` branch. `VITE_STATUS_URL` is a **repository variable** (not a secret);
without it the live rows are simply absent. `public/CNAME` holds the custom
domain.

### Live status pipeline (`infra/`)

Phone → iOS Shortcut → `POST` to a Lambda Function URL → Lambda folds the sample
into a running baseline → writes one JSON object to S3 → the site polls it. **No
database and no history**: the S3 object is both the API and the store, carrying
its own accumulator forward under `_baseline`.

- `infra/lambda/status.mjs` — pure computation (EWMA baseline with a 14-day
  half-life folded once per completed day, plausibility bounds, timezone-aware
  day boundaries, lenient parsing of the strings Shortcuts emits). No AWS import.
- `infra/lambda/index.mjs` — the I/O shell: bearer-token auth, S3 read/write,
  base64 body handling, structured CloudWatch logging. The Lambda zip is just
  these two files; the AWS SDK comes from the runtime.
- `infra/deploy.sh` / `infra/teardown.sh` — idempotent create-or-update; the push
  token is generated once and preserved.
- `shortcuts/` — the iOS Shortcut is built, not hand-assembled.
  `dashboard.template.json` holds the verified actions with `{TOKEN}` and
  `{ENDPOINT}` placeholders; `build.py` substitutes them from `.env` and signs.
  This repo is public, so neither the token nor the Function URL is committed,
  and the generated `.shortcut` files are git-ignored. `python3 -m unittest
  discover -s shortcuts` covers it.
- **`infra/README.md` is the detailed reference** — the push contract, the
  baseline math and how to hand-fix a skewed one, Function URL permission quirks,
  and the full iOS Shortcuts build. Read it before touching the pipeline.

Steps arrive as one raw sample list per source (`stepsBySource`) and the
**largest total wins, never the sum** — the phone and the watch both record the
same walk, and adding them reported a ~12,000-step day as 25,905. It is not
Apple Health's merged total, but a day with the watch on the charger reads the
phone's count instead of zero. The flat `steps` field still works.

The wire field `restingHeartRate` is kept for compatibility with the shortcut
already deployed; `heartRate` is the accepted truer name. Heart rate is reported
as a bare number with no classification — a live reading swings too much against
a daily baseline for a label to mean anything.
