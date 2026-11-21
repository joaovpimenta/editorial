// Single source of truth for site identity and active theme preset.
// Both loaders fail closed on missing or invalid configuration.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const REQUIRED_STRINGS = [
  "name",
  "slug",
  "lang",
  "description",
  "eyebrow",
  "introHeading",
  "introBody",
  "footerText",
  "theme",
  "themeColor",
  "audioLabel",
];

export function validateSiteConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("site.config.json must contain a JSON object");
  }
  for (const field of REQUIRED_STRINGS) {
    if (typeof raw[field] !== "string" || !raw[field].trim()) {
      throw new Error(`site.config.json: missing or empty string field "${field}"`);
    }
  }
  if (!SLUG_PATTERN.test(raw.slug)) {
    throw new Error(`site.config.json: invalid slug "${raw.slug}" (expected lowercase kebab-case)`);
  }
  if (!SLUG_PATTERN.test(raw.theme)) {
    throw new Error(`site.config.json: invalid theme "${raw.theme}" (expected lowercase kebab-case)`);
  }
  if (!LANG_PATTERN.test(raw.lang)) {
    throw new Error(`site.config.json: invalid lang "${raw.lang}"`);
  }
  if (!HEX_COLOR_PATTERN.test(raw.themeColor)) {
    throw new Error(`site.config.json: themeColor must be a 6-digit hex color (#rrggbb)`);
  }
  if (typeof raw.repo !== "string" || (raw.repo !== "" && !REPO_PATTERN.test(raw.repo))) {
    throw new Error(`site.config.json: repo must be "" or "owner/repo"`);
  }
  return { ...raw };
}

export async function loadSiteConfig(root = REPO_ROOT) {
  const configPath = path.join(root, "site.config.json");
  let raw;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing required site.config.json at ${configPath}`);
    }
    throw new Error(`Invalid site.config.json at ${configPath}: ${error.message}`);
  }
  return validateSiteConfig(raw);
}

const TOKEN_SECTIONS = ["color", "font", "motion", "mermaid", "z", "layout"];
const LITERAL_COLOR_NAME = /(?:^|-)(?:red|green|blue|yellow|orange|purple|pink|white|black|gray|grey)(?:-|$)/i;

export function validateThemePreset(raw, expectedName) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Theme preset "${expectedName}" must contain a JSON object`);
  }
  if (raw.name !== expectedName) {
    throw new Error(`Theme preset "${expectedName}" declares mismatched name "${raw.name}"`);
  }
  if (typeof raw.themeColor !== "string" || !HEX_COLOR_PATTERN.test(raw.themeColor)) {
    throw new Error(`Theme preset "${expectedName}": themeColor must be a 6-digit hex color`);
  }
  if (raw.fontsUrl !== undefined && (typeof raw.fontsUrl !== "string" || (raw.fontsUrl !== "" && !/^https:\/\//i.test(raw.fontsUrl)))) {
    throw new Error(`Theme preset "${expectedName}": fontsUrl must be "" or an HTTPS URL`);
  }
  for (const section of TOKEN_SECTIONS) {
    if (!raw[section] || typeof raw[section] !== "object" || Array.isArray(raw[section])) {
      throw new Error(`Theme preset "${expectedName}" is missing section "${section}"`);
    }
    for (const [key, value] of Object.entries(raw[section])) {
      if (!SLUG_PATTERN.test(key)) {
        throw new Error(`Theme preset "${expectedName}": token key "${section}.${key}" must be kebab-case`);
      }
      if (LITERAL_COLOR_NAME.test(key)) {
        throw new Error(`Theme preset "${expectedName}": token key "${section}.${key}" uses a literal color word; use a semantic role instead`);
      }
      if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
        throw new Error(`Theme preset "${expectedName}": token "${section}.${key}" must be a non-empty scalar`);
      }
    }
  }
  return raw;
}

export async function loadThemePreset(root = REPO_ROOT, themeName) {
  if (typeof themeName !== "string" || !SLUG_PATTERN.test(themeName)) {
    throw new Error(`Invalid theme preset name: ${themeName}`);
  }
  const presetPath = path.join(root, "theme", "presets", `${themeName}.json`);
  let raw;
  try {
    raw = JSON.parse(await readFile(presetPath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing theme preset file: ${presetPath}`);
    }
    throw new Error(`Invalid theme preset ${presetPath}: ${error.message}`);
  }
  return validateThemePreset(raw, themeName);
}

export function siteConfigScript(config) {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.SiteConfig=${json};`;
}

const ZERO_SHA = "0".repeat(40);
export function assertCommitSha(sha, label) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha) || sha === ZERO_SHA) {
    throw new Error(`${label} must be an explicitly supplied, non-zero full Git SHA`);
  }
}
