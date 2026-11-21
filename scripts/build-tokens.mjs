// Compile the active theme preset (theme/presets/<name>.json) into a CSS
// custom-property sheet (theme.css by default, or --out <path>).
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSiteConfig, loadThemePreset } from "./lib/site-config.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function flatten(section, prefix) {
  const lines = [];
  for (const [name, value] of Object.entries(section)) {
    lines.push(`  --${prefix}-${name}: ${value};`);
  }
  return lines;
}

export function compileTheme(preset) {
  const sections = [];
  for (const section of ["color", "font", "motion", "mermaid", "z", "layout"]) {
    if (preset[section]) sections.push(...flatten(preset[section], section));
  }
  return `:root {\n${sections.join("\n")}\n}\n`;
}

function parseArgs(argv) {
  const opts = { root: REPO_ROOT, theme: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root" || arg === "--theme" || arg === "--out") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      opts[arg.slice(2)] = value;
    } else if (!arg.startsWith("-") && !opts.theme) {
      opts.theme = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  opts.root = path.resolve(opts.root);
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = await loadSiteConfig(opts.root);
  const presetName = opts.theme || config.theme;
  const preset = await loadThemePreset(opts.root, presetName);
  const outPath = opts.out ? path.resolve(opts.root, opts.out) : path.join(opts.root, "theme.css");
  const css = compileTheme(preset);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, css, "utf8");
  process.stdout.write(`Wrote ${path.relative(opts.root, outPath)} (${presetName})\n`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
