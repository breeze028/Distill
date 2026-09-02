import json
import sys


def main() -> int:
    line = sys.stdin.readline()
    if not line:
        print(json.dumps({"error": "No request provided"}), file=sys.stderr)
        return 1

    request = json.loads(line)
    if request.get("type") != "transcribe":
        print(json.dumps({"error": "Unsupported request type"}), file=sys.stderr)
        return 1

    # Phase 0 placeholder. Phase 1 will install faster-whisper here and return real segments.
    result = {
        "language": "zh",
        "duration": None,
        "segments": [
            {
                "start": 0.0,
                "end": 3.0,
                "text": "Python Worker placeholder is ready for faster-whisper integration.",
            }
        ],
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
