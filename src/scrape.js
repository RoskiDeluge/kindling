import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { chromium } from "playwright";

const PROFILE_DIR = path.join(os.homedir(), ".kindling", "browser-profile");
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Scrape read.amazon.com/notebook and return { books, skipped } where books is
 * [{ asin, title, author, counts, annotations: [{ highlight, note, location, color }] }].
 * Books whose notebook highlight/note counts match the manifest are skipped
 * without loading their annotations.
 */
export async function scrapeNotebook({ baseUrl, freshLogin }, manifest = {}) {
  if (freshLogin) {
    await rm(PROFILE_DIR, { recursive: true, force: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${baseUrl}/notebook`, { waitUntil: "domcontentloaded" });

    await ensureLoggedIn(page, baseUrl);

    const bookHandles = await page.$$("#kp-notebook-library .kp-notebook-library-each-book");
    if (bookHandles.length === 0) return { books: [], skipped: 0 };
    console.log(`Found ${bookHandles.length} books in your library.`);

    const books = [];
    let skipped = 0;
    for (const [i, bookEl] of bookHandles.entries()) {
      const meta = await bookEl.evaluate((el) => ({
        asin: el.id,
        title: el.querySelector("h2")?.textContent.trim() ?? "Untitled",
        author: (el.querySelector("p")?.textContent.trim() ?? "").replace(/^(By|de|von|par):\s*/i, ""),
      }));

      process.stdout.write(`[${i + 1}/${bookHandles.length}] ${meta.title} ... `);
      try {
        await bookEl.click();
        await page.waitForSelector("#kp-notebook-annotations", { timeout: 30_000 });
        // Annotations for the clicked book load async; wait for the pane's
        // ASIN marker to match so we don't scrape the previous book's pane.
        await page.waitForFunction(
          (asin) => document.querySelector("#kp-notebook-annotations-asin")?.value === asin,
          meta.asin,
          { timeout: 30_000 }
        );
        const counts = await readPaneCounts(page);
        const prev = manifest[meta.asin];
        if (prev && counts && prev.highlights === counts.highlights && prev.notes === counts.notes) {
          console.log(`unchanged (${counts.highlights} highlights), skipped`);
          skipped++;
          continue;
        }

        await loadAllAnnotations(page);
        const annotations = await extractAnnotations(page);
        console.log(`${annotations.length} highlights`);
        books.push({ ...meta, counts, annotations });
      } catch (err) {
        console.log(`skipped (${err.message.split("\n")[0]})`);
      }
    }
    return { books, skipped };
  } finally {
    await context.close();
  }
}

async function ensureLoggedIn(page, baseUrl) {
  const libraryVisible = () =>
    page.waitForSelector("#kp-notebook-library", { timeout: 10_000 }).then(() => true, () => false);

  if (await libraryVisible()) return;

  console.log("Not signed in. Please log in to Amazon in the browser window...");
  await page.goto(`${baseUrl}/notebook`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#kp-notebook-library", { timeout: LOGIN_TIMEOUT_MS });
  console.log("Signed in. Session saved for future runs.");
}

// The pane header reports "N highlights | M notes" as soon as a book is
// clicked, before any annotations are scraped. Returns null if the counts
// can't be read (e.g. Amazon changed the markup) so callers fall back to a
// full scrape rather than wrongly skipping.
async function readPaneCounts(page) {
  // Single span like "79 Highlights | 5 Notes"
  const text = await page
    .$eval("#kp-notebook-annotation-count", (el) => el.textContent)
    .catch(() => "");
  const highlights = text.match(/([\d,]+)\s*Highlight/i);
  const notes = text.match(/([\d,]+)\s*Note/i);
  if (!highlights || !notes) return null;
  return {
    highlights: parseInt(highlights[1].replace(/,/g, ""), 10),
    notes: parseInt(notes[1].replace(/,/g, ""), 10),
  };
}

// The annotations pane lazy-loads more items as you scroll.
async function loadAllAnnotations(page) {
  let prevCount = -1;
  for (let i = 0; i < 100; i++) {
    const count = await page.$$eval("#kp-notebook-annotations .a-row.a-spacing-base", (els) => els.length);
    if (count === prevCount) break;
    prevCount = count;
    await page.evaluate(() => {
      const pane = document.querySelector("#annotation-scroller") ?? document.scrollingElement;
      pane.scrollTop = pane.scrollHeight;
    });
    await page.waitForTimeout(750);
  }
}

async function extractAnnotations(page) {
  return page.$$eval("#kp-notebook-annotations .a-row.a-spacing-base", (rows) =>
    rows
      .map((row) => {
        const highlight = row.querySelector("#highlight")?.textContent.trim() ?? "";
        const note = row.querySelector("#note")?.textContent.trim() ?? "";
        const location = row.querySelector("#kp-annotation-location")?.value ?? "";
        // Header text like "Yellow highlight | Location: 123"
        const header = row.querySelector("#annotationHighlightHeader")?.textContent.trim() ?? "";
        const color = header.split("|")[0]?.replace(/highlight/i, "").trim().toLowerCase() || "";
        return { highlight, note, location, color };
      })
      .filter((a) => a.highlight || a.note)
  );
}
