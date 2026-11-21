import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PUBLIC_ROOT_FILES } from "./lib/site-artifact.mjs";
import { buildMarkdownPreview } from "./lib/markdown-site-artifact.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "editorial-init-site-test-"));

async function seedTemplateRoot(destination) {
  await mkdir(path.join(destination, "generation", "taxonomy"), { recursive: true });
  await mkdir(path.join(destination, "content"), { recursive: true });
  await mkdir(path.join(destination, "docs"), { recursive: true });
  for (const file of PUBLIC_ROOT_FILES) {
    if (file === "theme.css" || file === "site-config.js") continue;
    await cp(path.join(root, file), path.join(destination, file), { recursive: true });
  }
  await cp(path.join(root, "site.config.json"), path.join(destination, "site.config.json"));
  await cp(path.join(root, "theme"), path.join(destination, "theme"), { recursive: true });
  await cp(path.join(root, "assets"), path.join(destination, "assets"), { recursive: true });
  await cp(path.join(root, "articles"), path.join(destination, "articles"), { recursive: true });
  await cp(path.join(root, "generation", "taxonomy", "tags.json"), path.join(destination, "generation", "taxonomy", "tags.json"));
  await cp(path.join(root, "content", "tts-lexicon.json"), path.join(destination, "content", "tts-lexicon.json"));
  await cp(path.join(root, "docs", "EDITORIAL.md"), path.join(destination, "docs", "EDITORIAL.md"));
  await cp(path.join(root, "CONTEXT.md"), path.join(destination, "CONTEXT.md"));
}

async function runNode(args, cwd = root) {
  const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd, encoding: "utf8" });
  return { stdout, stderr };
}

try {
  // 1. Non-interactive JSON mode with --keep-example (default): verify idempotency and outputs.
  const keepRoot = path.join(temporaryRoot, "keep-example");
  await seedTemplateRoot(keepRoot);

  const initArgs = [
    path.join(root, "scripts", "init-site.mjs"),
    "--root", keepRoot,
    "--non-interactive",
    "--json",
    "--name", "Revista Clara",
    "--subject", "Economia",
    "--theme", "clara",
    "--tags", "macro,financas",
    "--repo", "org/revista",
  ];

  const firstRun = await runNode(initArgs);
  const firstReport = JSON.parse(firstRun.stdout);
  assert.equal(firstReport.status, "ok");
  assert.equal(firstReport.keptExample, true);
  assert.equal(firstReport.starterArticle, null);
  assert.equal(firstReport.nextStep, "node scripts/validate-site.mjs");
  assert.ok(firstReport.filesWritten.includes("site.config.json"));
  assert.ok(firstReport.filesWritten.includes("theme/presets/clara.json"));
  assert.ok(firstReport.filesWritten.includes("theme.css"));
  assert.ok(firstReport.filesWritten.includes("site-config.js"));

  const secondRun = await runNode(initArgs);
  const secondReport = JSON.parse(secondRun.stdout);
  assert.deepEqual(secondReport.config, firstReport.config, "init-site.mjs must be idempotent across repeated invocations");
  assert.equal(secondReport.filesWritten.includes("theme/presets/clara.json"), false,
    "repeated invocation must preserve an already-created theme preset when --theme-color is unchanged");
  const thirdRun = await runNode(initArgs);
  assert.deepEqual(JSON.parse(thirdRun.stdout).filesWritten, secondReport.filesWritten,
    "repeated invocations on an initialized site must produce identical filesWritten lists");

  const configAfter = JSON.parse(await readFile(path.join(keepRoot, "site.config.json"), "utf8"));
  assert.equal(configAfter.name, "Revista Clara");
  assert.equal(configAfter.slug, "revista-clara");
  assert.equal(configAfter.theme, "clara");
  assert.equal(configAfter.repo, "org/revista");

  const clonedPreset = JSON.parse(await readFile(path.join(keepRoot, "theme", "presets", "clara.json"), "utf8"));
  assert.equal(clonedPreset.name, "clara");
  const themeCss = await readFile(path.join(keepRoot, "theme.css"), "utf8");
  assert.match(themeCss, /--color-paper:/);
  const siteConfigJs = await readFile(path.join(keepRoot, "site-config.js"), "utf8");
  assert.match(siteConfigJs, /"Revista Clara"/);

  await runNode([path.join(root, "scripts", "lint-tokens.mjs"), "--root", keepRoot]);
  await runNode([path.join(root, "scripts", "lint-articles.mjs"), "--root", keepRoot]);

  // 2. Non-interactive mode with --no-keep-example: removes example article and scaffolds a valid starter.
  const freshRoot = path.join(temporaryRoot, "no-keep-example");
  await seedTemplateRoot(freshRoot);

  const freshRun = await runNode([
    path.join(root, "scripts", "init-site.mjs"),
    "--root", freshRoot,
    "--non-interactive",
    "--json",
    "--name", "Revista Clara",
    "--subject", "Economia",
    "--theme", "clara",
    "--tags", "macro,financas",
    "--repo", "org/revista",
    "--no-keep-example",
  ]);
  const freshReport = JSON.parse(freshRun.stdout);
  assert.equal(freshReport.keptExample, false);
  assert.equal(freshReport.starterArticle, "articles/introducao-economia/article.md");

  await assert.rejects(
    readFile(path.join(freshRoot, "articles", "introducao-ao-editorial", "article.md")),
    { code: "ENOENT" },
    "--no-keep-example must remove articles/introducao-ao-editorial"
  );
  await runNode([path.join(root, "scripts", "lint-tokens.mjs"), "--root", freshRoot]);
  await runNode([path.join(root, "scripts", "lint-articles.mjs"), "--root", freshRoot]);

  const preview = await buildMarkdownPreview({
    root: freshRoot,
    sourceSha: "a".repeat(40),
    destination: path.join(temporaryRoot, "fresh-dist"),
  });
  assert.ok(preview.files.includes("introducao-economia/index.html"));
  const homeHtml = await readFile(path.join(preview.destination, "index.html"), "utf8");
  assert.match(homeHtml, /Revista Clara/);
  assert.doesNotMatch(homeHtml, /tech[\s_-]?topics|joaovpimenta|\bedital\b/i);

  console.log("PASS: init-site bootstrap CLI is idempotent, generates valid tokens/config/taxonomy, and compiles previews cleanly.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
