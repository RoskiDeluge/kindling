import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const MANIFEST_NAME = ".kindling-manifest.json";

// Manifest maps asin -> { title, file, highlights, notes } and lets us skip
// books whose notebook counts haven't changed since the last export.
export async function loadManifest(outDir) {
  const filePath = path.join(outDir, MANIFEST_NAME);
  let entries;
  try {
    entries = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }

  // Drop entries whose exported file has been deleted so those books re-export.
  const valid = {};
  for (const [asin, entry] of Object.entries(entries)) {
    if (entry.file) {
      try {
        await access(path.join(outDir, entry.file));
      } catch {
        continue;
      }
    }
    valid[asin] = entry;
  }
  return valid;
}

export async function saveManifest(outDir, entries) {
  const filePath = path.join(outDir, MANIFEST_NAME);
  await writeFile(filePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
}
