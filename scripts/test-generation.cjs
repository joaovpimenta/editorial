const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { mkdtemp, mkdir, writeFile, readFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");

const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const composer = path.join(root, "scripts", "compose-article-brief.mjs");
const coverComposer = path.join(root, "scripts", "compose-cover-brief.mjs");

async function expectFailure(args, pattern) {
  await assert.rejects(
    run(process.execPath, [composer, ...args], { cwd: root }),
    error => pattern.test(`${error.stderr}\n${error.stdout}`)
  );
}

(async () => {
  const catalog = await run(process.execPath, [composer, "--list"], { cwd: root });
  const generationReadme = await readFile(path.join(root, "generation", "README.md"), "utf8");
  const authoring = await readFile(path.join(root, "generation", "editorial", "AUTHORING.md"), "utf8");
  assert.match(generationReadme, /formato-fonte, template, taxonomia e validação.*contrato autoral/);
  assert.match(authoring, /O build público aceita somente fontes Markdown/);
  assert.doesNotMatch(generationReadme, /O build público compila/);
  assert.doesNotMatch(generationReadme, /content\/articles/);
  assert.match(catalog.stdout, /explain-concept/);
  assert.match(catalog.stdout, /fundamentals/);
  assert.match(catalog.stdout, /Published topics/);
  assert.match(catalog.stdout, /"slug":"introducao-ao-editorial"/);
  assert.doesNotMatch(catalog.stdout, /"bodyHtml"/);

  const result = await run(process.execPath, [
    composer,
    "--topic", "Fila de Mensagens",
    "--task", "explain-concept",
    "--framework", "fundamentals",
    "--framework", "tradeoffs-and-risks",
    "--depth", "advanced"
  ], { cwd: root });
  assert.match(result.stdout, /articles\/fila-de-mensagens\/article\.md/);
  assert.match(result.stdout, /articles\/fila-de-mensagens\/cover\.jpg/);
  assert.match(result.stdout, /Lente de análise: Fundamentos e mecanismos/);
  assert.match(result.stdout, /Lente de análise: Trade-offs e riscos/);
  assert.doesNotMatch(result.stdout, /Lente de análise: Evidências e evolução/);
  assert.match(result.stdout, /articles\/<slug>\/article\.md/);
  assert.match(result.stdout, /valida os artigos Markdown/);
  assert.ok(Buffer.byteLength(result.stdout) < 32768);
  assert.match(result.stdout, /data-tts-say="try catch"/);
  assert.match(result.stdout, /<code lang="en-US"/);
  assert.match(result.stdout, /data-tts-say="para o"/);
  assert.match(result.stdout, /data-tts-say="aumenta"/);
  assert.match(result.stdout, /data-tts-say="diminuem"/);
  assert.match(result.stdout, /não traduza símbolos globalmente/);

  const cover = await run(process.execPath, [coverComposer], { cwd: root });
  assert.match(cover.stdout, /Style anchor obrigatório/);
  assert.match(cover.stdout, /articles\/introducao-ao-editorial\/cover\.jpg/);
  assert.match(cover.stdout, /Critérios de aceitação da capa/);
  assert.doesNotMatch(cover.stdout, /capa determinística/);
  assert.ok(Buffer.byteLength(cover.stdout) < 8192);

  const coverFixture = await mkdtemp(path.join(os.tmpdir(), "editorial-cover-"));
  try {
    await mkdir(path.join(coverFixture, "scripts"));
    await mkdir(path.join(coverFixture, "docs"));
    const fixtureComposer = path.join(coverFixture, "scripts", "compose-cover-brief.mjs");
    await writeFile(fixtureComposer, await readFile(coverComposer));
    const visualStyle = (await readFile(path.join(root, "docs", "VISUAL_STYLE.md"), "utf8")).replace(/\r\n?/g, "\n");
    for (const newline of ["\n", "\r\n", "\r"]) {
      await writeFile(path.join(coverFixture, "docs", "VISUAL_STYLE.md"), visualStyle.replace(/\n/g, newline));
      const fixtureCover = await run(process.execPath, [fixtureComposer]);
      assert.equal(fixtureCover.stdout, cover.stdout, "cover brief must be independent of document line endings");
    }
  } finally {
    await rm(coverFixture, { recursive: true, force: true });
  }

  await expectFailure([
    "--topic", "Fila de Mensagens",
    "--task", "unknown-task",
    "--framework", "fundamentals"
  ], /unknown task/);
  await expectFailure([
    "--topic", "Introdução ao Editorial",
    "--task", "explain-concept",
    "--framework", "fundamentals"
  ], /topic already exists/);
  await expectFailure([
    "--topic", "Fila de Mensagens",
    "--task", "explain-concept",
    "--framework", "fundamentals",
    "--framework", "tradeoffs-and-risks",
    "--framework", "evidence-and-history",
    "--framework", "practice-and-application"
  ], /at most 3 frameworks/);
  await expectFailure([
    "--topic", "Fila\nNova",
    "--task", "explain-concept",
    "--framework", "fundamentals"
  ], /single printable line/);

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "editorial-generation-"));
  await mkdir(path.join(temporaryRoot, "generation", "editorial"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "generation", "frameworks"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "generation", "taxonomy"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "generation", "templates"), { recursive: true });
  await writeFile(path.join(temporaryRoot, "generation", "editorial", "AUTHORING.md"), "# Authoring\n");
  await writeFile(path.join(temporaryRoot, "generation", "frameworks", "safe.md"), "# Safe\n");
  const invalidRegistry = {
    version: 1,
    limits: { maxFrameworks: 1, maxModuleBytes: 1024, maxBriefBytes: 2048 },
    authoring: "editorial/AUTHORING.md",
    tasks: { unsafe: { label: "Unsafe", file: "../outside.md" } },
    frameworks: { safe: { label: "Safe", file: "frameworks/safe.md" } }
  };
  const moduleUrl = pathToFileURL(path.join(root, "scripts", "lib", "generation-system.mjs"));
  const { validateGenerationRegistry, discoverArticleSources } = await import(moduleUrl.href);
  await assert.rejects(validateGenerationRegistry(temporaryRoot, invalidRegistry), /normalized|must live|traversal/);

  await mkdir(path.join(temporaryRoot, "scripts", "lib"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "generation", "tasks"));
  await mkdir(path.join(temporaryRoot, "articles"), { recursive: true });
  const fixtureArticleComposer = path.join(temporaryRoot, "scripts", "compose-article-brief.mjs");
  await writeFile(fixtureArticleComposer, await readFile(composer));
  const generationSystemSource = await readFile(path.join(root, "scripts", "lib", "generation-system.mjs"), "utf8");
  const sharedArticleModule = pathToFileURL(path.join(root, "scripts", "lib", "markdown-article.mjs")).href;
  await writeFile(path.join(temporaryRoot, "scripts", "lib", "generation-system.mjs"), generationSystemSource.replace(
    'from "./markdown-article.mjs"', `from ${JSON.stringify(sharedArticleModule)}`
  ));
  const validRegistry = { ...invalidRegistry, tasks: { fixture: { label: "Fixture", file: "tasks/fixture.md" } } };
  await writeFile(path.join(temporaryRoot, "generation", "registry.json"), JSON.stringify(validRegistry));
  await writeFile(path.join(temporaryRoot, "generation", "taxonomy", "tags.json"), JSON.stringify({
    version: 1,
    tags: { teste: { label: "Teste", description: "Tag de teste." } },
    optionalMetadata: {}
  }));
  await writeFile(path.join(temporaryRoot, "generation", "templates", "article.md"), "---\nformatVersion: 2\n---\nPREENCHER: conteúdo\n");
  const taxonomy = { version: 1, tags: { teste: { label: "Teste", description: "Tag de teste." } }, optionalMetadata: {} };
  const fixtureModules = ["editorial/AUTHORING.md", "tasks/fixture.md", "frameworks/safe.md"];
  let canonicalBrief;
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const file of fixtureModules) await writeFile(path.join(temporaryRoot, "generation", file), ["# Fixture", "", "Texto do módulo.", "Outra linha.", ""].join(newline));
    const composed = await run(process.execPath, [fixtureArticleComposer, "--topic", "Novo tema", "--task", "fixture", "--framework", "safe"]);
    canonicalBrief ??= composed.stdout;
    assert.equal(composed.stdout, canonicalBrief, "article brief must be independent of selected module line endings");
    assert.equal(composed.stdout.includes("\r"), false);
  }

  const writeSelfContainedArticle = async (slug, body = "Texto completo.", extraFields = "") => {
    const dir = path.join(temporaryRoot, "articles", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "cover.jpg"), "fixture");
    const content = [
      "---",
      "language: pt-BR",
      'category: "Sistemas"',
      'date: "1 de janeiro de 2026"',
      'publishedAt: "2026-01-01"',
      'read: "5 min"',
      'excerpt: "Resumo curto de teste"',
      /^tags:/m.test(extraFields) ? null : "tags: [teste]",
      "formatVersion: 2",
      extraFields || null,
      "---",
      "",
      `# ${slug}`,
      "",
      "> Resumo de teste",
      "",
      "![Descrição de teste](./cover.jpg)",
      "",
      body,
      "",
      "## Neste artigo",
      "",
      "- [Seção](#seção)",
      "",
      "## Seção",
      "",
      "Texto de apoio.",
      ""
    ].filter(line => line !== null).join("\n");
    await writeFile(path.join(dir, "article.md"), content, "utf8");
    return dir;
  };

  const discoveryOptions = { taxonomy };
  const rawArticleTemplate = await readFile(path.join(root, "generation", "templates", "article.md"), "utf8");
  const draftDir = path.join(temporaryRoot, "articles", "draft");
  await mkdir(draftDir, { recursive: true });
  await writeFile(path.join(draftDir, "article.md"), rawArticleTemplate);
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unresolved template placeholders/);
  await rm(draftDir, { recursive: true, force: true });

  const populatedTemplate = rawArticleTemplate
    .replace("PREENCHER: categoria editorial", "Sistemas")
    .replace("PREENCHER: data legível", "1 de janeiro de 2026")
    .replace('publishedAt: "YYYY-MM-DD"', 'publishedAt: "2026-01-01"')
    .replace("PREENCHER: tempo de leitura", "3 min")
    .replace("PREENCHER: título do artigo", "Base")
    .replace("PREENCHER: subtítulo curto do artigo", "Resumo curto")
    .replace("PREENCHER: descrição objetiva da capa", "Descrição da capa")
    .replace("PREENCHER: resumo para descoberta e busca", "Resumo de descoberta")
    .replace("PREENCHER-TAG-CANONICA", "teste")
    .replaceAll("PREENCHER: seção que explica o problema", "Primeira seção")
    .replaceAll("PREENCHER: seção de aplicação", "Segunda seção")
    .replace(/PREENCHER: [^\r\n]+/g, "Conteúdo de fixture.");
  const baseDir = path.join(temporaryRoot, "articles", "base");
  await mkdir(baseDir, { recursive: true });
  await writeFile(path.join(baseDir, "cover.jpg"), "fixture");
  await writeFile(path.join(baseDir, "article.md"), populatedTemplate);

  const todoDir = await writeSelfContainedArticle("todo-pedido", "Todo pedido recebe um identificador; preencher a variável é uma ação explícita do operador.");
  assert.ok((await discoverArticleSources(temporaryRoot, discoveryOptions)).some(source => source.slug === "todo-pedido"));
  await rm(todoDir, { recursive: true, force: true });

  const codeExampleDir = await writeSelfContainedArticle(
    "template-syntax",
    "Use `{{ user.name }}` para interpolação e este bloco:\n\n```handlebars\n{{ account.id }}\n```"
  );
  assert.ok((await discoverArticleSources(temporaryRoot, discoveryOptions)).some(source => source.slug === "template-syntax"));
  await rm(codeExampleDir, { recursive: true, force: true });

  const braceDir = await writeSelfContainedArticle("unresolved-braces", "{{ preencher o corpo }}");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unresolved template placeholders/);
  await rm(braceDir, { recursive: true, force: true });

  await mkdir(draftDir, { recursive: true });
  await writeFile(path.join(draftDir, "article.md"), populatedTemplate.replace("Conteúdo de fixture.", "PREENCHER: pendente."));
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unresolved template placeholders/);
  await writeFile(path.join(draftDir, "article.md"), populatedTemplate.replace('publishedAt: "2026-01-01"', 'publishedAt: "YYYY-MM-DD"'));
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unresolved template placeholders/);
  await rm(draftDir, { recursive: true, force: true });

  await writeSelfContainedArticle("next", "Texto seguinte.", "prerequisites: [base]");
  const markdownSources = await discoverArticleSources(temporaryRoot, discoveryOptions);
  assert.deepEqual(markdownSources.map(source => source.slug), ["base", "next"]);
  assert.equal(markdownSources[0].sourceType, "markdown");
  assert.equal(markdownSources[0].title, "Base");
  assert.deepEqual(markdownSources[0].tags, ["teste"]);

  await writeSelfContainedArticle("next", "Texto.", "prerequisites: [missing]");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unknown prerequisite slug/);
  await writeSelfContainedArticle("next", "Texto.", "prerequisites: [base]");
  await writeSelfContainedArticle("base", "Texto.", "prerequisites: [next]");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /prerequisite cycle detected/);
  await writeSelfContainedArticle("base", "Texto.", "updatedAt: 2026-02-30");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /updatedAt must be a valid date/);
  await writeSelfContainedArticle("base", "Texto.", "level: beginner");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /level must be introdutorio/);
  await writeSelfContainedArticle("base", "Texto.", "series: series-a");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /series and seriesOrder must be provided together/);
  await writeSelfContainedArticle("base", "Texto.", "tags: [unknown]");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unknown tag ID/);
  await writeSelfContainedArticle("base", "Texto.", "series: series-a\nseriesOrder: 2");
  await writeSelfContainedArticle("next", "Texto.", "series: series-a\nseriesOrder: 5");
  assert.deepEqual((await discoverArticleSources(temporaryRoot, discoveryOptions)).map(source => source.slug), ["base", "next"]);
  await writeSelfContainedArticle("next", "Texto.", "series: series-a\nseriesOrder: 2");
  await assert.rejects(() => discoverArticleSources(temporaryRoot, discoveryOptions), /unique seriesOrder values/);
  await rm(temporaryRoot, { recursive: true, force: true });

  console.log("PASS: article and cover briefs are selective, compact and reject unsafe or invalid input.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
