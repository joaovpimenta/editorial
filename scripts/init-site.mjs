// Guided bootstrap CLI for initializing the Editorial template for a new subject.
// Deterministic and idempotent. Supports interactive mode and --non-interactive --json.
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileTheme } from "./build-tokens.mjs";
import { parseV2Article } from "./lib/markdown-article.mjs";
import {
  loadSiteConfig,
  loadThemePreset,
  siteConfigScript,
  validateSiteConfig,
  validateThemePreset,
} from "./lib/site-config.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESERVED_SLUGS = new Set([
  "articles", "assets", "content", "dist", "docs", "generation", "scripts", "tools", "index", "article", "theme", "tests",
]);

function usage() {
  return `Usage:
  node scripts/init-site.mjs [options]

Options:
  --root <dir>             Target repository root (default: current repository)
  --name <string>          Site display name
  --slug <kebab-case>      Site slug identifier
  --subject <string>       Editorial subject (updates eyebrow, defaults and docs/EDITORIAL.md)
  --eyebrow <string>       Override archive intro eyebrow
  --intro-heading <str>    Home intro heading
  --intro-body <str>       Home intro paragraph
  --description <str>      Site meta description
  --footer-text <str>      Footer label
  --repo <owner/repo|"">   GitHub repository for optional stars link & TTS releases
  --lang <bcp47>           Primary HTML language (default: pt-BR)
  --theme <slug>           Theme preset name in theme/presets/<theme>.json
  --theme-color <#rrggbb>  PWA / browser theme color hex
  --audio-label <str>      Audio subtitle suffix (default: Narração)
  --tags <csv>             Comma-separated tags (slug or slug:Label), updates generation/taxonomy/tags.json
  --keep-example[=bool]    Keep shipped example article articles/introducao-ao-editorial/ (default: true)
  --no-keep-example        Remove example articles/introducao-ao-editorial/ and scaffold a starter article
  --non-interactive        Do not read from stdin; use flags and current config values
  --json                   Print machine-readable JSON summary
  --help, -h               Show this help`;
}

const VALUE_FLAGS = new Set([
  "--root", "--name", "--slug", "--subject", "--eyebrow", "--intro-heading",
  "--intro-body", "--description", "--footer-text", "--repo", "--lang",
  "--theme", "--theme-color", "--audio-label", "--tags",
]);

