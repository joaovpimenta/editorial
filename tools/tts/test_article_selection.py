"""Selection tests for automatic and manual Kokoro Jobs (stdlib only)."""

import json
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import article_selection


def write_html_artifact(dist: Path, source_sha: str, records: list[dict], html_templates: dict[str, str]) -> str:
    (dist / "assets").mkdir(parents=True, exist_ok=True)
    (dist / "content" / "articles").mkdir(parents=True, exist_ok=True)
    catalog_base = {"version": 1, "transport": "html-v1", "articles": records}
    files = {
        "assets/articles-catalog.json": (
            json.dumps(catalog_base, ensure_ascii=False, indent=2) + "\n"
        ).encode("utf-8"),
        "sw-version.js": b"const PRECACHE_VERSION = \"test\";\n",
    }
    empty_build_id = "0" * 64
    for slug, template in html_templates.items():
        files[f"content/articles/{slug}.html"] = template.format(buildId=empty_build_id).encode("utf-8")
    build_id = article_selection._compute_markdown_build_id(files)
    catalog = {**catalog_base, "sourceSha": source_sha, "buildId": build_id}
    (dist / "assets" / "articles-catalog.json").write_bytes(
        (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    for slug, template in html_templates.items():
        (dist / "content" / "articles" / f"{slug}.html").write_text(
            template.format(buildId=build_id), encoding="utf-8")
    (dist / "sw-version.js").write_bytes(files["sw-version.js"])
    manifest = {
        "version": 2, "format": "html-v1", "sourceSha": source_sha,
        "buildId": build_id, "files": sorted(files),
    }
    (dist / ".site-artifact.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return build_id


class ArticleSelectionTests(unittest.TestCase):
    def test_zero_shas_never_become_empty_article_baselines(self):
        zero = "0" * 40
        full = "a" * 40
        with self.assertRaisesRegex(ValueError, "zerad"):
            article_selection.added_slugs(zero, full)
        with self.assertRaisesRegex(ValueError, "zerad"):
            article_selection.added_slugs(full, zero)
        with self.assertRaisesRegex(ValueError, "zerad"):
            article_selection.spoken_changes(full, zero)

    def test_release_identity_is_exact_and_idempotent_per_build(self):
        source_sha = "a" * 40
        build_id = "b" * 64
        marker = article_selection.release_artifact_marker(source_sha, build_id)
        self.assertTrue(article_selection.release_matches_artifact(
            f"Audio e capítulos publicados.\n{marker}\n", source_sha, build_id))
        self.assertFalse(article_selection.release_matches_artifact(
            f"Audio anterior.\n{marker}\n", "c" * 40, build_id))
        self.assertFalse(article_selection.release_matches_artifact(
            f"Audio anterior.\n{marker}\n", source_sha, "d" * 64))
        with self.assertRaises(ValueError):
            article_selection.release_artifact_marker("latest", build_id)

    def test_slug_validation(self):
        with self.assertRaises(ValueError):
            article_selection.read_article("../../secrets")

    def test_manual_title_slug_or_latest(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            articles = [
                {"slug": "bulkhead", "language": "pt-BR", "title": "Bulkhead: isolar falhas",
                 "publishedAt": "2026-02-10"},
                {"slug": "four-golden-signals", "language": "pt-BR",
                 "title": "Four Golden Signals: observabilidade",
                 "publishedAt": "2026-03-10"},
                {"slug": "sre-capacidade", "language": "pt-BR",
                 "title": "SRE: Capacidade", "publishedAt": "2026-04-20"},
            ]
            with patch.object(article_selection, "catalog", return_value=articles):
                self.assertEqual(article_selection.select_manual("Bulkhead"), ["bulkhead"])
                self.assertEqual(article_selection.select_manual("four golden signals"),
                                 ["four-golden-signals"])
                self.assertEqual(article_selection.select_manual("Four Golden Signals: observabilidade"),
                                 ["four-golden-signals"])
                self.assertEqual(article_selection.select_manual(""), ["sre-capacidade"])
                self.assertEqual(article_selection.select_manual("latest"), ["sre-capacidade"])
                self.assertEqual(article_selection.select_manual("sre capacidade"), ["sre-capacidade"])
                with self.assertRaises(ValueError):
                    article_selection.select_manual("bookhead")


    def test_local_inventory_accepts_markdown_and_rejects_json_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp) / "articles"
            directory.mkdir(parents=True)
            for slug in ("bulkhead", "hedged-requests", "four-golden-signals"):
                (directory / slug).mkdir()
                (directory / slug / "article.md").write_text("---\nlanguage: pt-BR\n---\n", encoding="utf-8")
            self.assertEqual(sorted(article_selection.local_source_inventory(directory)),
                             ["bulkhead", "four-golden-signals", "hedged-requests"])
            (directory / "reintroduced.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Arquivos JSON não são permitidos"):
                article_selection.local_source_inventory(directory)
            with self.assertRaisesRegex(ValueError, "Arquivos JSON não são permitidos"):
                article_selection.read_article("reintroduced", directory, Path(temp) / "dist")

    def test_local_inventory_rejects_invalid_slugs_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp) / "articles"
            directory.mkdir(parents=True)
            (directory / "empty-folder").mkdir()
            (directory / "alpha").mkdir()
            (directory / "alpha" / "article.md").write_text("alpha", encoding="utf-8")
            self.assertEqual(article_selection.local_source_inventory(directory),
                             {"alpha": directory / "alpha" / "article.md"})
            (directory / "Invalid_Slug").mkdir()
            (directory / "Invalid_Slug" / "article.md").write_text("bad", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Nome de fonte"):
                article_selection.local_source_inventory(directory)

    def test_speech_and_mapping_signatures_ignore_links_and_detect_spoken_edits(self):
        base = {"slug": "alpha", "title": "Título", "dek": "Resumo.",
                "bodyHtml": '<p>Leia <a href="old">outra página</a>.</p>'}
        linked = {**base, "bodyHtml": '<p>Leia <a href="new">outra página</a>.</p>'}
        edited = {**base, "bodyHtml": '<p>Leia <a href="new">um artigo</a>.</p>'}
        with_toc = {**base, "bodyHtml": '<nav aria-label="Neste artigo"><h2>Neste artigo</h2><ul><li><a href="#topico">Tópico</a></li></ul></nav>' + base["bodyHtml"]}
        original = article_selection.narration_signatures(base, {})
        self.assertEqual(original, article_selection.narration_signatures(linked, {}))
        self.assertEqual(original, article_selection.narration_signatures(with_toc, {}))
        changed = article_selection.narration_signatures(edited, {})
        self.assertNotEqual(original[0], changed[0])
        self.assertEqual(original[1], changed[1])

    def test_mapping_only_impact_is_reported_without_selecting_synthesis(self):
        old, new = "a" * 40, "b" * 40
        source = {"alpha": ("articles/alpha/article.md", "c" * 40, "md")}
        changed = {"alpha": ("articles/alpha/article.md", "d" * 40, "md")}
        envelope = (
            '<article data-article-format="html-v1" data-article-slug="alpha" '
            f'data-build-id="{"0" * 64}"><h1 data-article-slot="heading">Alpha</h1>'
            '<p data-article-slot="dek">Resumo.</p>'
            '<section data-article-slot="body"><p>Texto compilado.</p></section></article>'
        )
        with patch.object(article_selection, "_git_sources", side_effect=[source, changed]), \
             patch.object(article_selection, "_blob_at", return_value="stable"), \
             patch.object(article_selection, "_current_sha", return_value=None), \
             patch("narration_text.load_lexicon", return_value={}), \
             patch.object(article_selection, "_render_markdown_sources", return_value={"alpha": envelope}), \
             patch.object(article_selection, "narration_signatures", side_effect=[("speech", "old"), ("speech", "new")]):
            report = article_selection.narration_impact(old, new)
        item = report["articles"][0]
        self.assertFalse(item["speechChanged"])
        self.assertTrue(item["mappingChanged"])
        self.assertEqual(item["reasons"], ["chapter-mapping"])
        self.assertEqual(item["chapterCompatibility"], "unverified")

    def test_pipeline_drift_blocks_even_when_sources_are_unchanged(self):
        source = {"alpha": ("articles/alpha/article.md", "c" * 40, "md")}
        with patch.object(article_selection, "_git_sources", return_value=source), \
             patch.object(article_selection, "_blob_at", side_effect=["old", "new"]):
            with self.assertRaisesRegex(ValueError, "Extrator ou léxico mudou"):
                article_selection.narration_impact("a" * 40, "b" * 40)

    def test_compatibility_gate_emits_manifest_and_rejects_each_kind_of_drift(self):
        arguments = ["article_selection.py", "--before", "a" * 40, "--after", "b" * 40,
                     "--narration-impact", "--check-compatible"]
        for speech, mapping in [(False, False), (True, False), (False, True), (True, True)]:
            with self.subTest(speech=speech, mapping=mapping):
                report = {"articles": ([{"slug": "alpha", "speechChanged": speech,
                                         "mappingChanged": mapping}] if speech or mapping else [])}
                output = io.StringIO()
                with patch.object(sys, "argv", arguments), patch("sys.stdout", output), \
                     patch.object(article_selection, "narration_impact", return_value=report):
                    if speech or mapping:
                        with self.assertRaises(SystemExit) as exit_status:
                            article_selection.main()
                        self.assertEqual(exit_status.exception.code, 1)
                    else:
                        article_selection.main()
                self.assertEqual(json.loads(output.getvalue()), report)

    def test_compatibility_gate_requires_manifest_mode(self):
        with patch.object(sys, "argv", ["article_selection.py", "--before", "a" * 40,
                                        "--after", "b" * 40, "--check-compatible"]), \
             patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as exit_status:
                article_selection.main()
            self.assertEqual(exit_status.exception.code, 2)

    def test_ambiguous_titles_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            articles = [{"slug": slug, "language": "pt-BR",
                         "title": "Four Golden Signals: " + slug,
                         "publishedAt": "2026-03-10"}
                        for slug in ("four-golden-signals-1", "four-golden-signals-2")]
            with patch.object(article_selection, "catalog", return_value=articles):
                with self.assertRaisesRegex(ValueError, "ambíguo"):
                    article_selection.select_manual("Four Golden Signals")

    def test_code_only_or_article_edits_never_select_existing_article(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()
            git("init")
            git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            directory = root / "articles" / "bulkhead"
            directory.mkdir(parents=True)
            article = directory / "article.md"
            article.write_text("# Bulkhead v1\n", encoding="utf-8")
            (root / "article.js").write_text("console.log('v1')", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "published")
            before = git("rev-parse", "HEAD")
            article.write_text("# Bulkhead v2\n", encoding="utf-8")
            (root / "article.js").write_text("console.log('v2')", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "site code and existing article only")
            after = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.added_slugs(before, after, root), [])


    def test_spoken_changes_ignore_images_and_select_only_voice_edits(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()
            git("init"); git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            taxonomy = root / "generation" / "taxonomy"
            taxonomy.mkdir(parents=True)
            (taxonomy / "tags.json").write_text(json.dumps({
                "version": 1,
                "tags": {"fundamentos": {"label": "Fundamentos", "description": "Base."}},
                "optionalMetadata": {},
            }), encoding="utf-8")

            def save(slug, body, alt="Capa inicial"):
                article_dir = root / "articles" / slug
                article_dir.mkdir(parents=True, exist_ok=True)
                (article_dir / "cover.jpg").write_bytes(b"fixture")
                (article_dir / "article.md").write_text(
                    "---\n"
                    "language: pt-BR\n"
                    "category: Fundamentos\n"
                    'date: "25 de outubro de 2026"\n'
                    'publishedAt: "2026-10-25"\n'
                    'read: "5 min"\n'
                    'excerpt: "Resumo editorial."\n'
                    "tags: [fundamentos]\n"
                    "formatVersion: 2\n"
                    "---\n\n"
                    f"# {slug}\n\n"
                    "> Explicação.\n\n"
                    f"![{alt}](./cover.jpg)\n\n"
                    f"{body}\n\n"
                    "## Neste artigo\n\n"
                    "- [Seção](#seção)\n\n"
                    "## Seção\n\n"
                    "Texto de apoio.\n",
                    encoding="utf-8",
                )

            save("bulkhead", "Banco → broker.")
            save("cqrs", "Outra frase.")
            git("add", "."); git("commit", "-m", "initial")
            one = git("rev-parse", "HEAD")
            save("bulkhead", "Banco → broker.", alt="Capa atualizada")
            git("add", "."); git("commit", "-m", "image alt only")
            two = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.spoken_changes(one, two, root), [])
            save("bulkhead", 'Banco <span data-tts-say="para o">→</span> broker.')
            git("add", "."); git("commit", "-m", "alias")
            three = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.spoken_changes(two, three, root), ["bulkhead"])
            save("bulkhead", 'Banco <span data-tts-say="para o">→</span> <span lang="en-US">broker</span>.')
            git("add", "."); git("commit", "-m", "language")
            four = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.spoken_changes(three, four, root), ["bulkhead"])
            self.assertEqual(article_selection.added_slugs(one, four, root), [])

    def test_only_added_markdown_sources_trigger_automatic_workflow(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()
            git("init")
            git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            (root / "articles" / "older").mkdir(parents=True)
            (root / "articles" / "older" / "article.md").write_text("---\nlanguage: pt-BR\n---\n", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "old")
            before = git("rev-parse", "HEAD")
            (root / "articles" / "older" / "article.md").write_text("---\nlanguage: pt-BR\n---\n\nAtualização.\n", encoding="utf-8")
            (root / "articles" / "new").mkdir(parents=True)
            (root / "articles" / "new" / "article.md").write_text("---\nlanguage: pt-BR\n---\n\nNovo artigo.\n", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "new")
            after = git("rev-parse", "HEAD")
            template = ('<article data-article-format="html-v1" data-article-slug="new" '
                        'data-build-id="{buildId}"><h1 data-article-slot="heading">New</h1>'
                        '<p data-article-slot="dek">Resumo</p>'
                        '<section data-article-slot="body"><p>Texto compilado.</p></section></article>')
            write_html_artifact(root / "dist", after, [
                {"slug": "older", "path": "content/articles/older.html", "format": "html-v1", "title": "Older"},
                {"slug": "new", "path": "content/articles/new.html", "format": "html-v1", "title": "New"},
            ], {"new": template})
            self.assertEqual(article_selection.added_slugs(before, after, root), ["new"])

    def test_compiled_markdown_is_read_from_validated_html_and_source_sha(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            article_dir = root / "articles"
            (article_dir / "alpha").mkdir(parents=True)
            (article_dir / "alpha" / "article.md").write_text("---\nlanguage: pt-BR\n---\n", encoding="utf-8")
            dist = root / "dist"
            source_sha = "a" * 40
            records = [{"slug": "alpha", "path": "content/articles/alpha.html",
                        "format": "html-v1", "title": "Alpha", "publishedAt": "2026-10-25",
                        "tags": [], "tagLabels": []}]
            envelope = ('<article data-article-format="html-v1" data-article-slug="alpha" '
                        'data-build-id="{buildId}"><h1 data-article-slot="heading">Alpha</h1>'
                        '<p data-article-slot="dek">Resumo</p>'
                        '<section data-article-slot="body"><p>Texto compilado.</p></section></article>')
            build_id = write_html_artifact(dist, source_sha, records, {"alpha": envelope})
            rendered = envelope.format(buildId=build_id)
            with self.assertRaisesRegex(ValueError, "Fonte Markdown sem HTML"):
                article_selection.read_article("alpha", article_dir, root / "empty-dist")
            article = article_selection.read_article("alpha", article_dir, dist, source_sha)
            self.assertEqual(article["html"], rendered)
            self.assertEqual(article["title"], "Alpha")
            self.assertEqual(article_selection.validate_artifact_identity(
                source_sha, build_id, article_dir, dist),
                {"sourceSha": source_sha, "buildId": build_id, "articles": 1})
            with self.assertRaisesRegex(ValueError, "buildId"):
                article_selection.validate_artifact_identity(source_sha, "c" * 64, article_dir, dist)
            with self.assertRaisesRegex(ValueError, "source SHA"):
                article_selection.read_article("alpha", article_dir, dist, "c" * 40)
            (dist / "content" / "articles" / "alpha.html").write_text(
                rendered.replace("Texto compilado.", "Texto alterado."), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "conteúdo do artefato"):
                article_selection.validate_artifact_identity(source_sha, build_id, article_dir, dist)

    def test_markdown_addition_requires_html_for_the_same_validated_revision(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()
            git("init")
            git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            article_dir = root / "articles"
            (article_dir / "older").mkdir(parents=True)
            (article_dir / "older" / "article.md").write_text("---\nlanguage: pt-BR\n---\n", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "initial")
            before = git("rev-parse", "HEAD")
            (article_dir / "new").mkdir(parents=True)
            (article_dir / "new" / "article.md").write_text("---\nlanguage: pt-BR\n---\n", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "add markdown")
            after = git("rev-parse", "HEAD")
            with self.assertRaisesRegex(ValueError, "HTML compilado"):
                article_selection.added_slugs(before, after, root)
            dist = root / "dist"
            (dist / "assets").mkdir(parents=True)
            (dist / "content" / "articles").mkdir(parents=True)
            build_id = "d" * 64
            (dist / "assets" / "articles-catalog.json").write_text(json.dumps({
                "version": 1, "transport": "html-v1", "sourceSha": after, "buildId": build_id,
                "articles": [
                    {"slug": "older", "path": "content/articles/older.html",
                     "format": "html-v1", "title": "Older"},
                    {"slug": "new", "path": "content/articles/new.html",
                     "format": "html-v1", "title": "New", "publishedAt": "2026-10-25"},
                ],
            }), encoding="utf-8")
            (dist / "content" / "articles" / "new.html").write_text(
                '<article data-article-format="html-v1" data-article-slug="new" '
                f'data-build-id="{build_id}"><h1 data-article-slot="heading">New</h1>'
                '<p data-article-slot="dek">Resumo</p>'
                '<section data-article-slot="body"><p>Texto compilado.</p></section></article>',
                encoding="utf-8",
            )
            self.assertEqual(article_selection.added_slugs(before, after, root), ["new"])

    def test_spoken_changes_ignore_metadata_only_edits_and_detect_prose_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()
            git("init")
            git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            taxonomy = root / "generation" / "taxonomy"
            taxonomy.mkdir(parents=True)
            (taxonomy / "tags.json").write_text(json.dumps({
                "version": 1,
                "tags": {"fundamentos": {"label": "Fundamentos", "description": "Base."}},
                "optionalMetadata": {},
            }), encoding="utf-8")
            article_dir = root / "articles" / "alpha"
            article_dir.mkdir(parents=True)
            (article_dir / "cover.jpg").write_bytes(b"fixture")
            spoken = "Uma margem clara permite recuperar o serviço sem sobrecarregar o broker."

            def save_markdown(body, read_time="5 min"):
                (article_dir / "article.md").write_text(
                    "---\n"
                    "language: pt-BR\n"
                    "category: Fundamentos\n"
                    'date: "25 de outubro de 2026"\n'
                    'publishedAt: "2026-10-25"\n'
                    f'read: "{read_time}"\n'
                    'excerpt: "Resumo editorial."\n'
                    "tags: [fundamentos]\n"
                    "formatVersion: 2\n"
                    "---\n\n"
                    "# Uma fila segura\n\n"
                    "> Uma explicação clara.\n\n"
                    "![Uma capa simples](./cover.jpg)\n\n"
                    f"{body}\n\n"
                    "## Neste artigo\n\n"
                    "- [Seção](#seção)\n\n"
                    "## Seção\n\n"
                    "Texto complementar.\n",
                    encoding="utf-8",
                )

            save_markdown(spoken, read_time="5 min")
            git("add", ".")
            git("commit", "-m", "initial article")
            before = git("rev-parse", "HEAD")

            save_markdown(spoken, read_time="6 min")
            git("add", "-A")
            git("commit", "-m", "metadata read time only")
            metadata_only = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.spoken_changes(before, metadata_only, root), [])

            save_markdown(spoken.replace("margem clara", "janela de recuperação"), read_time="6 min")
            git("add", "-A")
            git("commit", "-m", "edit spoken copy")
            edited = git("rev-parse", "HEAD")
            self.assertEqual(article_selection.spoken_changes(metadata_only, edited, root), ["alpha"])


if __name__ == "__main__":
    unittest.main()
