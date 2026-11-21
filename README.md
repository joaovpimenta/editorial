# Editorial

Template **white-label** de blog/arquivo de artigos: site estático (GitHub
Pages + PWA instalável), autoragem em Markdown, **TTS multilíngue** (PT-BR /
EN-US via Kokoro `pf_dora`) e identidade visual em **design tokens semânticos**.

Estrutura, layout e funcionalidades são genéricos. Identidade, tema, animações
e comportamento vivem num **único ponto de configuração** (`site.config.json` +
`theme/presets/<theme>.json`); começar um site novo não exige tocar no código
estrutural.

## Começar um site novo (bootstrap)

```bash
npm ci
node scripts/init-site.mjs --non-interactive --json --name "Meu Blog" --subject "Culinária" --tags "receitas,tecnicas" --repo "owner/meu-blog"
```

O processo orientado a agentes (passos e critérios de conclusão) está em
[docs/agents/bootstrap.md](docs/agents/bootstrap.md).

## Estrutura

| Caminho | Papel |
|---|---|
| `site.config.json` | Identidade (nome, assunto, idioma, repositório, tema) |
| `theme/presets/<theme>.json` → `theme.css` | Design tokens semânticos (skin) |
| `styles.css`, `*.js`, `index.html`, `article.html` | Engine e componentes (consomem tokens) |
| `articles/<slug>/article.md` + `cover.jpg` | Fonte autocontida de cada artigo |
| `content/tts-lexicon.json` | Léxico de pronúncia do TTS |
| `generation/` | Contrato de escrita e registry de tasks/frameworks |
| `tools/tts/` | Pipeline de síntese Kokoro (extração, segmentação, driver) |
| `scripts/` | Build, validação, lint e bootstrap |

## Desenvolvimento

```bash
node scripts/validate-site.mjs          # validação + preview temporário
node scripts/build-site.mjs             # pacote de produção em dist/
python scripts/snapshot-visual.py --check --build   # trava de fidelidade visual
```

## Design tokens (white-label)

O visual é descrito por tokens **semânticos** (`--color-accent`, `--font-serif`,
`--motion-duration-base`, `--z-header`, …) — nunca por valores literais.
Consulte [o dicionário](docs/DESIGN_TOKENS.md) e o contrato
(`node scripts/lint-tokens.mjs`). Para trocar a identidade, edite só o preset e
recompile; a fidelidade é provada pela trava visual.

## TTS multilíngue

`pf_dora` narra em PT-BR e alterna para EN-US em spans `lang="en-US"`; o léxico
cobre siglas e pronúncias especiais. Preview local:

```powershell
.\tools\tts\setup-local.ps1 -AddToPath
kokoro-dora article --slug introducao-ao-editorial --device auto
```

Publicação de áudio via workflow `kokoro-audio.yml` (preview/review/publish),
governada por [docs/KOKORO_ACTIONS.md](docs/KOKORO_ACTIONS.md).

## Trava de fidelidade visual

`tests/visual/baseline/` guarda o estado renderizado (estilos computados, DOM,
screenshots). `scripts/snapshot-visual.py --check` prova que uma refatoração de
tema não alterou nada; re-grave o baseline somente após revisão explícita. Veja
[tests/visual/README.md](tests/visual/README.md).

## Publicação (GitHub Pages)

1. Crie um repositório e envie o `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. A workflow `pages.yml` valida e publica em pushes relevantes.
