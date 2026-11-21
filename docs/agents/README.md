# Navegação operacional

## Início

Execute `node scripts/doctor.mjs --json` para obter pré-requisitos, diagnósticos e comandos disponíveis. `.node-version` declara a versão usada na CI; Node mais novo é diagnosticado como aviso de reprodutibilidade. Python é opcional para tarefas do site; a CI instala a versão de `.python-version` para exigir os testes rápidos do TTS.

Leia somente o ramo que corresponde à tarefa:

- **Bootstrap (iniciar site novo):** [bootstrap.md](bootstrap.md) e `node scripts/init-site.mjs --help`.
- **Identidade e tokens:** `site.config.json` e [DESIGN_TOKENS.md](../DESIGN_TOKENS.md).
- **Artigo:** fluxo editorial de `AGENTS.md`, [ARTICLE_FORMAT.md](../ARTICLE_FORMAT.md) e [contrato autoral](../../generation/editorial/AUTHORING.md). Artigo novo usa fonte autocontida `articles/<slug>/article.md` com `./cover.jpg`. O compositor fornece apenas um brief e não chama LLM nem escreve artigo: o modelo/redator é uma etapa externa.
- **Build, workflows ou publicação:** [PUBLISHING.md](../PUBLISHING.md). `scripts/validate-site.mjs` valida e constrói um preview temporário; `scripts/build-site.mjs` produz o pacote de produção em `dist/` a partir dos inputs editoriais do commit.
- **Planejador de áudio independente de engine:** [tools/tts/README.md](../../tools/tts/README.md) e [ADR 0004](../adr/0004-tts-segmentation-backend-boundary.md); a pronúncia da voz do dispositivo continua em [TTS.md](../TTS.md).
- **Narração pública Kokoro/Actions:** [KOKORO_ACTIONS.md](../KOKORO_ACTIONS.md); decisões em [ADR 0001](../adr/0001-kokoro-dora-prosody-and-encoding.md), [ADR 0002](../adr/0002-kokoro-execution-cost-and-parallelism.md) e [ADR 0003](../adr/0003-unified-article-audio-and-chapter-synchronization.md).
- **Trava de fidelidade visual:** [tests/visual/README.md](../../tests/visual/README.md).

## Mapa de mudanças

- `articles/<slug>/`: fonte autocontida (`article.md` + `./cover.jpg` + `figures/` opcionais).
- `theme/presets/<theme>.json` → `theme.css`: camada única de design tokens semânticos.
- `generation/`: contratos compactos de escrita, taxonomia e registry allowlisted.
- `scripts/lib/`: regras compartilhadas de configuração, contratos, geração e empacotamento.
- `scripts/`: entrypoints e suites determinísticas; `validate-site.mjs` coordena os gates usados localmente e na CI.
- `.github/workflows/`: validação (`validate.yml`), Pages (`pages.yml`) e TTS (`kokoro-audio.yml`).
- `tools/tts/`: extração HTML/léxico, planejamento de frases e driver Kokoro.
- Arquivos HTML/CSS/JS na raiz: shell, PWA, busca, player e estilo estrutural orientado a tokens.

## Verificação e entrega

Preserve alterações locais anteriores. Rode `node scripts/validate-site.mjs` após integrar mudanças. Ele valida tokens, contratos, compilação HTML e gera um preview temporário; a CI produz `dist/` com `node scripts/build-site.mjs` antes do deploy. Rigor factual, metáfora, aparência de aquarela e qualidade da voz continuam exigindo revisão humana/auditiva.
