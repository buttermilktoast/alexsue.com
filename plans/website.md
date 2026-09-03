# alexsue.com — Personal Status Dashboard

## Project goal

Build a small, minimalist personal website for **alexsue.com**.

This is **not a résumé, portfolio résumé, or professional experience site**. Avoid sections such as Experience, Employment, Skills, Education, Certifications, or career-history timelines.

The site should feel like a lightweight **personal status dashboard**: a clean home page showing what Alex is currently working on, selected projects, a few personal/system-style status items, and useful links.

The site will be built as a **Vue 3 + Vite** static site, stored in GitHub, built automatically with GitHub Actions, and hosted for free with **GitHub Pages**.

The source code and deployment workflow should live in the **same repository**. Generated `dist/` files must not be committed.

---

## High-level requirements

- Vue 3
- Vite
- Plain CSS or scoped Vue CSS; avoid a heavy UI framework unless clearly justified
- Responsive on desktop and mobile
- Accessible semantic HTML
- Fast, static, and dependency-light
- Hosted on GitHub Pages
- Custom domain: `alexsue.com`
- HTTPS enabled
- Automatic deploy on push to `main`
- `dist/` generated only during the build
- Git commit hash displayed in the footer as the deployed version
- No backend required for v1
- No analytics
- No login
- No tracking
- No résumé-style content

---

## Visual direction

Design the site as a hybrid of:

- a minimalist status page
- a developer dashboard
- a simple old-school personal homepage
- modern GitHub/system UI restraint

Do **not** make it look like a SaaS admin panel full of graphs.

### General aesthetic

- Mostly monochrome
- Off-white/light gray background
- White or slightly contrasting panels
- Dark text
- Muted secondary text
- Thin subtle borders
- Small status dots
- Comfortable whitespace
- Minimal or no shadows
- Small amount of one accent color
- System font stack or a clean sans-serif
- Monospace font for version/status metadata

Suggested starting palette:

```css
--background: #f7f7f5;
--surface: #ffffff;
--text: #18181b;
--muted: #71717a;
--border: #e4e4e7;
--status-ok: #22c55e;
```

These are starting values, not strict requirements.

### Avoid

- giant hero portrait
- résumé timeline
- skill bars
- "10+ years experience" style copy
- animated gradients
- excessive cards
- glassmorphism
- large marketing-style CTA buttons
- stock imagery
- unnecessary animation
- dashboard charts with fake data

---

## Page structure

For v1, make the site a **single page**.

Do not use Vue Router yet. GitHub Pages does not provide arbitrary SPA fallback rewrites, and this site does not need routing at first.

Use section anchors if navigation is useful:

```text
/
#now
#projects
#status
#links
```

A later version can add real routes such as `/projects` if needed.

### Header

Example concept:

```text
alexsue.com                                  ● online

Alex Sue
personal status dashboard
```

Keep this compact.

Possible secondary text:

```text
personal status dashboard
```

Do not add a professional job title unless explicitly configured later.

---

## Section: NOW

A compact section for current activity.

Example:

```text
NOW

Current project
alexsue.com

Recently
Building small web tools
Experimenting with things that seem useful
```

Content should come from a small local data/config object so it is easy to update.

Suggested structure:

```js
const now = {
  currentProject: {
    name: "alexsue.com",
    url: "/"
  },
  items: [
    "Building small web tools"
  ]
}
```

Do not hard-code repeated content throughout components.

---

## Section: PROJECTS

Show a small curated list of projects.

This is **not** meant to be a comprehensive professional portfolio.

Each project can include:

- title
- one-line description
- optional URL
- optional status
- optional small technology/category label

Example visual:

```text
PROJECTS

Hawaiʻi Permit Prep                         ↗
Practice tests for the Hawaiʻi driver's exam

Alika                                      ↗
AI assistant / RAG experiment

Small Tools                                ↗
Things built because they were useful
```

Use simple rows or restrained cards.

Project data should live in a single configuration/data file, for example:

```text
src/data/site.js
```

or:

```text
src/data/projects.js
```

---

## Section: STATUS

This is where the page should have personality.

Use a simple label/value layout rather than charts.

Example:

```text
STATUS

Site             ● operational
Side projects    ● too many
Current device   MacBook
Listening        —
Reading          —
Playing          —
```

These values can initially be static.

Do not expose personal information by default. Location, employer information, detailed schedules, or other identifying/status information should only be added if explicitly configured.

A status dot should not rely on color alone; include visible text such as `operational`.

---

## Section: LINKS

Simple text links.

Initial placeholders could include:

- GitHub
- Email
- optional other personal links

Email should be:

```text
alex@alexsue.com
```

Use:

```html
<a href="mailto:alex@alexsue.com">alex@alexsue.com</a>
```

External links should have clear accessible labels.

---

## Footer

The footer should be intentionally small and system-like.

Example:

```text
alexsue.com · version a1b2c3d
```

or:

```text
deployed a1b2c3d
```

