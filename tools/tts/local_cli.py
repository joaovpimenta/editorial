"""Local Kokoro Dora CLI for Editorial articles and plain-text projects."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Match GitHub Actions' single-instance/four-thread execution settings.
os.environ["OMP_NUM_THREADS"] = "4"
os.environ["OPENBLAS_NUM_THREADS"] = "4"

from kokoro_release import (
    DEFAULT_PRESET,
    LANG,
    NARRATION_PRESETS,
    SAMPLE_RATE,
    VOICE,
    create_onnx_session,
    prepare,
    segments_for_article,
    synthesize,
)

if os.environ.get("KOKORO_DORA_HOME"):
    DEFAULT_HOME = Path(os.environ["KOKORO_DORA_HOME"])
elif os.name == "nt" and os.environ.get("LOCALAPPDATA"):
    DEFAULT_HOME = Path(os.environ["LOCALAPPDATA"]) / "Editorial" / "KokoroDora"
else:
    DEFAULT_HOME = REPO_ROOT / ".local" / "kokoro"
DEFAULT_MODEL = DEFAULT_HOME / "models" / "kokoro-v1.0.onnx"
DEFAULT_VOICES = DEFAULT_HOME / "models" / "voices-v1.0.bin"
DEFAULT_OUTPUT = DEFAULT_HOME / "output"


def add_runtime_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--voices", type=Path, default=DEFAULT_VOICES)
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")


def require_assets(model: Path, voices: Path) -> None:
    for path, minimum in ((model, 250_000_000), (voices, 20_000_000)):
        if not path.is_file() or path.stat().st_size <= minimum:
            raise FileNotFoundError(
                f"Modelo/voz ausente ou incompleto: {path}. Execute tools/tts/setup-local.ps1."
            )


def get_ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as error:
        raise RuntimeError(
            "FFmpeg local não encontrado. Execute tools/tts/setup-local.ps1."
        ) from error


def encode_mp3(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        get_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-af", "loudnorm=I=-19:TP=-1:LRA=11", "-ar", str(SAMPLE_RATE), "-ac", "1",
        "-c:a", "libmp3lame", "-b:a", "128k", str(destination),
    ]
    subprocess.run(command, check=True)
    if not destination.is_file() or destination.stat().st_size == 0:
        raise RuntimeError(f"FFmpeg não gerou um MP3 válido: {destination}")


def output_segments_for_text(source: Path, output_dir: Path, name: str, language: str,
                             preset: str) -> None:
    text = source.read_text(encoding="utf-8-sig").strip()
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    if not paragraphs:
        raise ValueError("O arquivo de texto está vazio.")
    html_lang = "en-US" if language == "en-us" else "pt-BR"
    body = "".join(
        f'<p lang="{html_lang}"><span data-tts-mode="word">'
        f'{html.escape(paragraph.replace(chr(10), " "))}</span></p>'
        for paragraph in paragraphs
    )
    segments = segments_for_article(
        {"title": "", "bodyHtml": body}, {}, preset=preset, sentence_aware=True
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / f"{name}.segments.json").write_text(
        json.dumps(segments, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / f"{name}.txt").write_text(
        "\n".join(segment["text"] for segment in segments) + "\n", encoding="utf-8"
    )


def run_synthesis(slug: str, output_dir: Path, model: Path, voices: Path,
                  preset: str, device: str, output_format: str) -> None:
    synthesize(slug, output_dir, model, voices, preset=preset, device=device)
    wav_path = output_dir / f"{slug}.wav"
    if output_format in {"mp3", "both"}:
        encode_mp3(wav_path, output_dir / f"{slug}.mp3")
    report = json.loads((output_dir / f"{slug}.metrics.json").read_text(encoding="utf-8"))
    print(json.dumps({
        "output_dir": str(output_dir.resolve()),
        "wav": str(wav_path.resolve()),
        "mp3": str((output_dir / f"{slug}.mp3").resolve())
        if output_format in {"mp3", "both"} else None,
        "device": report["device"],
        "execution_providers": report["execution_providers"],
        "audio_seconds": report["audio_seconds"],
    }, ensure_ascii=False), flush=True)


def safe_name(value: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    if not name:
        raise ValueError("Nome de saída inválido.")
    return name[:80]


def run_doctor(args: argparse.Namespace) -> int:
    import onnxruntime as ort

    providers = ort.get_available_providers()
    result = {
        "python": sys.version.split()[0],
        "onnxruntime": ort.__version__,
        "available_providers": providers,
        "cuda_provider_available": "CUDAExecutionProvider" in providers,
        "model_exists": args.model.is_file(),
        "voices_exists": args.voices.is_file(),
        "ffmpeg": get_ffmpeg(),
    }
    if args.load_model:
        require_assets(args.model, args.voices)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session, device = create_onnx_session(ort, args.model, options, args.device)
        from kokoro_onnx import Kokoro
        from misaki.espeak import EspeakG2P

        kokoro = Kokoro.from_session(session, str(args.voices))
        phonemizers = {
            "pt-br": EspeakG2P(language="pt-br"),
            "en-us": EspeakG2P(language="en-us"),
        }
        if not all(phonemizers[lang](sample)[0] for lang, sample in (
            ("pt-br", "Teste de instalação."), ("en-us", "Local setup check."),
        )):
            raise RuntimeError("eSpeak não produziu fonemas para os dois idiomas.")
        settings = NARRATION_PRESETS[DEFAULT_PRESET]
        phonemes, _ = phonemizers["pt-br"]("Teste de instalação.")
        audio, sample_rate = kokoro.create(
            phonemes, voice=VOICE, speed=settings["speed"], is_phonemes=True,
            trim=True, continuous=False,
            sentence_pause=settings["sentence_pause"],
            clause_pause=settings["clause_pause"],
        )
        if sample_rate != SAMPLE_RATE or len(audio) == 0:
            raise RuntimeError("A inferência de verificação produziu áudio inválido.")
        result["device"] = device
        result["session_providers"] = session.get_providers()
        result["g2p_languages"] = ["pt-br", "en-us"]
        result["model_loaded"] = True
        result["inference_samples"] = len(audio)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="verifica dependências e provider local")
    add_runtime_args(doctor)
    doctor.add_argument("--load-model", action="store_true",
                        help="abre o modelo e verifica que o provider solicitado inicia")

    article = subparsers.add_parser("article", help="sintetiza um artigo publicado do site")
    add_runtime_args(article)
    article.add_argument("--slug", required=True)
    article.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    article.add_argument("--preset", choices=list(NARRATION_PRESETS), default=DEFAULT_PRESET)
    article.add_argument("--format", choices=["wav", "mp3", "both"], default="mp3")

    text = subparsers.add_parser("text", help="sintetiza um arquivo .txt de qualquer projeto")
    add_runtime_args(text)
    text.add_argument("--input", type=Path, required=True)
    text.add_argument("--lang", choices=["pt-BR", "en-US"], default="pt-BR")
    text.add_argument("--name", help="nome-base dos arquivos de saída")
    text.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    text.add_argument("--preset", choices=list(NARRATION_PRESETS), default=DEFAULT_PRESET)
    text.add_argument("--format", choices=["wav", "mp3", "both"], default="mp3")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "doctor":
            return run_doctor(args)
        require_assets(args.model, args.voices)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        if args.command == "article":
            prepare(args.slug, args.output_dir, preset=args.preset, sentence_aware=True)
            run_synthesis(args.slug, args.output_dir, args.model, args.voices,
                          args.preset, args.device, args.format)
        else:
            source = args.input.expanduser().resolve()
            if not source.is_file():
                raise FileNotFoundError(f"Arquivo de entrada não encontrado: {source}")
            name = safe_name(args.name or source.stem)
            language = "en-us" if args.lang == "en-US" else LANG
            output_segments_for_text(source, args.output_dir, name, language, args.preset)
            run_synthesis(name, args.output_dir, args.model, args.voices,
                          args.preset, args.device, args.format)
    except (FileNotFoundError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"kokoro-dora: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
