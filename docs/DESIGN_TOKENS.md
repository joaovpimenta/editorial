# Dicionário de design tokens

O visual do template é descrito por um sistema de tokens **semânticos** centralizado. Componentes (`styles.css`, `mermaid-theme.js`, `pwa.js`) consomem somente `var(--token)`; valores literais de cor, fonte ou duração de animação não entram em regras de componente.

## Ponto único de tema

- **Fonte de verdade:** `theme/presets/<theme>.json` (editável, machine-readable).
- **Seleção do tema ativo:** `site.config.json` → `"theme"`.
- **Saída compilada:** `theme.css` (`:root { ... }`), gerada por `node scripts/build-tokens.mjs` (e compilada diretamente para `dist/theme.css` durante o build).
- **Metadados de HTML no preset:** `themeColor` alimenta `<meta name="theme-color">` e `manifest.webmanifest`; `fontsUrl` alimenta o `<link rel="stylesheet">` de fontes no `<head>` (vazio = usa fontes locais/sistema).
- **Contrato automático:** `node scripts/lint-tokens.mjs` falha fechado se `site.config.json` ou o preset estiverem ausentes/inválidos, se houver cor/fonte/duração literal nos componentes, se algum nome de token contiver palavra literal de cor, ou se algum token ficar sem uso.

## Nomenclatura (função do elemento, nunca valor literal)

- `--color-*`:
  - Texto e superfície base: `ink`, `muted`, `ink-faint`, `paper`, `soft`, `line`.
  - Marca e destaque: `accent`, `on-accent`, `accent-deep`, `accent-hover`, `accent-ink`, `accent-wash`, `accent-word`, `accent-glow`, `accent-track`, `accent-outline`.
  - Superfícies e bordas semânticas: `surface-muted`, `surface-subtle`, `surface-tint`, `surface-accent-subtle`, `code-bg`, `code-ink`, `border-strong`, `border-tint`, `border-tint-2`, `border-soft`, `border-soft-2`.
  - Estado, erro e modais: `danger`, `danger-accent`, `danger-wash`, `notice-bg`, `notice-ink`, `notice-border`, `overlay`.
  - Elevação e foco: `shadow-soft`, `shadow-dock`, `shadow-panel`, `shadow-float`, `shadow-strong`, `shadow-pop`, `shadow-speech`, `focus-ring`, `focus-ring-strong`, `glow-soft`, `glow-strong`, `glow-strong-2`.
- `--font-*`: `sans` (UI), `serif` (prosa editorial), `mono` (código).
- `--motion-*`: `duration-fast`, `duration-base`, `duration-slow`, `ease`, `ease-out` (respeita `@media (prefers-reduced-motion: reduce)`).
- `--mermaid-*`: paleta do tema Mermaid (`primary`, `secondary`, `note-border`, `note-ink`, `cluster`).
- `--z-*`: camadas (`base`, `dropdown`, `header`, `player`, `dock`, `skip`, `quick`, `suggestions`, `modal`).
- `--layout-*`: medidas estruturais de container (`page-max`, `page-max-wide`, `shell`, `measure`).

Raios, espaçamentos internos e escala estrutural de layout permanecem estruturais para manter a arquitetura intacta. Para trocar toda a identidade visual de um novo site, edite apenas `theme/presets/<theme>.json` e recompile sem tocar em `styles.css` nem no JavaScript.

## Fidelidade visual

`python scripts/snapshot-visual.py --check --build` compara estilos computados, DOM e screenshots contra `tests/visual/baseline/`. Qualquer desvio é bloqueado por exit code diferente de zero.
