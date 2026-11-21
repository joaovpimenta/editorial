# Trava de segurança visual (baseline + comparador)

Este diretório guarda a **referência imutável** do site renderizado. O comparador
`scripts/snapshot-visual.py` prova, a cada etapa de refatoração ou alteração de
tokens, que o resultado continua **100% fiel** ao baseline.

## O que o comparador mede

1. **Estilos computados + custom properties** — `getComputedStyle` sobre um
   inventário fixo de elementos (`inventory.json`) × viewports (`desktop`
   1440×900, `tablet` 820×1000, `mobile` 390×844) × propriedades pinadas (cores,
   fundos, bordas, raios, fontes, espaçamentos, alinhamentos, sombras,
   `transition-*`/`animation-*`) + todas as custom properties de `:root` e
   `body`, com digests SHA-256 por elemento. Geometria dependente de layout de
   texto (`width`, `height`, `transform`, `grid-template-*`) é excluída.
2. **Estrutura do DOM** — assinatura canônica do `body` (tags/ids/classes/
   atributos), sem texto e com listas dinâmicas colapsadas (`#recent-list`,
   `#recommendations-list`). Comparação exata.
3. **Screenshots full-page** — PNGs por página×viewport com diff de pixels dentro
   da tolerância de antialiasing (ou `--styles-and-dom-only` em CI cross-OS).

## Uso

```powershell
# (re)gravar o baseline — somente quando a mudança visual for intencional e revisada
python scripts/snapshot-visual.py --capture --build

# verificar (gate de fidelidade; sai com código != 0 em qualquer desvio)
python scripts/snapshot-visual.py --check --build

# sobre um build já existente (ex.: dist/)
python scripts/snapshot-visual.py --check --root dist
python scripts/snapshot-visual.py --check --root dist --styles-and-dom-only
```

## Determinismo

- `Math.random` é substituído por um LCG com semente fixa (recomendações no artigo).
- O módulo Mermaid é roteado para um renderer determinístico (sem `Date.now()` nem CDN).
- `api.github.com` é abortado; Service Workers bloqueados; scrollbars ocultas;
  animações pausadas em `t = 0`; `reduced_motion = "reduce"`,
  `forced_colors = "none"`, `color_scheme = "light"`, `device_scale_factor = 1`.

## Aviso

Screenshots PNG podem variar entre sistemas operacionais (métricas de fonte do
rasterizador local). Em CI cross-OS use `--styles-and-dom-only` quando o baseline
tiver sido gravado em outro SO; localmente use o modo completo.