The version must be derived from the **actual Git commit used for the deployed build**.

Do not manually maintain a version number.

### Commit hash behavior

Use the full GitHub commit SHA at build time, then display the first 7 characters in the UI.

GitHub Actions exposes the deployed commit as `${{ github.sha }}`.

During the build, provide it to Vite as:

```yaml
env:
  VITE_GIT_COMMIT: ${{ github.sha }}
  VITE_GITHUB_REPOSITORY: ${{ github.repository }}
```

In Vue:

```js
const fullCommit = import.meta.env.VITE_GIT_COMMIT || 'development'
const shortCommit =
  fullCommit === 'development'
    ? 'development'
    : fullCommit.slice(0, 7)
```

Display `shortCommit` in the footer.

If `VITE_GITHUB_REPOSITORY` exists and the site repository is public, make the hash a link to:

```text
https://github.com/{owner}/{repo}/commit/{fullCommit}
```

Example:

```js
const repository = import.meta.env.VITE_GITHUB_REPOSITORY

const commitUrl =
  repository && fullCommit !== 'development'
    ? `https://github.com/${repository}/commit/${fullCommit}`
    : null
```

For local development, display:

```text
version development
```

Do not fail the app if the commit environment variable is absent.

---

## Suggested project structure

```text
alexsue.com/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── DashboardHeader.vue
│   │   ├── NowSection.vue
│   │   ├── ProjectsSection.vue
│   │   ├── StatusSection.vue
│   │   ├── LinksSection.vue
│   │   └── SiteFooter.vue
│   ├── data/
│   │   └── site.js
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── .gitignore
├── index.html
├── package-lock.json
├── package.json
├── vite.config.js
└── README.md
```

The exact component split can be simplified if some components would only contain a few lines. Avoid abstraction for its own sake.

---

## Vite configuration

Because the production site will be served from the custom apex domain:

```text
https://alexsue.com/
```

use root-relative deployment:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/'
})
```

---

## `.gitignore`

Ensure generated output is not committed:

```gitignore
node_modules/
dist/
.DS_Store
.env
.env.*
!.env.example
```

---

## GitHub Pages deployment

Create:

```text
.github/workflows/deploy-pages.yml
```

The workflow should:

1. Run on pushes to `main`
2. Allow manual `workflow_dispatch`
3. Check out the repository
4. Set up Node
5. Install dependencies with `npm ci`
6. Build with Vite
7. Pass the current commit SHA into the build
8. Upload `dist/` as the GitHub Pages artifact
9. Deploy that artifact to GitHub Pages

Use the current GitHub Pages Actions workflow pattern.

Example:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Build
        env:
          VITE_GIT_COMMIT: ${{ github.sha }}
          VITE_GITHUB_REPOSITORY: ${{ github.repository }}
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

The generated `dist/` directory exists only on the temporary runner/build environment and as the Pages deployment artifact. It should not be committed to `main` and no `gh-pages` branch is required.

---

## GitHub repository settings

After the workflow exists:

1. Open repository **Settings**
2. Open **Pages**
3. Set **Build and deployment → Source** to **GitHub Actions**
4. Set the custom domain to:

```text
alexsue.com
```

5. Once DNS and certificate provisioning are complete, enable **Enforce HTTPS**

If GitHub offers domain verification, configure it as an additional security measure.

---

## DNS for `alexsue.com`

The domain already uses **iCloud Custom Email Domain**.

### Critical requirement

**Do not delete, replace, or modify the existing iCloud Mail MX/TXT/DKIM records when configuring GitHub Pages.**

Website DNS records and email DNS records can coexist.

Only modify the web-hosting records needed for the apex domain and `www`.

At the time this plan was written, GitHub documents these A records for an apex Pages domain:

```text
Type    Host    Value
A       @       185.199.108.153
A       @       185.199.109.153
A       @       185.199.110.153
A       @       185.199.111.153
```

GitHub also documents these optional IPv6 records:

```text
Type    Host    Value
AAAA    @       2606:50c0:8000::153
AAAA    @       2606:50c0:8001::153
AAAA    @       2606:50c0:8002::153
AAAA    @       2606:50c0:8003::153
```

For `www`, create a CNAME pointing to the GitHub Pages hostname for the GitHub account:

```text
www  CNAME  {github-username}.github.io
```

The coding/deployment agent should verify GitHub's current official custom-domain documentation before making DNS changes, since infrastructure values can change.

Do not create wildcard DNS records such as:

```text
*.alexsue.com
```

for GitHub Pages.

Desired behavior:

```text
https://alexsue.com      → primary site
https://www.alexsue.com  → redirects to alexsue.com
```

Configure `alexsue.com` as the custom domain in GitHub Pages.

---

## Email DNS protection checklist

Before changing DNS, record the existing entries used by iCloud Mail.

After adding GitHub Pages DNS records, verify that the existing mail records are still present.

At minimum, do not disturb records related to:

