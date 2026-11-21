import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PUBLIC_ROOT_FILES } from "./lib/site-artifact.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "editorial-markdown-pipeline-"));
const fixtureRoot = path.join(tempRoot, "fixture");
const buildScript = path.join(root, "scripts", "build-articles.mjs");
const lintScript = path.join(root, "scripts", "lint-articles.mjs");
const coverSource = path.join(root, "articles", "introducao-ao-editorial", "cover.jpg");

try {
  await mkdir(path.join(fixtureRoot, "articles", "markdown-fixture"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "generation", "taxonomy"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "assets"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "content"), { recursive: true });
  for (const file of PUBLIC_ROOT_FILES) {
    if (file === "theme.css" || file === "site-config.js") continue;
    await cp(path.join(root, file), path.join(fixtureRoot, file), { recursive: true });
  }
  await cp(path.join(root, "site.config.json"), path.join(fixtureRoot, "site.config.json"));
  await cp(path.join(root, "theme"), path.join(fixtureRoot, "theme"), { recursive: true });
  for (const entry of await readdir(path.join(root, "assets"), { withFileTypes: true })) {
    if (entry.isFile()) await cp(path.join(root, "assets", entry.name), path.join(fixtureRoot, "assets", entry.name));
  }
  await cp(coverSource, path.join(fixtureRoot, "articles", "markdown-fixture", "cover.jpg"));
  await cp(path.join(root, "generation", "taxonomy", "tags.json"),
    path.join(fixtureRoot, "generation", "taxonomy", "tags.json"));

  const taxonomy = JSON.parse(await readFile(path.join(root, "generation", "taxonomy", "tags.json"), "utf8"));
  const tagId = Object.keys(taxonomy.tags)[0];
  const opening = "Uma cena simples apresenta o contrato editorial em Markdown.";
  const markdown = `---
language: pt-BR
category: Fundamentos
tags:
  - ${tagId}
date: "26 de outubro de 2026"
publishedAt: "2026-10-26"
read: "1 min"
excerpt: "Resumo curto do artigo Markdown."
level: intermediario
formatVersion: 2
---

# Artigo Markdown de fixture

> Um subtítulo Markdown.

![Capa do artigo Markdown](./cover.jpg)

${opening}

## Neste artigo

- [Fontes](#fontes)

## Fontes

[Referência](https://example.org/)
`;
  const articlePath = path.join(fixtureRoot, "articles", "markdown-fixture", "article.md");
  await writeFile(articlePath, markdown, "utf8");

  await run(process.execPath, [buildScript, "--root", fixtureRoot], { cwd: root });
  await run(process.execPath, [lintScript, "--root", fixtureRoot], { cwd: root });

  const catalog = JSON.parse(await readFile(path.join(fixtureRoot, "assets", "articles-catalog.json"), "utf8"));
  assert.deepEqual(catalog.map(record => record.slug), ["markdown-fixture"]);
  const record = catalog[0];
  assert.deepEqual(record.tags, [tagId]);
  assert.equal(record.level, "intermediario");
  assert.equal(record.opening, opening);
  assert.equal(record.image, "assets/markdown-fixture/cover.jpg");
  assert.equal(Object.hasOwn(record, "bodyHtml"), false);

  await writeFile(path.join(fixtureRoot, "articles", "json-reintroduced.json"), "{}\n", "utf8");
  await assert.rejects(run(process.execPath, [buildScript, "--root", fixtureRoot], { cwd: root }),
    /invalid article directory/);
  console.log("PASS: self-contained Markdown source build, lightweight catalog, and layout guard.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
