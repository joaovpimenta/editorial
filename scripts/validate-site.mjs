import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["Check repository diagnostics", ["scripts/test-repository-health.mjs"]],
  ["Run article contract tests", ["scripts/test-article-contract.mjs"]],
  ["Run article v2 contract tests", ["scripts/test-markdown-v2.mjs"]],
  ["Run markdown article compiler tests", ["scripts/test-markdown-article.mjs"]],
  ["Validate generation registry", ["scripts/validate-generation.mjs"]],
  ["Run generation composer tests", ["scripts/test-generation.cjs"]],
  ["Run init-site bootstrap tests", ["scripts/test-init-site.mjs"]],
  ["Build article manifest", ["scripts/build-articles.mjs"]],
  ["Build the design-token sheet", ["scripts/build-tokens.mjs"]],
  ["Enforce the design-token contract", ["scripts/lint-tokens.mjs"]],
  ["Lint article content", ["scripts/lint-articles.mjs"]],
  ["Check application syntax", ["--check", "app.js"]],
  ["Check search syntax", ["--check", "search.js"]],
  ["Check shared card syntax", ["--check", "cards.js"]],
  ["Run recommendation selection tests", ["scripts/test-recommendations.cjs"]],
  ["Check shared header syntax", ["--check", "header.js"]],
  ["Check article syntax", ["--check", "article.js"]],
  ["Check audio syntax", ["--check", "audio.js"]],
  ["Check speech syntax", ["--check", "speech.js"]],
  ["Run speech pronunciation and player tests", ["scripts/test-speech.cjs"]],
  ["Run recorded audio + Media Session tests", ["scripts/test-audio.cjs"]],
  ["Check Mermaid syntax", ["--check", "mermaid-theme.js"]],
  ["Check PWA syntax", ["--check", "pwa.js"]],
  ["Check service worker syntax", ["--check", "sw.js"]],
  ["Run PWA tests", ["scripts/test-pwa.cjs"]],
  ["Run diagram tests", ["scripts/test-diagrams.cjs"]],
  ["Run deterministic Markdown HTML preview tests", ["scripts/test-markdown-preview.mjs"]],
  ["Run Markdown-only article pipeline tests", ["scripts/test-markdown-article-pipeline.mjs"]],
  ["Run dist debranding audit", ["scripts/test-dist-debrand.mjs"]],
  ["Run local TTS tests", ["scripts/test-tts.mjs"]],
  ["Build local HTML preview artifact", ["scripts/build-site.mjs", "--preview"]]
];

function run(label, args) {
  return new Promise((resolve, reject) => {
    console.log("\n=== " + label + " ===");
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(label + " failed with exit code " + code));
    });
  });
}

for (const [label, args] of checks) {
  try {
    await run(label, args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log("\nPASS: all Editorial validation gates passed.");
