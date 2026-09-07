# alexsue.com

A small static personal status dashboard. Vue 3 + Vite, deployed to GitHub Pages.

See [Features and upcoming ideas](plans/features.md) for implemented features,
dashboard candidates, and verified iOS Shortcuts capabilities. The
[original website brief](plans/website.md) records the v1 design.

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
