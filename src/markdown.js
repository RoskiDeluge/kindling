import { writeFile } from "node:fs/promises";
import path from "node:path";

export function slugify(title) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

export function renderBook(book) {
  const lines = [`# ${book.title}`, ""];
  if (book.author) lines.push(`**Author:** ${book.author}  `);
  lines.push(`**ASIN:** ${book.asin}  `, `**Highlights:** ${book.annotations.length}`, "", "---", "");

  for (const a of book.annotations) {
    if (a.highlight) {
      lines.push(...a.highlight.split("\n").map((l) => `> ${l}`));
    }
    const meta = [a.location && `Location ${a.location}`, a.color].filter(Boolean).join(" · ");
    if (meta) lines.push(">", `> — *${meta}*`);
    if (a.note) lines.push("", `**Note:** ${a.note}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Returns [{ book, file }] with file relative to outDir (null for books with
// no annotations). A book that already has a file in the manifest keeps that
// filename; new books avoid filenames owned by other books.
export async function writeBookFiles(books, outDir, manifest = {}) {
  const used = new Set(Object.values(manifest).map((e) => e.file).filter(Boolean));
  const written = [];
  for (const book of books) {
    if (book.annotations.length === 0) {
      written.push({ book, file: null });
      continue;
    }
    let file = manifest[book.asin]?.file;
    if (!file) {
      file = `${slugify(book.title)}.md`;
      // Distinguish different books that slugify identically.
      if (used.has(file)) file = `${slugify(book.title)}-${book.asin.toLowerCase()}.md`;
    }
    used.add(file);

    await writeFile(path.join(outDir, file), renderBook(book), "utf8");
    written.push({ book, file });
  }
  return written;
}
