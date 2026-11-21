# ADR 0004 — Segmentar áudio independentemente do motor TTS

- **Data:** 2026-10-23
- **Estado:** Aceito
- **Contexto:** A adoção de frases como unidades de navegação e destaque exigiu desacoplar o planejamento acústico do backend de síntese, eliminando dependências do antigo hook de pré-commit.

## Decisão

1. **Somente Kokoro é implementado como backend de geração de áudio.** Não há sintetizador ou hook TTS no pré-commit exigindo síntese local, PyTorch ou torchaudio.
2. **Extrair a preparação editorial** para `tools/tts/narration_text.py`: HTML narrável, precedência de léxico e tags multilíngues, soletração e texto sem modelo.
3. **Extrair o planejamento** para `tools/tts/segmentation.py` com funções puras e callback de capacidade `measure_runs(runs) -> (token_count, phoneme_length)`. Não importar ONNX, Kokoro, eSpeak ou voz nesse módulo.
4. **Criar adapter Kokoro** em `tools/tts/kokoro_release.py`: aplicar G2P, contar tokens reais com `tokenize(..., limit=None)` e informar as medidas ao planejador. O backend recebe segmentos prontos e sintetiza cada chunk na ordem.
5. **Manter assembly e sincronização independentes dos cortes técnicos**: timestamps vêm da concatenação WAV e das pausas reais. Frase inteira é identificada por `(block_index,sentence_index)`, mesmo quando requer vários chunks; vírgulas não geram navegação. Saída `chapters.json version=2`.
6. **Preparar a troca futura de modelo** sem implantar outro hoje: novo backend deve adaptar somente medição/capacidade, phonemização, invocação e características de saída. Não duplicar gramática de sentenças e semântica editorial.
7. **Web Speech API fica preservada** como voz do dispositivo, não é backend de geração/publicação de MP3.
8. **Pausa inicial e retomada seletiva:** esta refatoracao nao gerou audio. Em 30/10/2026, o mantenedor autorizou reativar somente o refresh de artigos existentes cuja fala mudou, apos deploy Pages e diff narravel. Jobs manuais, backfill, comparacoes e sintese automatica de artigo novo seguem bloqueados. Ver ADR 0002 e KOKORO_ACTIONS.md.

## Contrato e testes

- Entradas de planejamento: blocos editoriais com `runs=[{text, lang}]`, `block_index` e pausa de fim de bloco.
- Saídas: sequência estável de runs e texto, `sentence_index`/ `sentence_start`, limites de capacidade, `pause_after_seconds`, `split_reason`. Não descartar conteúdo nem cortar palavras.
- O sintetizador **não decide** onde a frase termina; apenas declara seu orçamento e produz PCM.
- Testar extração, léxico e segmentação com `unittest` usando fakes, **sem executar inferência**. O teste de integração áudio é opcional e manual.
- O par `(block_index,sentence_index)` deve permanecer estável entre partes da mesma frase; relógio é medido pelas amostras geradas, não por estimativas de caracteres.

## Consequências

- Menos dependências locais e nenhum pré-commit que sintetize áudio.
- O custo/complexidade de testar a segmentação fica separado do driver real.
- Mudança futura de motor exige um adapter compatível com o contrato, não mudanças no HTML/editorial ou player.
- A migração não altera Releases nem regenera arquivos automaticamente; arquivos já publicados mantêm sua versão até publicação autorizada.

## Referências

[ADR 0001](0001-kokoro-dora-prosody-and-encoding.md) e [ADR 0003](0003-unified-article-audio-and-chapter-synchronization.md).

## Operacao temporaria: retomada seletiva (30/10/2026)

A geracao foi integrada inicialmente pausada. Com autorizacao explicita do
mantenedor em 30/10/2026, o gate global foi removido somente do caminho de
refresh de artigos existentes com mudanca narravel, apos deploy e com backup.
A matriz antiga #39883809928 nao foi alterada. Isso nao autoriza reruns
antigos, backfill, publicacao de artigos novos ou dispatch manual.

## Robustez: pontuação sem representação fonética (23/10/2026)

Separadores isolados sem letras/dígitos, como `/`, podem retornar IPA vazia
no eSpeak entre runs com idiomas distintos. O adapter ignora somente esse
separador na cadeia fonética, preservando o texto editorial e o identificador
da frase. Runs contendo letras/dígitos cuja fonemização seja vazia **continuam
falhando**. A regra de divisão e os limites de tokens do planejador não mudam.
Essa política impede que pontuação silenciosa interrompa uma síntese inteira.
Nenhuma geração foi iniciada para aplicar a correção.

## Exceção editorial aprovada (23/10/2026)

O congelamento permanece para modos manuais, backfill, comparações e artigos
novos. Após deploy Pages de modificação no JSON de artigo **existente**,
é permitido renovar somente slugs cujo contrato narrável efetivamente mudou
(texto, idioma, `data-tts-say`, pausas). A assinatura de fala é calculada
sem inferência. Cada artigo gera job específico com backup e substituição
pareada do MP3 e capítulos v2.
