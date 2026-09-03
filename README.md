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

## One-time setup

See [`SETUP.md`](SETUP.md) for the GitHub Pages settings and the DNS records
for the apex domain and `www`, including the recorded baseline of the iCloud
Mail records that must be left intact.
