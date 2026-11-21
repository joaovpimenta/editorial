# TTS: arquitetura e execução

## Motor ativo

**Somente Kokoro ONNX FP32 / pf_dora** produz arquivos de áudio neste repositório.
Não há Chatterbox, clonagem de voz, hook TTS de pre-commit nem obrigação de
sintetizar áudio ao criar/editar artigos. A voz Web Speech API do navegador
é independente e permanece disponível ao visitante.

## Camadas

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Contrato editorial | `narration_text.py` | Extrair blocos HTML, idioma, léxico, soletração e texto narrável |
| Planejamento acústico | `segmentation.py` | Separar frases, orçar chunks, tratar vírgulas e palavras, preservar `block_index` e `sentence_index`, definir pausas |
| Driver | `kokoro_release.py` | Preparar G2P PT-BR/EN-US, injetar a função de orçamento (tokens/fonemas) no planejador e invocar ONNX |
| Montagem | `kokoro_release.py` (WAV/chapters) e `ffmpeg` no workflow | Concatenar PCM e pausas, obter timestamps por amostras, normalizar, publicar MP3 e capítulos v2 |

`segmentation.plan_segments(segments, measure_runs, ...)` aceita callback que
recebe runs de idioma e retorna `(token_count, phoneme_length)`. O planejador
**não importa** modelos/ONNX/fonemizadores. Em futura substituição de modelo,
implementar outro adapter sem reescrever marcação de frases e geração de
capítulos. O driver Kokoro fornece `kokoro.tokenizer.tokenize(phonemes,
limit=None)` com fonemização, mantendo o teto de 350 tokens e a guarda de
500 caracteres fonéticos. Frase curta = inferência única; frase longa =
vários chunks, mas o mesmo marcador lógico. Pausa de 25ms dentro da frase.

## Uso

O workflow [Kokoro audio](../../.github/workflows/kokoro-audio.yml) fornece
`preview` (curto), `review` (artigo integral sem Release), `compare` e
`publish`; consulte [KOKORO_ACTIONS.md](../../docs/KOKORO_ACTIONS.md).
**Não dispare nenhum modo que sintetize áudio enquanto a pausa de
gerações estiver vigente.** Atualizações em `tools/tts/` e documentação
não disparam áudio automaticamente.

## TTS local reutilizável

Em Windows, `setup-local.ps1` cria ou atualiza o ambiente em
`%LOCALAPPDATA%\Editorial\KokoroDora`, baixa
`kokoro-v1.0.onnx` e `voices-v1.0.bin` somente quando faltam, instala os pins
do workflow e verifica ONNX Runtime, CUDA, Dora, eSpeak PT-BR/EN-US e FFmpeg.
Use `-CpuOnly` em máquinas sem provider CUDA. Consulte a seção
[Local TTS (Kokoro Dora)](../../README.md#local-tts-kokoro-dora) para o tutorial
completo e os requisitos do runtime.

Depois de instalar com `-AddToPath`, o comando `kokoro-dora` funciona em outros
diretórios e projetos:

```powershell
kokoro-dora doctor --device cuda --load-model
kokoro-dora article --slug introducao-ao-editorial --device auto
kokoro-dora text --input .\roteiro.txt --lang pt-BR --device auto
```

`article` usa o HTML compilado, as marcações de idioma e o léxico do arquivo `content/tts-lexicon.json`.
`text` lê texto UTF-8 simples, divide parágrafos em linhas vazias e recebe um
idioma por arquivo (`pt-BR` ou `en-US`). Os dois comandos escrevem WAV,
capítulos v2 e métricas; por padrão também codificam MP3 mono 24 kHz, 128 kbps,
com `loudnorm=I=-19:TP=-1:LRA=11`. O diretório padrão é
`%LOCALAPPDATA%\Editorial\KokoroDora\output\`, e `--output-dir` permite escolher outro.
O preset padrão é `equilibrado`, a 1.00, com os mesmos limites de tokens,
fonemas, pausas e flags do workflow. `--device cuda` exige CUDA; `auto`
prefere CUDA e volta para CPU se o runtime ou a sessão do modelo não inicializar;
erros durante a inferência são informados. `cpu` força CPU. O pacote GPU inclui
os runtimes CUDA 12.x e cuDNN 9, sem exigir o CUDA Toolkit instalado no sistema.
Os arquivos locais não criam nem substituem GitHub Releases.

Teste rápido, sem ONNX/modelo:

```sh
python -m unittest discover -s tools/tts -p 'test_*.py'
node scripts/validate-site.mjs
```

A documentação de decisão está no [ADR 0004](../../docs/adr/0004-tts-segmentation-backend-boundary.md).
Caso seu clone ainda tenha `core.hooksPath=.githooks` configurado pelo
fluxo antigo, ele pode ser desativado com `git config --local --unset
core.hooksPath`; respeite outros hooks locais antes de alterar.
