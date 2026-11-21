# Build, validação e publicação

## Preparação do artigo

Antes de escrever, consulte os módulos e o catálogo compacto dos temas publicados:

```sh
node scripts/compose-article-brief.mjs --list
```

Componha somente a task e os frameworks aplicáveis ao tema. O brief é emitido em stdout e não deve ser versionado:

```sh
node scripts/compose-article-brief.mjs \
  --topic "Seu tópico" \
  --task explain-concept \
  --framework fundamentals \
  --framework tradeoffs-and-risks \
  --depth advanced
```

O compositor bloqueia IDs desconhecidos, excesso de frameworks, paths fora da allowlist e duplicatas exatas de slug ou título. Leia artigos completos somente nos casos de possível sobreposição; a verificação semântica continua sendo uma decisão editorial.

Depois de escrever o primeiro parágrafo, use `node scripts/compose-cover-brief.mjs` para consultar as instruções de capa extraídas de `docs/VISUAL_STYLE.md`. Salve a capa em `articles/<slug>/cover.jpg` e revise visualmente a aquarela antes de publicar.

## Comando único de validação

Depois de adicionar o artigo e seus assets, execute:

```sh
node scripts/validate-site.mjs
```

Esse comando executa a compilação de tokens, o lint de tokens semânticos (`lint-tokens.mjs`), o lint editorial determinístico (`lint-articles.mjs`), verificações de sintaxe, testes unitários, validação do registry de geração, testes de inicialização (`init-site.mjs`), verificação de marca neutra no artefato (`test-dist-debrand.mjs`) e a construção de um preview HTML temporário.

Para gerar o pacote de produção em `dist/`:

```sh
node scripts/build-site.mjs
```

O build de produção exige que `site.config.json`, o preset ativo em `theme/presets/`, `generation/taxonomy/tags.json`, `content/tts-lexicon.json` e `articles/` estejam commitados e correspondam ao `sourceSha` atual, além de histórico Git completo para recuperar `addedAt`. Para inspecionar fontes ainda não commitadas, use `node scripts/build-markdown-preview.mjs --output-dir <novo-diretório-em-tmp>`. Variáveis opcionais de ambiente: `SITE_PYTHON`, `SITE_PLAYWRIGHT`, `SITE_CHROMIUM`, `SITE_UI_SCREENSHOTS` e `SITE_REQUIRE_TTS_TESTS`.

## Trava visual e suítes de navegador

Para auditar a fidelidade de estilos, DOM e screenshots com a trava de segurança visual:

```sh
python scripts/snapshot-visual.py --check --build
```

Para auditar geometria e interações em Chromium real (após gerar `dist/` ou usar preview):

- `python scripts/test-ui-browser.py`
- `python scripts/test-markdown-preview-browser.py`
- `python scripts/test-html-site-browser.py`
- `python scripts/test-recommendations-browser.py`
- `node scripts/test-speech-browser.cjs`

Sem Playwright instalado localmente, testes de navegador Node reportam explícita e claramente quando são pulados; a CI exige todas as suítes em Ubuntu.

## Publicação

1. Confirme identidade em `site.config.json` (incluindo `"repo": "owner/repo"` quando desejar exibir estrelas do GitHub e buscar Releases de áudio).
2. Rode `node scripts/validate-site.mjs` e `python scripts/snapshot-visual.py --check --build`.
3. Faça push para a branch `main`.
4. No GitHub: **Settings → Pages → Source: GitHub Actions**.

A workflow `.github/workflows/pages.yml` valida o repositório, gera `dist/` no mesmo commit SHA validado e envia o artefato para o GitHub Pages.
