import json
import threading
from pathlib import Path
from django.conf import settings

_lock = threading.Lock()


def _path() -> Path:
    p = Path(settings.MEDIA_ROOT)
    p.mkdir(parents=True, exist_ok=True)
    return p / 'token_ledger.json'


def load_all() -> dict:
    try:
        return json.loads(_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def update(session_id: str, input_tokens: int, output_tokens: int):
    with _lock:
        data = load_all()
        data[session_id] = {'input': input_tokens, 'output': output_tokens}
        _path().write_text(json.dumps(data))
