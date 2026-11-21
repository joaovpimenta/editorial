# Editorial — template de blog

Template white-label de arquivo de artigos: site estático (GitHub Pages + PWA),
autoragem em Markdown, TTS multilíngue (PT-BR/EN-US) e identidade visual em
design tokens semânticos.

## Início

Rode `node scripts/doctor.mjs --json` para diagnóstico e comandos. Para
**iniciar o template para um assunto**, siga [o bootstrap](docs/agents/bootstrap.md).
Para manutenção, leia somente o ramo pertinente:

- **Identidade:** `site.config.json` é o ponto único → injetado como
  `window.SiteConfig`. Nome, assunto, idioma, repositório e tema vivem ali.
- **Tema/visual:** [dicionário de tokens](docs/DESIGN_TOKENS.md). Edite só
  `theme/presets/<theme>.json` e recompile com `scripts/build-tokens.mjs`.
- **Artigo:** [contrato autoral](generation/editorial/AUTHORING.md) e
  [formato](docs/ARTICLE_FORMAT.md). Fonte autocontida `articles/<slug>/article.md`
  + capa `cover.jpg` co-localizada.
- **Escopo editorial:** [EDITORIAL.md](docs/EDITORIAL.md) (substitua pelo seu assunto).
- **Publicação:** [PUBLISHING.md](docs/PUBLISHING.md). `scripts/validate-site.mjs`
  é o comando único.
- **TTS:** [TTS.md](docs/TTS.md), [KOKORO_ACTIONS.md](docs/KOKORO_ACTIONS.md) e
  [ADR 0004](docs/adr/0004-tts-segmentation-backend-boundary.md).
- **Fidelidade visual:** `python scripts/snapshot-visual.py --check --build`
  compara contra `tests/visual/baseline/`; re-baseline só com mudança revisada.

## Princípios

- Uma única fonte Markdown por slug, em `articles/<slug>/`.
- Não substitua, remova nem edite artigos existentes ao criar um novo, salvo
  instrução explícita.
- Mantenha o estilo de escrita, a skin (aquarela editorial) e a marcação TTS
  documentadas. Diagramas são Mermaid; capas e ilustrações conceituais são JPG
  em aquarela visível (nunca SVG/vetor flat).
- Não declare recursos, arquivos ou interações que não existam.
- Não altere a engine, o build ou o carregador compartilhado para acomodar um
  artigo, salvo instrução explícita.

## Execução

Componha o brief com `node scripts/compose-article-brief.mjs --list`, escreva o
Markdown com `generation/templates/article.md`, gere a capa com
`node scripts/compose-cover-brief.mjs` e valide com
`node scripts/validate-site.mjs` antes de publicar. A síntese de MP3 usa somente
Kokoro (`pf_dora`, PT-BR/EN-US); nenhuma síntese é iniciada por PR/CI.

## Validação

`scripts/lint-articles.mjs`, `scripts/lint-tokens.mjs` e `scripts/validate-site.mjs`
são os gates determinísticos. Rigor factual, qualidade da metáfora, aparência de
aquarela e qualidade da voz seguem exigindo revisão humana/auditiva.
