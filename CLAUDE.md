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
node --test infra/lambda/status.test.mjs             # Lambda status computation
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
- The **footer** shows the deployed commit from `VITE_GIT_COMMIT` /
  `VITE_GITHUB_REPOSITORY`, injected by the deploy workflow; locally it reads
  `version development`.
- Pure, exported functions in the composables/lambda carry the logic and the
  tests; the Vue wrapper and the Lambda handler are thin shells around them.

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
- **`infra/README.md` is the detailed reference** — the push contract, the
  baseline math and how to hand-fix a skewed one, Function URL permission quirks,
  and the full iOS Shortcuts build. Read it before touching the pipeline.

The wire field `restingHeartRate` is kept for compatibility with the shortcut
already deployed; `heartRate` is the accepted truer name. Heart rate is reported
as a bare number with no classification — a live reading swings too much against
a daily baseline for a label to mean anything.
