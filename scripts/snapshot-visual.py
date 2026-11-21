"""Visual fidelity safety lock for the Editorial template.

Captures the rendered site (computed styles over a fixed element inventory,
custom properties on :root and body, a canonical DOM signature, and full-page
screenshots) and compares it against a committed immutable baseline.

Modes:
  python scripts/snapshot-visual.py --capture --root <site-dir>
  python scripts/snapshot-visual.py --check    --root <site-dir>
  python scripts/snapshot-visual.py --capture --build
  python scripts/snapshot-visual.py --check    --build
  python scripts/snapshot-visual.py --check    --root dist --styles-and-dom-only

Exit code is non-zero when --check finds any deviation.
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import struct
import subprocess
import sys
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve()
REPO_ROOT = HERE.parent.parent
INVENTORY_PATH = REPO_ROOT / "tests" / "visual" / "inventory.json"
DEFAULT_BASELINE_DIR = REPO_ROOT / "tests" / "visual" / "baseline"

# Containers whose children are dynamic (rendered from the catalog); the DOM
# signature records the container itself but not its descendants.
DYNAMIC_CONTAINERS = ("#recent-list", "#recommendations-list")

# The article page samples recommendations with Math.random; a deterministic LCG
# makes the rendered page reproducible so capture and check agree byte-for-byte.
DETERMINISTIC_RANDOM_INIT = (
    "Math.random = (() => { let s = 1; "
    "return () => (s = (s * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff; })();"
)

# Deterministic scrollbar suppression without altering component styles.
SCROLLBAR_HIDE_CSS = (
    "::-webkit-scrollbar{display:none!important}"
    "*{scrollbar-width:none!important}"
)

MERMAID_RENDERER = (
    "export default { initialize() {}, async render(id) { return {svg:"
    "`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" viewBox=\"0 0 1000 400\" role=\"img\">"
    "<rect width=\"1000\" height=\"400\" fill=\"#d8eadf\" stroke=\"#277d69\"/>"
    "<text x=\"20\" y=\"40\" font-size=\"16\">diagrama</text></svg>`}; } };"
)


def new_page(browser, viewport):
    context = browser.new_context(
        viewport=viewport,
        device_scale_factor=1,
        reduced_motion="reduce",
        forced_colors="none",
        color_scheme="light",
        service_workers="block",
    )
    page = context.new_page()
    page.add_init_script(DETERMINISTIC_RANDOM_INIT)
    return context, page


def configure_routes(page, base_url):
    def route(route_obj):
        url = route_obj.request.url
        if "api.github.com" in url:
            route_obj.abort()
        elif "cdn.jsdelivr.net" in url or "mermaid.esm.min.mjs" in url:
            route_obj.fulfill(status=200, content_type="application/javascript", body=MERMAID_RENDERER)
        elif url.startswith(base_url + "/"):
            route_obj.continue_()
        else:
            route_obj.abort()

    page.route("**/*", route)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def serve_directory(directory: Path):
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{server.server_port}"


def build_preview() -> Path:
    import tempfile
    import uuid

    parent = Path(tempfile.gettempdir()) / "editorial-visual-preview"
    parent.mkdir(parents=True, exist_ok=True)
    out = parent / f"site-{uuid.uuid4().hex[:12]}"
    result = subprocess.run(
        ["node", "scripts/build-markdown-preview.mjs", "--output-dir", str(out)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"preview build failed: {result.stderr or result.stdout}")
    return out


# --- pure-Python PNG decode (dependency-free screenshot comparison) ---

def decode_png(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos = 8
    width = height = None
    color_type = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            width, height, _bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
        pos += 12 + length
    if width is None or height is None:
        raise ValueError("missing IHDR")
    raw = zlib.decompress(bytes(idat))
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color_type]
    bpp = channels
    stride = width * bpp
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    row = bytearray(stride)
    for y in range(height):
        filter_type = raw[y * (stride + 1)]
        row[:] = raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)]
        if filter_type == 1:
            for i in range(bpp, stride):
                row[i] = (row[i] + row[i - bpp]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                row[i] = (row[i] + prev[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[i] = (row[i] + pr) & 0xFF
        elif filter_type != 0:
            raise ValueError(f"unsupported PNG filter {filter_type}")
        base = y * width * 4
        for x in range(width):
            px = x * bpp
            if channels == 1:
                r = g = b = row[px]
                a = 255
            elif channels == 2:
                r = g = b = row[px]
                a = row[px + 1]
            elif channels == 3:
                r, g, b = row[px], row[px + 1], row[px + 2]
                a = 255
            else:
                r, g, b, a = row[px], row[px + 1], row[px + 2], row[px + 3]
            o = base + x * 4
            out[o], out[o + 1], out[o + 2], out[o + 3] = r, g, b, a
        prev, row = row, prev
    return width, height, out


def image_diff(abytes: bytes, bbytes: bytes, threshold: int, max_diff_pixels: int):
    if abytes == bbytes:
        return {"same": True, "reason": "", "diffPixels": 0}
    aw, ah, apx = decode_png(abytes)
    bw, bh, bpx = decode_png(bbytes)
    if (aw, ah) != (bw, bh):
        return {"same": False, "reason": f"dimension {aw}x{ah} != {bw}x{bh}", "diffPixels": -1}
    if apx == bpx:
        return {"same": True, "reason": "", "diffPixels": 0}
    diff = 0
    max_delta = 0
    row_bytes = aw * 4
    for y in range(ah):
        row_start = y * row_bytes
        row_end = row_start + row_bytes
        if apx[row_start:row_end] == bpx[row_start:row_end]:
            continue
        for i in range(row_start, row_end, 4):
            dr = abs(apx[i] - bpx[i])
            dg = abs(apx[i + 1] - bpx[i + 1])
            db = abs(apx[i + 2] - bpx[i + 2])
            da = abs(apx[i + 3] - bpx[i + 3])
            d = max(dr, dg, db, da)
            max_delta = max(max_delta, d)
            if d > threshold:
                diff += 1
    same = diff <= max_diff_pixels
    return {"same": same, "reason": f"{diff} pixels differ (max delta {max_delta})" if not same else "", "diffPixels": diff}


# --- DOM signature ---

def canonical_dom(page) -> str:
    script = """
    (dynamicContainers) => {
      const tokens = [];
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
        if (node.matches && dynamicContainers.some(s => node.matches(s))) {
          const cls = [...node.classList].sort().join('.');
          const id = node.id ? '#' + node.id : '';
          tokens.push(tag + id + (cls ? '.' + cls : '') + '[dynamic]');
          return;
        }
        const cls = [...node.classList].sort().join('.');
        const id = node.id ? '#' + node.id : '';
        const attrs = [];
        for (const a of node.attributes) {
          if (['class', 'id', 'style'].includes(a.name)) continue;
          attrs.push(a.name + '=' + a.value);
        }
        attrs.sort();
        tokens.push(tag + id + (cls ? '.' + cls : '') + (attrs.length ? '(' + attrs.join(',') + ')' : ''));
        for (const child of node.children) walk(child);
      };
      walk(document.body);
      return tokens.join('\\n');
    }
    """
    return page.evaluate(script, list(DYNAMIC_CONTAINERS))


# --- capture ---

def settle(page):
    """Wait until async content (network, images, mermaid) stops changing, then freeze animations at t=0."""
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:  # noqa: BLE001
        pass
    try:
        page.wait_for_function(
            "Array.from(document.images)"
            ".filter(i => i.loading !== 'lazy' || i.getBoundingClientRect().top < window.innerHeight)"
            ".every(i => i.complete)",
            timeout=10000,
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        page.wait_for_function(
            "Array.from(document.querySelectorAll('.mermaid-figure')).every("
            "f => f.querySelector('svg') || f.querySelector('.mermaid-error'))",
            timeout=20000,
        )
    except Exception:  # noqa: BLE001
        pass
    page.add_style_tag(content=SCROLLBAR_HIDE_CSS)
    page.evaluate(
        """() => {
          if (typeof document.getAnimations === 'function') {
            for (const anim of document.getAnimations()) {
              try { anim.pause(); anim.currentTime = 0; } catch (_) {}
            }
          }
        }"""
    )
    page.wait_for_timeout(200)


def digest_dict(data: dict) -> str:
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def capture_page(page, page_cfg, inventory):
    ready = page_cfg["ready"]
    try:
        page.wait_for_selector(ready, state="visible", timeout=30000)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{page_cfg['key']} did not reach ready state ({ready})") from exc
    try:
        page.wait_for_function("document.fonts ? document.fonts.ready.then(() => true) : true", timeout=10000)
    except Exception:  # noqa: BLE001
        pass
    settle(page)

    payload = {
        "elements": [e["key"] for e in page_cfg["elements"]],
        "selectors": [e["selector"] for e in page_cfg["elements"]],
        "properties": inventory["properties"],
    }
    result = page.evaluate(
        """(payload) => {
          const out = { elements: {}, root: {}, body: {} };
          const props = payload.properties;
          const read = (el) => {
            const cs = getComputedStyle(el);
            const style = {};
            for (const p of props) {
              let v;
              try { v = cs.getPropertyValue(p); } catch (e) { v = '<error>'; }
              style[p] = v;
            }
            return { style };
          };
          payload.elements.forEach((key, i) => {
            const el = document.querySelector(payload.selectors[i]);
            out.elements[key] = el ? read(el) : null;
          });
          const customs = (el) => {
            const cs = getComputedStyle(el);
            const map = {};
            for (let i = 0; i < cs.length; i++) {
              const name = cs.item(i);
              if (name.startsWith('--')) map[name] = cs.getPropertyValue(name).trim();
            }
            return map;
          };
          out.root = customs(document.documentElement);
          out.body = customs(document.body);
          return out;
        }
        """,
        payload,
    )
    digests = {}
    for el_key, el_val in result["elements"].items():
        digests[el_key] = None if el_val is None else digest_dict(el_val["style"])
    result["digests"] = digests
    result["rootDigest"] = digest_dict(result["root"])
    result["bodyDigest"] = digest_dict(result["body"])
    return result


def capture_site(base_url, browser, inventory, capture_screenshots=True):
    snapshot = {"inventoryVersion": inventory["version"], "pages": {}, "dom": {}, "domDigest": {}, "screenshots": {}}
    shot_cfg = inventory["screenshot"]
    for page_cfg in inventory["pages"]:
        snapshot["pages"][page_cfg["key"]] = {}
        for viewport in inventory["viewports"]:
            vk = viewport["key"]
            context, page = new_page(browser, {"width": viewport["width"], "height": viewport["height"]})
            try:
                configure_routes(page, base_url)
                page.goto(base_url + "/" + page_cfg["path"], wait_until="domcontentloaded")
                captured = capture_page(page, page_cfg, inventory)
                snapshot["pages"][page_cfg["key"]][vk] = captured
                if capture_screenshots:
                    snapshot["screenshots"][f"{page_cfg['key']}-{vk}"] = page.screenshot(full_page=shot_cfg["fullPage"])
            finally:
                context.close()
    # DOM signature measured once per page at desktop viewport.
    for page_cfg in inventory["pages"]:
        context, page = new_page(browser, {"width": 1440, "height": 900})
        try:
            configure_routes(page, base_url)
            page.goto(base_url + "/" + page_cfg["path"], wait_until="domcontentloaded")
            page.wait_for_selector(page_cfg["ready"], state="visible", timeout=30000)
            settle(page)
            dom_text = canonical_dom(page)
            snapshot["dom"][page_cfg["key"]] = dom_text
            snapshot["domDigest"][page_cfg["key"]] = hashlib.sha256(dom_text.encode("utf-8")).hexdigest()
        finally:
            context.close()
    return snapshot


def write_baseline(snapshot, baseline_dir: Path):
    baseline_dir.mkdir(parents=True, exist_ok=True)
    jsonable = {
        "inventoryVersion": snapshot["inventoryVersion"],
        "pages": snapshot["pages"],
        "dom": snapshot["dom"],
        "domDigest": snapshot["domDigest"],
        "screenshots": {},
    }
    for key, png in snapshot["screenshots"].items():
        name = f"{key}.png"
        (baseline_dir / name).write_bytes(png)
        jsonable["screenshots"][key] = {"file": name, "sha256": hashlib.sha256(png).hexdigest()}
    (baseline_dir / "snapshot.json").write_text(
        json.dumps(jsonable, sort_keys=True, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Baseline written to {baseline_dir} ({len(snapshot['screenshots'])} screenshots)")


def compare_snapshot(fresh, baseline_dir: Path, inventory: dict, styles_and_dom_only: bool = False, check_custom_props: bool = True) -> list[str]:
    baseline_json = json.loads((baseline_dir / "snapshot.json").read_text(encoding="utf-8"))
    problems = []
    if fresh["inventoryVersion"] != baseline_json.get("inventoryVersion"):
        problems.append("inventory version changed; re-record the baseline")
    for page_key, viewports in fresh["pages"].items():
        base_viewports = baseline_json["pages"].get(page_key, {})
        for vk, captured in viewports.items():
            base = base_viewports.get(vk, {})
            if check_custom_props:
                for scope in ("root", "body"):
                    fresh_vars = captured.get(scope, {})
                    base_vars = base.get(scope, {})
                    if fresh_vars != base_vars:
                        all_keys = sorted(set(fresh_vars) | set(base_vars))
                        for k in all_keys:
                            if fresh_vars.get(k) != base_vars.get(k):
                                problems.append(f"{page_key}/{vk}/:{scope}/{k}: {base_vars.get(k)!r} -> {fresh_vars.get(k)!r}")
            base_elements = base.get("elements", {})
            for element_key, value in captured["elements"].items():
                bvalue = base_elements.get(element_key)
                if (value is None) != (bvalue is None):
                    problems.append(f"{page_key}/{vk}/{element_key}: presence differs (None vs value)")
                    continue
                if value is None:
                    continue
                for prop in inventory["properties"]:
                    a = value["style"].get(prop)
                    b = (bvalue or {}).get("style", {}).get(prop)
                    if a != b:
                        problems.append(f"{page_key}/{vk}/{element_key}/{prop}: {b!r} -> {a!r}")
    for page_key, dom in fresh["dom"].items():
        base_dom = baseline_json["dom"].get(page_key)
        if dom != base_dom:
            problems.append(f"dom/{page_key}: structural signature differs")
    if not styles_and_dom_only:
        for key, png in fresh["screenshots"].items():
            rec = baseline_json["screenshots"].get(key)
            if not rec:
                problems.append(f"screenshot/{key}: missing baseline")
                continue
            bpng = (baseline_dir / rec["file"]).read_bytes()
            if hashlib.sha256(bpng).hexdigest() != rec["sha256"]:
                problems.append(f"screenshot/{key}: baseline file changed on disk")
            d = image_diff(bpng, png, inventory["screenshot"]["threshold"], inventory["screenshot"]["maxDiffPixels"])
            if not d["same"]:
                problems.append(f"screenshot/{key}: {d['reason']}")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true", help="write the baseline")
    parser.add_argument("--check", action="store_true", help="compare against the baseline")
    parser.add_argument("--root", help="built site directory to serve (default: dist)")
    parser.add_argument("--build", action="store_true", help="build a preview before serving")
    parser.add_argument("--baseline-dir", help="override baseline directory")
    parser.add_argument("--styles-and-dom-only", action="store_true", help="compare computed styles, custom properties and DOM signature without PNG diff")
    args = parser.parse_args()

    if args.capture == args.check:
        parser.error("provide exactly one of --capture or --check")

    baseline_dir = Path(args.baseline_dir) if args.baseline_dir else DEFAULT_BASELINE_DIR
    inventory = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))

    if args.build:
        site_dir = build_preview()
    else:
        site_dir = Path(args.root) if args.root else (REPO_ROOT / "dist")
        if not (site_dir / "index.html").is_file():
            raise SystemExit(f"No index.html at {site_dir}; build the site or pass --build.")

    server, base_url = serve_directory(site_dir)
    chromium_path = os.environ.get("SITE_CHROMIUM")
    launch_opts = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if chromium_path:
        launch_opts["executable_path"] = chromium_path

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**launch_opts)
            try:
                snapshot = capture_site(
                    base_url, browser, inventory,
                    capture_screenshots=args.capture or not args.styles_and_dom_only,
                )
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

    if args.capture:
        write_baseline(snapshot, baseline_dir)
        return

    problems = compare_snapshot(snapshot, baseline_dir, inventory, styles_and_dom_only=args.styles_and_dom_only)
    if problems:
        print("VISUAL DRIFT DETECTED:")
        for p in problems[:400]:
            print("  -", p)
        if len(problems) > 400:
            print(f"  ... and {len(problems) - 400} more")
        sys.exit(1)
    mode_label = "computed styles, custom properties and DOM structure" if args.styles_and_dom_only else "computed styles, custom properties, DOM structure and screenshots"
    print(f"VISUAL BASELINE OK: {mode_label} match.")


if __name__ == "__main__":
    main()
