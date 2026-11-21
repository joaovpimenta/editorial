"""Build a temporary multi-article Editorial preview when dist/ only contains the single example article."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

EXTRA_ARTICLES = [
    ("alfa-guia", "Alfa: guia de isolamento", "alfa", "Guia estruturado sobre fronteiras e isolamento de falhas.", "2026-10-20"),
    ("beta-pratica", "Beta: padrões em produção", "beta", "Comparação prática de limites, filas e timeouts.", "2026-10-18"),
    ("gama-conceitos", "Gama: arquitetura previsível", "gama", "Conceitos fundamentais de capacidade e degradação controlada.", "2026-10-16"),
]

ROOT_FILES = [
    "site.config.json",
]


def _article_markdown(title: str, excerpt: str, published_at: str) -> str:
    return "\n".join([
        "---",
        "language: pt-BR",
        'category: "Fundamentos"',
        f'date: "{published_at}"',
        f'publishedAt: "{published_at}"',
        'read: "3 min de leitura"',
        f'excerpt: "{excerpt}"',
        "tags: [fundamentos, resiliencia]",
        "formatVersion: 2",
        "---",
        "",
        f"# {title}",
        "",
        f"> {excerpt}",
        "",
        "![Ilustração em aquarela editorial](./cover.jpg)",
        "",
        f"Em um sistema bem delimitado, {title.lower()} exemplifica como fronteiras explícitas mantêm falhas contidas.",
        "",
        "## Neste artigo",
        "",
        "- [1. Fundamento](#fundamento)",
        "- [Resumo mental](#resumo-mental)",
        "- [Perguntas de revisão](#perguntas-de-revisão)",
        "- [Exercícios](#exercícios)",
        "- [Fontes](#fontes)",
        "",
        "<a name=\"fundamento\"></a>",
        "",
        "## 1. Fundamento",
        "",
        f"Este artigo de referência complementar ilustra {title} no catálogo de teste.",
        "",
        "## Resumo mental",
        "",
        "Fronteiras explícitas reduzem propagação de falhas em cascata.",
        "",
        "## Perguntas de revisão",
        "",
        "Qual limite evita que uma sobrecarga atinja todo o sistema?",
        "",
        "## Exercícios",
        "",
        "Liste dois pontos de isolamento em um serviço web simples.",
        "",
        "## Fontes",
        "",
        "- [Fonte de referência](https://example.org)",
        "",
    ])


@contextmanager
def ensure_multi_article_dist(repo_root: Path, requested_root: Path, min_articles: int = 4):
    catalog_path = requested_root / "assets" / "articles-catalog.json"
    if catalog_path.is_file():
        articles = json.loads(catalog_path.read_text(encoding="utf-8")).get("articles", [])
        if len(articles) >= min_articles and (requested_root / "article.html").is_file():
            yield requested_root
            return

    node = os.environ.get("SITE_NODE", "node")
    with tempfile.TemporaryDirectory(prefix="editorial-multi-browser-") as tmp_dir:
        tmp = Path(tmp_dir)
        src = tmp / "source"
        dst = tmp / "dist"
        src.mkdir(parents=True, exist_ok=True)
        for filename in ROOT_FILES:
            source_file = repo_root / filename
            if source_file.exists():
                shutil.copy2(source_file, src / filename)
        shutil.copytree(repo_root / "theme", src / "theme")
        shutil.copytree(repo_root / "assets", src / "assets")
        if (src / "assets" / "articles-catalog.json").exists():
            (src / "assets" / "articles-catalog.json").unlink()
        shutil.copytree(repo_root / "articles", src / "articles")
        (src / "generation" / "taxonomy").mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo_root / "generation" / "taxonomy" / "tags.json", src / "generation" / "taxonomy" / "tags.json")
        (src / "content").mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo_root / "content" / "tts-lexicon.json", src / "content" / "tts-lexicon.json")

        example_cover = repo_root / "articles" / "introducao-ao-editorial" / "cover.jpg"
        for slug, title, _keyword, excerpt, published_at in EXTRA_ARTICLES:
            article_dir = src / "articles" / slug
            article_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(example_cover, article_dir / "cover.jpg")
            (article_dir / "article.md").write_text(
                _article_markdown(title, excerpt, published_at),
                encoding="utf-8",
            )

        artifact_url = (repo_root / "scripts" / "lib" / "site-artifact.mjs").as_uri()
        helper_url = (repo_root / "scripts" / "lib" / "markdown-site-artifact.mjs").as_uri()
        script = (
            f"Promise.all([import({json.dumps(artifact_url)}), import({json.dumps(helper_url)}), import('node:fs/promises'), import('node:path')]).then(async ([sa, m, fsp, path]) => {{"
            f"for (const file of sa.PUBLIC_ROOT_FILES) {{ if (file === 'theme.css' || file === 'site-config.js') continue; await fsp.copyFile(path.join({json.dumps(str(repo_root))}, file), path.join({json.dumps(str(src))}, file)); }}"
            f"await m.buildMarkdownPreview({{root: {json.dumps(str(src))}, sourceSha: {'a'*40!r}, destination: {json.dumps(str(dst))}}});"
            f"}});"
        )
        built = subprocess.run([node, "--input-type=module", "-e", script], cwd=repo_root, capture_output=True, text=True, encoding="utf-8")
        if built.returncode != 0:
            raise RuntimeError(f"Failed to build multi-article fixture:\n{built.stdout}\n{built.stderr}")
        yield dst
