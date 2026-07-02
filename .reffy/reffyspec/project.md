# Project Context

## Purpose
kindling is a Node.js CLI that exports all of a user's Kindle highlights from
read.amazon.com/notebook into Markdown files — one file per book — for use in
note-taking systems like Obsidian. It supports incremental refreshes: books
whose highlight/note counts haven't changed since the last export are skipped.

Published at https://github.com/RoskiDeluge/kindling (MIT).

## Tech Stack
- Node.js >= 18, plain JavaScript ES modules (no TypeScript, no build step)
- Playwright (chromium) for browser automation
- No other runtime dependencies; CLI arg parsing is hand-rolled in `src/index.js`

## Project Conventions

### Code Style
- Small, single-purpose ES modules under `src/`: `index.js` (CLI + orchestration),
  `scrape.js` (Playwright automation), `markdown.js` (rendering + file writing),
  `manifest.js` (skip-state persistence)
- Comments only where the code can't speak for itself (e.g. DOM selector rationale)
- `node --check` and small ad-hoc scripts for smoke testing

### Architecture Patterns
- Scraping, not an API: Amazon has no official highlights API. The scraper drives
  a real headed Chromium via `chromium.launchPersistentContext` so the session
  (stored in `~/.kindling/browser-profile`, outside the repo) survives between runs
  and login/2FA is handled by the user in the browser window.
- Skip-unchanged: the notebook pane header (`#kp-notebook-annotation-count`,
  text like "79 Highlights | 5 Notes") is read as soon as a book is clicked and
  compared against `.kindling-manifest.json` in the output directory. Matching
  counts skip the expensive scroll/extract/write for that book.
- Filenames are slugified titles; a book keeps its manifest filename forever, and
  slug collisions between different books get an ASIN suffix.

### Testing Strategy
- No test framework yet. Verification is done by running the CLI end-to-end
  against the real Amazon notebook (requires the maintainer's session) and by
  small throwaway node scripts for pure functions (slugify, renderBook,
  writeBookFiles, manifest load/save).

### Git Workflow
- Single `main` branch, direct commits, descriptive commit messages.
- `.gitignore` blocks root-level `*.md` (except README.md and AGENTS.md) and
  `.kindling-manifest.json` because exports default to the repo root and contain
  personal reading data.

## Domain Context
- Amazon notebook DOM is undocumented and can change; key selectors live in
  `src/scrape.js` (`.kp-notebook-library-each-book`, `#kp-notebook-annotations`,
  `#kp-notebook-annotations-asin`, `#highlight`, `#note`, `#kp-annotation-location`).
- The annotations pane lazy-loads on scroll; `loadAllAnnotations` scrolls until
  the row count stabilizes.
- The pane header count can differ from the number of extracted rows (Amazon
  counts differently); skip detection therefore always compares header-to-header.
- Some books show "highlights have been hidden or truncated due to export
  limits" — a publisher-imposed Amazon restriction the tool cannot bypass.

## Important Constraints
- No official Amazon API; alternatives (cookie-based private API clients) fight
  TLS fingerprinting and require manual cookie management. A real browser is the
  deliberate robustness trade-off.
- Login must be interactive (headed browser); the tool must never store or ask
  for Amazon credentials itself.
- Personal data (highlight exports, manifest, browser profile) must never be
  committed or published.
- Non-US Amazon accounts use `--base-url` (e.g. https://read.amazon.co.uk).

## External Dependencies
- read.amazon.com/notebook (scraped; session held in a local Chromium profile)
- Playwright-managed Chromium (installed via `npx playwright install chromium`)
