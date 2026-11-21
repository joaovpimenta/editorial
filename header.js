(() => {
  "use strict";
  const starCount = document.querySelector("#github-stars");
  if (!starCount) return;
  const key = "site:github-stars:v1";
  const siteLang = (window.SiteConfig && window.SiteConfig.lang) || "pt-BR";
  const render = stars => {
    starCount.textContent = new Intl.NumberFormat(siteLang, { notation: "compact" }).format(stars);
  };
  async function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && Number.isInteger(saved.stars) && saved.stars >= 0) {
        render(saved.stars);
        if (Date.now() - saved.updated < 6 * 60 * 60 * 1000) return;
      }
    } catch (_) { /* Private browsing: load live stars when possible. */ }
    try {
      const repo = (window.SiteConfig && typeof window.SiteConfig.repo === "string" && window.SiteConfig.repo) || "";
      if (!repo) return;
      const link = document.querySelector(".github-stars");
      if (link) {
        link.href = `https://github.com/${repo}`;
        link.hidden = false;
      }
      const response = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Number.isInteger(data.stargazers_count)) return;
      render(data.stargazers_count);
      try { localStorage.setItem(key, JSON.stringify({ stars: data.stargazers_count, updated: Date.now() })); }
      catch (_) { /* Storage is optional. */ }
    } catch (_) { /* Never block navigation or reading. */ }
  }
  void load();
})();
