# Compilador Markdown de artigos

Módulo responsável por compilar fontes autocontidas (`articles/<slug>/article.md`) em metadados do catálogo leve e envelopes HTML (`content/articles/<slug>.html` no pacote compilado), além de gerar rotas limpas `<slug>/index.html`.

## API

```js
const compiled = await compileMarkdownArticle({
  source,
  sourcePath: "articles/exemplo/article.md",
  rootPath,
  knownTags,
  knownSlugs,
  assetExists
});
const html = renderArticleEnvelope(compiled, { buildId });
```

`compileMarkdownArticle` retorna `{ metadata, slots: { heading, dek, body }, headingAnchor }`. `renderArticleEnvelope` monta o envelope `html-v1` usado na fronteira com o cliente e com o pipeline TTS, sem duplicar conteúdo fora dos três slots.

O chamador injeta obrigatoriamente `knownTags`; `knownSlugs` e `assetExists` validam `prerequisites`, referências cruzadas e recursos locais. Caminhos são confinados ao `rootPath`; links entre artigos usam `./../outro/article.md` (ou caminho relativo equivalente) e viram `<slug>/`. No build final, `articles/<slug>/cover.jpg` e `articles/<slug>/figures/...` são publicados em `assets/<slug>/...`. URLs remotas são aceitas apenas em links `http(s):`, `mailto:` e `tel:`; imagens remotas são recusadas.

## Frontmatter e estrutura

YAML usa o schema core de YAML 1.2 (rejeita chaves duplicadas/desconhecidas, tags customizadas, aliases, anchors, merge keys e limites acima de 128 KiB, 10 mil nós ou 40 níveis). `slug`, `title`, `dek`, `image` e `alt` são derivados do caminho `articles/<slug>/article.md` e do preâmbulo (H1 + blockquote + `![alt](./cover.jpg)`), sendo proibidos no frontmatter. `tags` é obrigatório e validado contra `generation/taxonomy/tags.json`.

A primeira unidade após o preâmbulo é exatamente um `<p>` sem imagens ou componentes interativos, seguida de um sumário `## Neste artigo` cujos links locais precisam corresponder na ordem aos headings do corpo. Os prefixos `article-`, `recommendations-`, `recording-`, `speech-`, `tts-`, `header-`, `listen-`, `inline-recording-` e `search-` são reservados ao shell.

## Mermaid

O fence Mermaid aceita um comentário declarativo adjacente `<!-- site:mermaid {"label":"..."} -->` acompanhado de `<figcaption>` e `<details class="mermaid-fallback">`, ou contexto textual precedente direto no corpo. Diretivas `%%{...}%%`, comandos `click`, HTML executável e URLs `javascript:` são rejeitados.

## Tabelas, notas de rodapé e `srcset`

Tabelas GFM recebem automaticamente wrapper `.article-table-scroll` acessível. Notas de rodapé GFM preservam referências e backlinks dentro da allowlist. Atributos `srcset` validam cada candidato local contra `assets/` com descritores positivos consistentes (`w` ou `x`).

## Segurança e diagnóstico

Markdown GFM passa por `remark`, `rehype-raw`, allowlist restrita e `rehype-sanitize`, seguido de conferência de árvore contra alteração silenciosa do sanitizer e verificação estrutural com `parse5`. Nenhuma tag `<script>` ou atributo `on*` sobrevive.

Teste focado: `npm run test:markdown-article` e `npm run test:markdown-v2`.
