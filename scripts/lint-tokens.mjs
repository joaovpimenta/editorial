// Enforce the white-label token contract: components consume only semantic
// design tokens, no identity literals appear in components, and every token is used.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileTheme } from "./build-tokens.mjs";
import { loadSiteConfig, loadThemePreset } from "./lib/site-config.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { root: REPO_ROOT, theme: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root requires a directory");
      opts.root = path.resolve(value);
    } else if (!arg.startsWith("-") && !opts.theme) {
      opts.theme = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|:\s*(?:white|black)\b/i;
const LITERAL_COLOR_NAME = /(?:^|-)(?:red|green|blue|yellow|orange|purple|pink|white|black|gray|grey)(?:-|$)/i;

function tokenNames(themeCss) {
  return [...themeCss.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]);
}

const opts = parseArgs(process.argv.slice(2));
const config = await loadSiteConfig(opts.root);
const presetName = opts.theme || config.theme;
const preset = await loadThemePreset(opts.root, presetName);
const themeCss = compileTheme(preset);

async function read(relative) {
  return readFile(path.join(opts.root, relative), "utf8");
}

const stylesRaw = await read("styles.css");
const styles = stripCssComments(stylesRaw);
const mermaid = await read("mermaid-theme.js");
const pwa = await read("pwa.js");
const html = (await read("index.html")) + (await read("article.html"));
const consumers = styles + mermaid + pwa + html;

const problems = [];

// 1. CSS rules in styles.css must not embed identity literals.
for (const [lineIndex, line] of styles.split("\n").entries()) {
  const n = lineIndex + 1;
  if (COLOR_LITERAL.test(line)) {
    problems.push(`styles.css:${n}: literal color value: ${line.trim()}`);
  }
  for (const m of line.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const val = m[1].trim();
    if (!/^var\(--font-[a-z0-9-]+\)$|^inherit$/i.test(val)) {
      problems.push(`styles.css:${n}: literal font-family: ${val}`);
    }
  }
  for (const m of line.matchAll(/(?:transition|animation)(?:-duration|-timing-function)?\s*:\s*([^;}]+)/gi)) {
    const val = m[1].trim();
    if (/^(?:none|inherit|initial|unset)$/i.test(val)) continue;
    const stripped = val.replace(/var\(--motion-[a-z0-9-]+\)/gi, "");
    if (/\b\d*\.?\d+m?s\b/i.test(stripped) && !/\b0m?s\b/i.test(stripped)) {
      problems.push(`styles.css:${n}: literal motion duration: ${val}`);
    }
  }
}

// 2. Runtime component JS must not inject literal colors or z-index styling.
for (const [fileName, source] of [["mermaid-theme.js", mermaid], ["pwa.js", pwa]]) {
  for (const [lineIndex, line] of source.split("\n").entries()) {
    const n = lineIndex + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    if (COLOR_LITERAL.test(line)) {
      problems.push(`${fileName}:${n}: literal color value: ${trimmed}`);
    }
    if (/style\.cssText\s*=|z-index\s*:/i.test(line)) {
      problems.push(`${fileName}:${n}: inline style/z-index literal: ${trimmed}`);
    }
  }
}

// 3. Semantic token naming (no literal color names) & complete consumption.
for (const name of tokenNames(themeCss)) {
  if (LITERAL_COLOR_NAME.test(name.slice(2))) {
    problems.push(`token ${name} contains a literal color word`);
  }
  if (!consumers.includes(name)) {
    problems.push(`token ${name} is defined in ${presetName} but never consumed`);
  }
}

if (problems.length) {
  console.error("TOKEN CONTRACT VIOLATIONS:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`TOKEN CONTRACT OK: ${tokenNames(themeCss).length} tokens (${presetName}), no identity literals in components.`);
