# Editorial

Vocabulário do fluxo editorial deste template.

## Linguagem

**Artigo:** publicação editorial que explica um tema por um recorte definido.

**Pauta:** proposta de tema e recorte, com intenção de escrita e lentes.

**Brief de artigo:** contrato de escrita composto para uma pauta, com uma task
e as lentes selecionadas. O compositor só monta instruções; a escrita é etapa
externa (não há provedor/LLM/orquestração automática neste repositório).

**Identidade do site:** `site.config.json` (nome, assunto, idioma, repositório,
tema). É a fonte única, injetada como `window.SiteConfig` no build.

**Tema (skin):** preset de design tokens em `theme/presets/<theme>.json`,
compilado para `theme.css`. Componentes consomem somente tokens
semânticos; o código estrutural não é tocado ao trocar o tema.

## Vocabulário de narração pública (TTS)

**Áudio publicado:** MP3 Kokoro disponibilizado como asset de uma Release
`tts-<slug>`. Diferente da voz do dispositivo (Web Speech API).

**Voz:** `pf_dora` (PT-BR) lê também spans EN-US após fonemização bilíngue.

**Parágrafo editorial (bloco):** contêiner estável do HTML identificado por
`block_index`; a navegação ocorre por **frases** (`sentence_index`) com
timestamp real.

**Chunk de síntese:** divisão independente em `tools/tts/segmentation.py`;
uma frase por inferência quando couber nos limites fonéticos.

**Léxico:** `content/tts-lexicon.json` — pronúncias editoriais com precedência
sobre soletração automática; a grafia visível nunca é substituída.

**Trava de fidelidade:** `tests/visual/baseline/` + `scripts/snapshot-visual.py`
— compara estilos computados, DOM e screenshots do site renderizado contra a
referência imutável, a cada refatoração.
