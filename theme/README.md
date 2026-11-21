# Temas e Design Tokens

Este diretório concentra a pele visual (**skin**) do template em um único ponto editável.

## Como funciona

- `presets/<theme>.json`: fonte de verdade de um tema (cores semânticas, fontes, parâmetros de movimento, paleta Mermaid, camadas `z-index` e medidas de layout).
- `site.config.json` → `"theme"`: seleciona qual arquivo `theme/presets/<theme>.json` está ativo.
- `node scripts/build-tokens.mjs`: compila o preset ativo para `theme.css` (ou `dist/theme.css` no build de produção).
- `node scripts/lint-tokens.mjs`: valida o contrato white-label (nenhum literal de identidade nos componentes e todos os tokens consumidos).

Consulte o dicionário completo em [../docs/DESIGN_TOKENS.md](../docs/DESIGN_TOKENS.md).
