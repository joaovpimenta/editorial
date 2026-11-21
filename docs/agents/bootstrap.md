# Bootstrap: iniciar o template para um assunto

Fluxo completo e ordenado para agentes inicializarem um novo blog a partir do Editorial.
Consulte `node scripts/init-site.mjs --help` para a lista autoritativa de opções e [DESIGN_TOKENS.md](../DESIGN_TOKENS.md) para o dicionário de tokens.

## Pré-requisitos

- `npm ci` concluído.
- Python 3.11+ com Playwright/Chromium instalado apenas para a trava visual (`snapshot-visual.py`) e para TTS (`tools/tts/`).

## Ciclo completo

1. **Inicializar identidade, taxonomia e tema.**
   Rode `node scripts/init-site.mjs --non-interactive --json --name "<Nome>" --subject "<Assunto>" --repo "owner/repo" --lang pt-BR --theme "<tema>" --tags "tag-1,tag-2"` (use `--no-keep-example` se quiser remover `articles/introducao-ao-editorial/` e criar um artigo inicial).
   **Concluído quando:** exit code 0 e a saída JSON contém `status: "ok"`, `config.name`, `config.theme`, e todos os caminhos em `filesWritten` existem.

2. **Personalizar tokens visuais (opcional).**
   Edite apenas `theme/presets/<theme>.json` usando tokens semânticos ([dicionário](../DESIGN_TOKENS.md)) e recompile com `node scripts/build-tokens.mjs`.
   **Concluído quando:** `node scripts/lint-tokens.mjs` imprime `TOKEN CONTRACT OK` com exit code 0.

3. **Gerar brief e escrever artigo (etapa externa de LLM).**
   Liste tarefas, lentes e catálogo existente com `node scripts/compose-article-brief.mjs --list`, componha o brief com `--topic`, `--task`, `--framework`, escreva o artigo em `articles/<slug>/article.md` usando `generation/templates/article.md` e siga [o contrato autoral](../../generation/editorial/AUTHORING.md).
   **Concluído quando:** `articles/<slug>/article.md` existe sem placeholders (`PREENCHER`, `YYYY-MM-DD`) e compila sem erros.

4. **Gerar capa em aquarela.**
   Extraia as diretrizes de capa com `node scripts/compose-cover-brief.mjs` e salve a imagem em `articles/<slug>/cover.jpg` seguindo `docs/VISUAL_STYLE.md`.
   **Concluído quando:** `articles/<slug>/cover.jpg` existe no disco e passa na revisão visual descrita em [VISUAL_STYLE.md](../VISUAL_STYLE.md).

5. **Validar site e fidelidade visual.**
   Rode `node scripts/validate-site.mjs` e, após mudanças visuais intencionais de tema, atualize e verifique a trava visual com `python scripts/snapshot-visual.py --capture --build` seguido de `python scripts/snapshot-visual.py --check --build`.
   **Concluído quando:** `node scripts/validate-site.mjs` sai com exit 0 e `snapshot-visual.py --check` retorna verde.

6. **Gerar áudio multilíngue (TTS) e publicar.**
   Gere preview local via `tools/tts/local_cli.py` (ou `kokoro-dora.cmd`) ou acione o workflow `kokoro-audio.yml`, e publique via push para `main` (`pages.yml`).
   **Concluído quando:** os testes Python (`python -m unittest discover -s tools/tts`) e o build de produção (`node scripts/build-site.mjs`) passam em árvore commitada.

## Onde cada regra vive

- **Identidade:** `site.config.json` → compilada para `site-config.js` (`window.SiteConfig`) e injetada em `dist/`.
- **Tema/visual:** `theme/presets/<theme>.json` → compilado para `theme.css` (`dist/theme.css`). Nunca edite `styles.css` para mudar cores, fontes ou identidade.
- **Formato e publicação:** [ARTICLE_FORMAT.md](../ARTICLE_FORMAT.md) e [PUBLISHING.md](../PUBLISHING.md).
- **TTS:** [TTS.md](../TTS.md) e [KOKORO_ACTIONS.md](../KOKORO_ACTIONS.md).
