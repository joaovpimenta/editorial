import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarkdownPreview } from "./lib/markdown-site-artifact.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt", ".md"]);
const FORBIDDEN = /tech[\s_-]?topics|joaovpimenta|\bedital\b/i;

function parseArgs(argv) {
  let targetRoot = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") {
      if (!argv[i + 1]) throw new Error("--root requires a directory");
      targetRoot = path.resolve(argv[++i]);
    } else {
      throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  return { targetRoot };
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const { targetRoot } = parseArgs(process.argv.slice(2));
let temporaryRoot = null;
let auditRoot = targetRoot;

try {
  if (!auditRoot) {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "editorial-debrand-audit-"));
    const preview = await buildMarkdownPreview({
      root,
      sourceSha: "a".repeat(40),
      destination: path.join(temporaryRoot, "dist"),
    });
    auditRoot = preview.destination;
  }

  const files = (await walkFiles(auditRoot)).sort();
  assert(files.length > 0, `no files found to audit in ${auditRoot}`);
  const violations = [];
  let scanned = 0;

  for (const filePath of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
    scanned += 1;
    const text = await readFile(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (FORBIDDEN.test(lines[i])) {
        violations.push(`${path.relative(auditRoot, filePath)}:${i + 1}: ${lines[i].trim().slice(0, 140)}`);
      }
    }
  }

  assert.equal(violations.length, 0, `Forbidden brand references found in built output:\n${violations.join("\n")}`);
  console.log(`PASS: debranding audit clean across ${scanned} built text files in ${path.relative(root, auditRoot) || auditRoot}.`);
} finally {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}
