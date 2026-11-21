window.SiteMermaid = Object.freeze({
  version: "12.0.0",
  moduleUrl: "https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.esm.min.mjs",
  config: {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      fontFamily: token("--font-sans").replace(/"/g, ""),
      fontSize: "16px",
      background: token("--color-surface-tint"),
      primaryColor: token("--mermaid-primary"),
      primaryTextColor: token("--color-accent-ink"),
      primaryBorderColor: token("--color-accent"),
      lineColor: token("--color-accent"),
      secondaryColor: token("--mermaid-secondary"),
      tertiaryColor: token("--color-border-tint-2"),
      edgeLabelBackground: token("--color-surface-tint"),
      actorBkg: token("--mermaid-primary"),
      actorBorder: token("--color-accent"),
      actorTextColor: token("--color-accent-ink"),
      noteBkgColor: token("--mermaid-secondary"),
      noteBorderColor: token("--mermaid-note-border"),
      noteTextColor: token("--mermaid-note-ink"),
      sectionBkgColor: token("--color-border-tint-2"),
      altSectionBkgColor: token("--mermaid-secondary"),
      clusterBkg: token("--mermaid-cluster"),
      clusterBorder: token("--color-accent")
    }
  }
});

// Read a design token from the theme layer; mermaid needs concrete values at
// runtime, so this resolves the custom property without touching a literal.
function token(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "";
}
