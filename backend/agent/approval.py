"""
Inter-thread approval mechanism for gated tool calls.

The agent loop thread calls wait_for_approval() which blocks on a threading.Event.
The approval HTTP endpoint calls respond() from its own thread, unblocking the generator.

Note: works with Django's threaded dev server and gunicorn threaded workers.
With gunicorn sync workers (default), increase --threads.
"""
import threading

_events: dict[str, threading.Event] = {}
_decisions: dict[str, tuple[bool, dict | None]] = {}
_lock = threading.Lock()


def wait_for_approval(session_id: str, timeout: int = 300) -> tuple[bool, dict | None]:
    key = str(session_id)
    ev = threading.Event()
    with _lock:
        _events[key] = ev
    timed_out = not ev.wait(timeout=timeout)
    with _lock:
        approved, args = _decisions.pop(key, (False, None))
        _events.pop(key, None)
    if timed_out:
        return False, None
    return approved, args


def respond(session_id: str, approved: bool, args: dict | None = None):
    key = str(session_id)
    with _lock:
        _decisions[key] = (approved, args)
        ev = _events.get(key)
    if ev:
        ev.set()


def has_pending(session_id: str) -> bool:
    return str(session_id) in _events
