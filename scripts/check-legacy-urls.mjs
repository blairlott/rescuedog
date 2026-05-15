#!/usr/bin/env node
// Scans the repo for legacy WordPress / old-site URLs and verifies that every
// referenced migrated asset (under src/assets/migrated/ and public/docs/) exists.
// Exits non-zero on violations so CI fails the build.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";

const ROOT = resolve(process.cwd());
const SCAN_DIRS = ["src", "supabase", "public", "index.html"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "migrated"]);
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".html", ".css", ".json", ".md", ".txt", ".svg",
]);

// Patterns that indicate a link to the legacy WordPress site.
// Bare "rescuedogwines.com" is allowed (brand identity, canonicals, email defaults).
const FORBIDDEN = [
  /rescuedogwines\.com\/wp-content/i,
  /rescuedogwines\.com\/wp-uploads/i,
  /rescuedogwines\.com\/wp-includes/i,
  /rescuedogwines\.com\/wp-admin/i,
  /rescuedogwines\.com\/event\//i,
  /\/\/wordpress\.com/i,
];

// Allow-list files that legitimately mention these patterns (this script itself, docs).
const ALLOW_FILES = new Set([
  "scripts/check-legacy-urls.mjs",
  ".lovable/plan.md",
]);

const violations = [];
const missingAssets = [];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stat = statSync(dir);
  if (stat.isFile()) return [dir];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

// 1. Forbidden URL scan
for (const file of allFiles) {
  const rel = relative(ROOT, file);
  if (ALLOW_FILES.has(rel)) continue;
  if (!TEXT_EXT.has(extname(file))) continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const pattern of FORBIDDEN) {
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 160)}`);
      }
    });
  }
}

// 2. Verify migrated assets referenced from source code exist on disk.
const ASSET_PATTERNS = [
  /["'`](\/docs\/[^"'`?#]+)["'`]/g,                       // public docs
  /from\s+["']@\/assets\/migrated\/([^"']+)["']/g,        // ES imports of migrated assets
  /import\s+\w+\s+from\s+["']([^"']*\/assets\/migrated\/[^"']+)["']/g,
];

const referencedAssets = new Set();
for (const file of allFiles) {
  if (!TEXT_EXT.has(extname(file))) continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const pat of ASSET_PATTERNS) {
    let m;
    pat.lastIndex = 0;
    while ((m = pat.exec(content)) !== null) {
      referencedAssets.add(m[1]);
    }
  }
}

for (const ref of referencedAssets) {
  let resolved;
  if (ref.startsWith("/docs/")) {
    resolved = join(ROOT, "public", ref);
  } else if (ref.includes("assets/migrated/")) {
    const tail = ref.split("assets/migrated/")[1];
    resolved = join(ROOT, "src/assets/migrated", tail);
  } else {
    resolved = join(ROOT, "src/assets/migrated", ref);
  }
  if (!existsSync(resolved)) {
    missingAssets.push(`${ref}  (expected at ${relative(ROOT, resolved)})`);
  }
}

let failed = false;
if (violations.length) {
  failed = true;
  console.error(`\n✗ Found ${violations.length} legacy old-site URL reference(s):`);
  for (const v of violations) console.error("  " + v);
}
if (missingAssets.length) {
  failed = true;
  console.error(`\n✗ Found ${missingAssets.length} missing migrated asset(s):`);
  for (const m of missingAssets) console.error("  " + m);
}

if (failed) {
  console.error("\nFix the above before merging. See scripts/check-legacy-urls.mjs.");
  process.exit(1);
}

console.log(
  `✓ No legacy old-site URLs found. ${referencedAssets.size} migrated asset reference(s) verified.`
);