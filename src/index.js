#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { scrapeNotebook } from "./scrape.js";
import { writeBookFiles } from "./markdown.js";
import { loadManifest, saveManifest } from "./manifest.js";

const HELP = `kindling — export your Kindle highlights to Markdown

Usage:
  kindling [output-dir] [options]

Arguments:
  output-dir          Directory to write one .md file per book (default: current directory)

Options:
  --base-url <url>    Kindle notebook base URL (default: https://read.amazon.com)
                      e.g. https://read.amazon.co.uk for UK accounts
  --fresh-login       Ignore the saved browser session and log in again
  -h, --help          Show this help

Notes:
  On first run a browser window opens so you can sign in to Amazon.
  Your session is saved under ~/.kindling so later runs skip the login.
`;

function parseArgs(argv) {
  const opts = { outDir: process.cwd(), baseUrl: "https://read.amazon.com", freshLogin: false };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === "--base-url") {
      const val = args.shift();
      if (!val) fail("--base-url requires a value");
      opts.baseUrl = val.replace(/\/$/, "");
    } else if (arg === "--fresh-login") {
      opts.freshLogin = true;
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    } else {
      opts.outDir = path.resolve(arg);
    }
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`kindling: ${msg}\n\nRun kindling --help for usage.\n`);
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir(opts.outDir, { recursive: true });

  console.log(`Exporting Kindle highlights to ${opts.outDir}`);
  const manifest = await loadManifest(opts.outDir);
  const { books, skipped } = await scrapeNotebook(opts, manifest);

  if (books.length === 0 && skipped === 0) {
    console.log("No books with highlights found.");
    return;
  }

  const written = await writeBookFiles(books, opts.outDir, manifest);

  for (const { book, file } of written) {
    manifest[book.asin] = {
      title: book.title,
      file,
      highlights: book.counts?.highlights ?? book.annotations.length,
      notes: book.counts?.notes ?? 0,
    };
  }
  await saveManifest(opts.outDir, manifest);

  const totalHighlights = books.reduce((n, b) => n + b.annotations.length, 0);
  const updated = written.filter((w) => w.file).length;
  console.log(`\nDone: ${updated} books updated (${totalHighlights} highlights), ${skipped} unchanged.`);
}

main().catch((err) => {
  process.stderr.write(`kindling: ${err.message}\n`);
  process.exit(1);
});