function parseArgs(argv) {
  const values = { help: false, json: false, nonInteractive: false, keepExample: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      values.help = true;
      continue;
    }
    if (arg === "--json") {
      values.json = true;
      continue;
    }
    if (arg === "--non-interactive") {
      values.nonInteractive = true;
      continue;
    }
    if (arg === "--keep-example") {
      const next = argv[i + 1];
      if (next === "true" || next === "false") {
        values.keepExample = next === "true";
        i += 1;
      } else {
        values.keepExample = true;
      }
      continue;
    }
    if (arg.startsWith("--keep-example=")) {
      const raw = arg.slice("--keep-example=".length);
      if (raw !== "true" && raw !== "false") throw new Error(`Invalid boolean for --keep-example: ${raw}`);
      values.keepExample = raw === "true";
      continue;
    }
    if (arg === "--no-keep-example") {
      values.keepExample = false;
      continue;
    }
    if (!VALUE_FLAGS.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`);
    const value = argv[++i];
    if (value.startsWith("--") && arg !== "--repo") throw new Error(`${arg} requires a value`);
    const camel = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    values[camel] = value;
  }
  return values;
}

function slugify(value, fallback = "meu-site") {
  const slug = String(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function titleCaseLabel(id) {
  return id
    .split("-")
    .map(part => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
}

async function prompt(question, fallback) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(root, targetPath) {
  return path.relative(root, targetPath).split(path.sep).join("/");
}

async function updateTaxonomy(root, tagsSpec, subject, keepExample, filesWritten) {
  const taxonomyPath = path.join(root, "generation", "taxonomy", "tags.json");
  const current = JSON.parse(await readFile(taxonomyPath, "utf8"));
  if (!tagsSpec) return current;

  const entries = String(tagsSpec)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  if (!entries.length) throw new Error("--tags must contain at least one tag");

  const nextTags = {};
  for (const entry of entries) {
    const [rawId, rawLabel] = entry.split(":", 2).map(part => part.trim());
    const id = slugify(rawId, "");
    if (!id) throw new Error(`Invalid tag entry: ${entry}`);
    const label = rawLabel || current.tags?.[id]?.label || titleCaseLabel(id);
    const description = current.tags?.[id]?.description || `Artigos e notas sobre ${label.toLocaleLowerCase("pt-BR")} em ${subject}.`;
    nextTags[id] = { label, description };
  }

  if (keepExample) {
    const articlesDir = path.join(root, "articles");
    if (await fileExists(articlesDir)) {
      for (const entry of await readdir(articlesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const rel = `articles/${entry.name}/article.md`;
        const abs = path.join(root, rel);
        if (!(await fileExists(abs))) continue;
        const parsed = parseV2Article(await readFile(abs, "utf8"), rel);
        for (const tagId of parsed.metadata.tags ?? []) {
          if (!nextTags[tagId] && current.tags?.[tagId]) {
            nextTags[tagId] = current.tags[tagId];
          }
        }
      }
    }
  }

  const updated = {
    version: 1,
    tags: nextTags,
    optionalMetadata: current.optionalMetadata ?? {},
  };
  await writeFile(taxonomyPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  filesWritten.push(toPosix(root, taxonomyPath));
  return updated;
}

async function updateEditorialDoc(root, config, subject, tags, filesWritten) {
  const editorialPath = path.join(root, "docs", "EDITORIAL.md");
  if (!(await fileExists(editorialPath))) return;
  const content = (await readFile(editorialPath, "utf8")).replace(/\r\n?/g, "\n");
  const tagLabels = Object.entries(tags).map(([id, info]) => `\`${id}\` (${info.label})`).join(", ");
  const scopeBody = [
    `## Escopo`,
    ``,
    `Publicação em \`${config.lang}\` para **${config.name}** com foco em **${subject}**.`,
    `Tags editoriais ativas: ${tagLabels}.`,
  ].join("\n");

  const next = /## Escopo\n[\s\S]*?(?=\n## |$)/.test(content)
    ? content.replace(/## Escopo\n[\s\S]*?(?=\n## |$)/, `${scopeBody}\n`)
    : `${content.trimEnd()}\n\n${scopeBody}\n`;

  await writeFile(editorialPath, next, "utf8");
  filesWritten.push(toPosix(root, editorialPath));
}

async function updateContextDoc(root, config, subject, filesWritten) {
  const contextPath = path.join(root, "CONTEXT.md");
  if (!(await fileExists(contextPath))) return;
  const content = (await readFile(contextPath, "utf8")).replace(/\r\n?/g, "\n");
  const block = [
    `## Identidade configurada`,
    ``,
    `- **Site:** ${config.name} (\`${config.slug}\`)`,
    `- **Assunto:** ${subject}`,
    `- **Idioma:** \`${config.lang}\``,
    `- **Tema:** \`${config.theme}\``,
    `- **Repositório:** ${config.repo ? `\`${config.repo}\`` : "_não configurado_"}`,
  ].join("\n");

  const next = /## Identidade configurada\n[\s\S]*?(?=\n## |$)/.test(content)
    ? content.replace(/## Identidade configurada\n[\s\S]*?(?=\n## |$)/, `${block}\n`)
    : `${content.trimEnd()}\n\n${block}\n`;

  await writeFile(contextPath, next, "utf8");
  filesWritten.push(toPosix(root, contextPath));
}

async function scaffoldStarterArticle(root, config, subject, taxonomy, filesWritten) {
  const baseSlug = slugify(subject !== config.name ? `introducao-${subject}` : `primeiro-artigo`, "primeiro-artigo");
  const starterSlug = RESERVED_SLUGS.has(baseSlug) ? `${baseSlug}-artigo` : baseSlug;
  const firstTag = Object.keys(taxonomy.tags)[0] || "fundamentos";
  const starterDir = path.join(root, "articles", starterSlug);
  const articlePath = path.join(starterDir, "article.md");
  const coverPath = path.join(starterDir, "cover.jpg");
  const exampleCover = path.join(root, "articles", "introducao-ao-editorial", "cover.jpg");

  await mkdir(starterDir, { recursive: true });
  if (!(await fileExists(coverPath)) && (await fileExists(exampleCover))) {
    await copyFile(exampleCover, coverPath);
    filesWritten.push(toPosix(root, coverPath));
  }

  if (!(await fileExists(articlePath))) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const articleSource = `---
language: ${config.lang}
category: ${config.eyebrow}
date: "20 de novembro de 2026"
publishedAt: "${todayIso}"
read: "3 min de leitura"
excerpt: "Guia inicial sobre ${subject} no arquivo ${config.name}."
tags:
  - ${firstTag}
formatVersion: 2
---

# Fundamentos de ${subject}

> Um primeiro mapa claro para situar os conceitos essenciais de ${subject}.

![Aquarela editorial sobre papel claro representando uma bancada de estudo organizada e tranquila sobre ${subject}.](./cover.jpg)

Em uma oficina silenciosa no fim da tarde, alguém pergunta por onde começar a organizar ferramentas que nunca foram catalogadas, e o artesão responde que basta escolher a peça que sustenta todas as outras antes de arrumar a estante inteira. Esse ponto de partida explica por que estudar ${subject} começa pelos conceitos estruturais antes dos detalhes isolados.

## Neste artigo

- [1. Ponto de partida em ${subject}](#ponto-de-partida)
- [Resumo mental](#resumo-mental)
- [Perguntas de revisão](#perguntas-de-revisão)
- [Exercícios](#exercícios)
- [Fontes](#fontes)

<a name="ponto-de-partida"></a>

## 1. Ponto de partida em ${subject}

Substitua este rascunho gerando o brief completo via compositor editorial e validando o resultado com a suíte automática.

## Resumo mental

Começar por um recorte claro facilita conectar prática, contexto e decisões em ${subject}.

## Perguntas de revisão

Quais fronteiras e premissas distinguem o conceito inicial dos casos mais avançados de ${subject}?

## Exercícios

Identifique um exemplo cotidiano de ${subject} e registre suas premissas principais antes de expandir o tema.

## Fontes

- [Referência inicial de ${subject}](https://example.org)
`;
    await writeFile(articlePath, articleSource, "utf8");
    filesWritten.push(toPosix(root, articlePath));
  }

  const exampleDir = path.join(root, "articles", "introducao-ao-editorial");
  if (starterSlug !== "introducao-ao-editorial" && (await fileExists(exampleDir))) {
    await rm(exampleDir, { recursive: true, force: true });
  }
  return toPosix(root, articlePath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = args.root ? path.resolve(args.root) : DEFAULT_ROOT;
  const current = await loadSiteConfig(root);
  const name = args.name ?? (args.nonInteractive ? current.name : await prompt("Nome do site", current.name));
  const defaultSubject = args.subject ?? args.eyebrow ?? current.eyebrow;
  const subject = args.subject ?? (args.nonInteractive ? defaultSubject : await prompt("Assunto do blog", defaultSubject));
  const eyebrow = args.eyebrow ?? (args.subject ? subject : current.eyebrow);
  const slug = args.slug ?? (args.name ? slugify(name, current.slug) : current.slug);
  const lang = args.lang ?? (args.nonInteractive ? current.lang : await prompt("Idioma principal (BCP-47)", current.lang));
  const theme = args.theme ?? current.theme;
  const repo = args.repo !== undefined ? args.repo : (args.nonInteractive ? current.repo : await prompt("Repositório GitHub (owner/repo ou vazio)", current.repo));
  const introHeading = args.introHeading ?? current.introHeading;
  const introBody = args.introBody ?? (args.subject
    ? `Artigos para entender ${subject}, dos fundamentos à prática.`
    : current.introBody);
  const description = args.description ?? (args.subject
    ? `${name} — arquivo de artigos sobre ${subject}.`
    : current.description);
  const footerText = args.footerText ?? ((args.name || args.subject)
    ? `${name} · ${subject}`
    : current.footerText);
  const themeColor = args.themeColor ?? current.themeColor;
  const audioLabel = args.audioLabel ?? current.audioLabel;

  const merged = validateSiteConfig({
    ...current,
    name,
    slug,
    lang,
    description,
    eyebrow,
    introHeading,
    introBody,
    footerText,
    theme,
    themeColor,
    repo,
    audioLabel,
  });

  const filesWritten = [];
  const configPath = path.join(root, "site.config.json");
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  filesWritten.push("site.config.json");

  const presetPath = path.join(root, "theme", "presets", `${merged.theme}.json`);
  let preset;
  if (await fileExists(presetPath)) {
    preset = await loadThemePreset(root, merged.theme);
    if (args.themeColor && preset.themeColor !== merged.themeColor) {
      preset = { ...preset, themeColor: merged.themeColor };
      validateThemePreset(preset, merged.theme);
      await writeFile(presetPath, `${JSON.stringify(preset, null, 2)}\n`, "utf8");
      filesWritten.push(toPosix(root, presetPath));
    }
  } else {
    const basePresetPath = path.join(root, "theme", "presets", `${current.theme}.json`);
    const fallbackPresetPath = (await fileExists(basePresetPath))
      ? basePresetPath
      : path.join(root, "theme", "presets", "editorial.json");
    const cloned = JSON.parse(await readFile(fallbackPresetPath, "utf8"));
    cloned.name = merged.theme;
    cloned.themeColor = merged.themeColor;
    if (cloned.color?.brand && args.themeColor) cloned.color.brand = merged.themeColor;
    validateThemePreset(cloned, merged.theme);
    await mkdir(path.dirname(presetPath), { recursive: true });
    await writeFile(presetPath, `${JSON.stringify(cloned, null, 2)}\n`, "utf8");
    filesWritten.push(toPosix(root, presetPath));
    preset = cloned;
  }

  const themeCssPath = path.join(root, "theme.css");
  await writeFile(themeCssPath, compileTheme(preset), "utf8");
  filesWritten.push("theme.css");

  const siteConfigJsPath = path.join(root, "site-config.js");
  await writeFile(siteConfigJsPath, `${siteConfigScript(merged)}\n`, "utf8");
  filesWritten.push("site-config.js");

  const taxonomy = await updateTaxonomy(root, args.tags, subject, args.keepExample, filesWritten);
  await updateEditorialDoc(root, merged, subject, taxonomy.tags, filesWritten);
  await updateContextDoc(root, merged, subject, filesWritten);

  let starterArticle = null;
  if (!args.keepExample) {
    starterArticle = await scaffoldStarterArticle(root, merged, subject, taxonomy, filesWritten);
  }

  const uniqueWritten = [...new Set(filesWritten)].sort();
  const next = [
    `node scripts/lint-tokens.mjs ${merged.theme}`,
    "node scripts/validate-site.mjs",
    "python scripts/snapshot-visual.py --capture --build",
  ];
  const report = {
    status: "ok",
    root,
    config: merged,
    filesWritten: uniqueWritten,
    keptExample: args.keepExample,
    starterArticle,
    nextStep: "node scripts/validate-site.mjs",
    next,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nEdital configurado como "${merged.name}" (assunto: ${subject}, tema: ${merged.theme}).`);
    console.log("Arquivos gravados:");
    for (const file of uniqueWritten) console.log(`  - ${file}`);
    console.log("Próximos passos:");
    for (const step of next) console.log(`  ${step}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
