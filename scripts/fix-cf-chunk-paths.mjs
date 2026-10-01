/**
 * Cloudflare Workers Assets 404s Next.js dynamic-route chunks when the browser
 * requests `%5Bid%5D` but the uploaded file lives under a literal `[id]` folder.
 *
 * After `opennextjs-cloudflare build`, rename those asset folders and rewrite
 * only `static/chunks/...` references (route dirs / manifests stay intact).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".open-next");
const ASSETS_STATIC = path.join(ROOT, "assets", "_next", "static");

function walkDirs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(full);
      walkDirs(full, out);
    }
  }
  return out;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Rename deepest `[param]` folders first so parents still resolve. */
function renameBracketDirs(staticRoot) {
  const dirs = walkDirs(staticRoot)
    .filter((d) => /\[.+\]$/.test(path.basename(d)))
    .sort((a, b) => b.length - a.length);

  let renamed = 0;
  for (const dir of dirs) {
    const base = path.basename(dir);
    const nextName = base.replace(/^\[(.+)\]$/, "$1");
    if (nextName === base) continue;
    const dest = path.join(path.dirname(dir), nextName);
    if (fs.existsSync(dest)) {
      throw new Error(`Cannot rename ${dir} → ${dest} (destination exists)`);
    }
    fs.renameSync(dir, dest);
    renamed += 1;
    console.log(`  renamed ${base}/ → ${nextName}/`);
  }
  return renamed;
}

function rewriteChunkRefs(text) {
  let next = text;
  // Encoded then literal, only inside static chunk URLs.
  next = next.replace(
    /(static\/chunks\/[^"'`\s]*)%5B([^%/]+)%5D/gi,
    "$1$2"
  );
  next = next.replace(
    /(static\/chunks\/[^"'`\s]*)\[([^\]/]+)\]/g,
    "$1$2"
  );
  return next;
}

function rewriteFiles() {
  const files = walkFiles(ROOT).filter((f) => {
    const rel = f.slice(ROOT.length);
    if (rel.includes(`${path.sep}node_modules${path.sep}`)) return false;
    return /\.(js|mjs|json|html|txt|css|map)$/.test(f);
  });

  let changed = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    if (!original.includes("static/chunks/")) continue;
    if (
      !original.includes("[") &&
      !/%5B/i.test(original)
    ) {
      continue;
    }
    const updated = rewriteChunkRefs(original);
    if (updated !== original) {
      fs.writeFileSync(file, updated);
      changed += 1;
    }
  }
  return changed;
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error("Missing .open-next — run the Cloudflare build first.");
    process.exit(1);
  }

  console.log("Fixing Cloudflare chunk paths…");
  const renamed = renameBracketDirs(ASSETS_STATIC);
  const changed = rewriteFiles();
  console.log(`Done. Renamed ${renamed} dirs, updated ${changed} files.`);
}

main();