- MX
- SPF/TXT
- Apple domain verification
- DKIM/CNAME records used by iCloud Mail

Test afterward:

1. Send a message **to** `alex@alexsue.com`
2. Send a message **from** `alex@alexsue.com`
3. Confirm catch-all still receives mail
4. Confirm `alexsue.com` loads over HTTPS

---

## Responsive behavior

### Desktop

Use a centered content column approximately 800–1000px wide.

The design can use two-column rows where useful, but avoid a dense dashboard grid.

### Mobile

Collapse cleanly to one column.

Requirements:

- no horizontal scrolling
- links/buttons have appropriate touch targets
- status label/value pairs remain readable
- footer commit hash remains visible
- typography remains comfortable without zooming

---

## Accessibility

Meet basic WCAG AA expectations.

Requirements:

- semantic landmarks: `header`, `main`, `section`, `footer`
- correct heading hierarchy
- visible keyboard focus
- sufficient text contrast
- links distinguishable without color alone
- status dots accompanied by text
- respect `prefers-reduced-motion`
- no auto-playing content
- no unnecessary animation

---

## Metadata

Set sensible page metadata.

Suggested title:

```text
Alex Sue — Personal Status Dashboard
```

Suggested description:

```text
Alex Sue's personal status dashboard, projects, and links.
```

Include:

- viewport metadata
- favicon placeholder
- Open Graph title
- Open Graph description
- canonical URL: `https://alexsue.com/`

Do not add tracking scripts.

---

## Data/content architecture

Keep editable site content separate from layout as much as practical.

For example:

```js
export const site = {
  name: 'Alex Sue',
  tagline: 'personal status dashboard',
  email: 'alex@alexsue.com',

  now: {
    currentProject: 'alexsue.com',
    items: []
  },

  projects: [],

  statuses: [
    {
      label: 'Site',
      value: 'operational',
      state: 'ok'
    }
  ],

  links: []
}
```

The goal is to make normal content updates possible without editing component markup.

---

## Optional touches

These are optional and should only be added if they remain subtle.

### Local clock

A small client-side clock may be shown if desired. Do not introduce an API just for this.

### Theme support

A light/dark theme toggle is acceptable, but the first version does not require it.

If implemented, respect the browser's `prefers-color-scheme` setting and persist an explicit user selection locally.

### Build metadata tooltip

Hover/focus on the footer commit hash could show the full commit SHA.

### Tiny status personality

A couple of playful statuses are fine, for example:

```text
Side projects    too many
Inbox            questionable
Coffee           nominal
```

Do not overdo it.

---

## Explicit non-goals for v1

Do not build:

- a résumé
- an employment-history page
- an admin interface
- authentication
- a database
- a CMS
- Firebase
- AWS infrastructure
- serverless functions
- analytics
- comments
- a blog engine
- a guestbook
- a complicated router
- fake uptime monitoring
- GitHub API integrations just to populate the page
- live weather
- live Spotify data
- excessive animation

Keep v1 static and maintainable.

---

## Acceptance criteria

The implementation is complete when all of the following are true:

- [ ] Vue 3 + Vite app runs locally with `npm run dev`
- [ ] `npm run build` successfully creates `dist/`
- [ ] `dist/` is ignored by Git
- [ ] No generated build output is committed
- [ ] Pushing to `main` triggers GitHub Actions
- [ ] GitHub Actions builds the site
- [ ] The build receives the current Git commit SHA
- [ ] GitHub Pages deploys only the contents of `dist/`
- [ ] `alexsue.com` loads the deployed site
- [ ] `www.alexsue.com` redirects appropriately
- [ ] HTTPS works and is enforced
- [ ] Existing iCloud Mail DNS records remain intact
- [ ] `alex@alexsue.com` still sends and receives mail
- [ ] Catch-all email still works
- [ ] Footer displays the deployed short Git commit hash
- [ ] Footer commit hash links to the exact GitHub commit when possible
- [ ] Local development gracefully displays `development` instead of a commit hash
- [ ] Site is usable on desktop and mobile
- [ ] Site has no résumé/experience/skills sections
- [ ] Site contains no analytics or tracking
- [ ] Basic accessibility checks pass

---

## Implementation priority

Build in this order:

1. Initialize Vue/Vite project
2. Create page layout and visual system
3. Add content/data configuration
4. Build NOW / PROJECTS / STATUS / LINKS sections
5. Add commit-hash footer
6. Verify local production build
7. Add GitHub Pages workflow
8. Configure GitHub Pages repository settings
9. Configure custom domain DNS without disturbing iCloud Mail
10. Enable HTTPS
11. Run final mobile/accessibility checks
12. Verify the displayed footer hash matches the commit deployed by GitHub Actions

---

## Guiding principle

When making implementation decisions, prefer the simplest solution that keeps the site:

**personal, fast, static, understated, and easy to maintain.**

The page should feel like `alexsue.com` is a small personal system dashboard—not a product landing page and not a résumé.
