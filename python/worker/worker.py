import json
import os
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any


if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    try:
        request = read_request()
        if request.get("type") == "diagnose":
            result = diagnose()
        else:
            result = transcribe(request)
    except WorkerError as error:
        print(json.dumps({"error": error.message, "detail": error.detail}, ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception as error:
        print(json.dumps({"error": "Unexpected STT worker error", "detail": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


def read_request() -> dict[str, Any]:
    line = sys.stdin.readline()
    if not line:
        raise WorkerError("No request provided")

    try:
        request = json.loads(line)
    except json.JSONDecodeError as error:
        raise WorkerError("Invalid JSON request", str(error)) from error

    request_type = request.get("type")
    if request_type == "diagnose":
        return request

    if request_type != "transcribe":
        raise WorkerError("Unsupported request type")

    file_path = request.get("file")
    if not isinstance(file_path, str) or not file_path:
        raise WorkerError("Missing audio file path")

    if not Path(file_path).is_file():
        raise WorkerError("Audio file does not exist", file_path)

    return request


def diagnose() -> dict[str, Any]:
    error_message = None
    faster_whisper_available = True
    faster_whisper_version = None

    try:
        import faster_whisper  # noqa: F401
        faster_whisper_version = version("faster-whisper")
    except (ImportError, PackageNotFoundError) as error:
        faster_whisper_available = False
        error_message = str(error)

    return {
        "pythonVersion": sys.version.split()[0],
        "workerPath": str(Path(__file__).resolve()),
        "fasterWhisperAvailable": faster_whisper_available,
        "fasterWhisperVersion": faster_whisper_version,
        "errorMessage": error_message,
    }


def transcribe(request: dict[str, Any]) -> dict[str, Any]:
    try:
        import ctranslate2
        from faster_whisper import BatchedInferencePipeline, WhisperModel
    except ImportError as error:
        raise WorkerError(
            "faster-whisper is not installed",
            "Create a Python environment and run: pip install -r python/requirements.txt",
        ) from error

    model_name = normalize_model_name(str(request.get("model") or os.environ.get("DISTILL_WHISPER_MODEL") or "small"))
    requested_device = str(request.get("device") or os.environ.get("DISTILL_WHISPER_DEVICE") or "auto")
    device = resolve_device(requested_device, ctranslate2.get_cuda_device_count())
    compute_type = str(request.get("compute_type") or os.environ.get("DISTILL_WHISPER_COMPUTE_TYPE") or "auto")
    batch_size = normalize_batch_size(request.get("batch_size") or os.environ.get("DISTILL_WHISPER_BATCH_SIZE") or 4)
    audio_path = str(request["file"])

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    pipeline = BatchedInferencePipeline(model=model)
    segments_iter, info = pipeline.transcribe(audio_path, batch_size=batch_size, vad_filter=True)
    segments = [
        {
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip(),
        }
        for segment in segments_iter
        if segment.text.strip()
    ]

    return {
        "language": getattr(info, "language", None),
        "duration": normalize_duration(getattr(info, "duration", None)),
        "segments": segments,
    }


def normalize_model_name(model_name: str) -> str:
    if model_name.startswith("faster-whisper-"):
        return model_name.removeprefix("faster-whisper-")
    return model_name


def resolve_device(requested_device: str, cuda_device_count: int) -> str:
    if requested_device == "auto":
        return "cuda" if cuda_device_count > 0 else "cpu"
    return requested_device


def normalize_batch_size(value: Any) -> int:
    try:
        batch_size = int(value)
    except (TypeError, ValueError):
        batch_size = 4
    return max(1, min(batch_size, 16))


def normalize_duration(duration: Any) -> float | None:
    if isinstance(duration, int | float):
        return float(duration)
    return None


class WorkerError(Exception):
    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.message = message
        self.detail = detail


if __name__ == "__main__":
    raise SystemExit(main())
