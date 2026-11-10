# alexsue.com

A small static personal status dashboard. Vue 3 + Vite, deployed to GitHub Pages.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build     # outputs dist/ (git-ignored)
npm run preview   # serve the production build locally
```

## Editing content

All page content lives in [`src/data/site.js`](src/data/site.js) — the NOW
section, projects, statuses, and links. Components read from it, so normal
content updates never require touching markup.

## Local conditions

The conditions panel fetches Honolulu weather directly from [Open-Meteo](https://open-meteo.com/)
every 15 minutes while the page is visible. It uses fixed city coordinates in
`site.weather`, with no device location access or API key. Readings older than
one hour show an unavailable message. Sunrise/sunset times use Honolulu time.
The °C/°F buttons convert both temperature readings locally and remember each
visitor's choice in their browser; Fahrenheit is the default.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml),
which builds with Vite and publishes `dist/` to GitHub Pages. Nothing generated
is committed; there is no `gh-pages` branch.

The workflow passes the deployed commit into the build:

| Variable                  | Source                       |
| ------------------------- | ---------------------------- |
| `VITE_GIT_COMMIT`         | `${{ github.sha }}`          |
| `VITE_GITHUB_REPOSITORY`  | `${{ github.repository }}`   |

The footer shows the first 7 characters and links to the exact commit. Locally,
where these are unset, it shows `version development`.

`public/CNAME` keeps the `alexsue.com` custom domain attached to each deploy.

## The family card

`alexsue.com/xmas26/` is the family Christmas card: a 3D tree of the year's
photos with the printed card underneath. Its photos and card images come from
the MerryRoll API, so it updates without a deploy; until they exist it shows
painted samples marked "Preview". It shares the dashboard's GA4 setup.
See CLAUDE.md for details.

## Analytics

The site uses the Google tag directly for GA4; no Firebase project, SDK, or
Tag Manager container is needed.

1. In [Google Analytics](https://analytics.google.com/), create a property for
   `alexsue.com` and a **Web** data stream for `https://alexsue.com`.
2. Leave enhanced measurement enabled for automatic scroll and outbound-link
   events. The tag already sends the initial page view; no custom events are set up.
3. Copy the stream's **Measurement ID** (`G-…`) into the GitHub repository variable
   `VITE_GA_MEASUREMENT_ID` under **Settings → Secrets and variables → Actions →
   Variables**. This ID is public and does not need to be a secret.
4. Deploy again (push to `main` or run the Pages workflow), visit the live site,
   and check GA4's Realtime report to confirm the visit arrives.

Tracking runs only in production builds on `alexsue.com` or `www.alexsue.com`,
on both the dashboard and the `/xmas26/` card.
Development, local previews, and builds without a valid ID send nothing.
Changing or removing the repository variable takes effect on the next deployment.
Analytics starts collecting after activation; it cannot recover earlier visits.
