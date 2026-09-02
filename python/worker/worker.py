import json
import os
import sys
from pathlib import Path
from typing import Any


def main() -> int:
    try:
        request = read_request()
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

    if request.get("type") != "transcribe":
        raise WorkerError("Unsupported request type")

    file_path = request.get("file")
    if not isinstance(file_path, str) or not file_path:
        raise WorkerError("Missing audio file path")

    if not Path(file_path).is_file():
        raise WorkerError("Audio file does not exist", file_path)

    return request


def transcribe(request: dict[str, Any]) -> dict[str, Any]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise WorkerError(
            "faster-whisper is not installed",
            "Create a Python environment and run: pip install -r python/requirements.txt",
        ) from error

    model_name = normalize_model_name(str(request.get("model") or os.environ.get("DISTILL_WHISPER_MODEL") or "small"))
    device = str(request.get("device") or os.environ.get("DISTILL_WHISPER_DEVICE") or "auto")
    compute_type = str(request.get("compute_type") or os.environ.get("DISTILL_WHISPER_COMPUTE_TYPE") or "int8")
    audio_path = str(request["file"])

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments_iter, info = model.transcribe(audio_path, vad_filter=True)
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
