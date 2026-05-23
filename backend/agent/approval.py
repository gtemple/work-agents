"""
Inter-thread approval mechanism for gated tool calls.

The agent loop thread calls wait_for_approval() which blocks on a threading.Event.
The approval HTTP endpoint calls respond() from its own thread, unblocking the generator.

Note: works with Django's threaded dev server and gunicorn threaded workers.
With gunicorn sync workers (default), increase --threads.
"""
import threading

_events: dict[str, threading.Event] = {}
_decisions: dict[str, bool] = {}
_lock = threading.Lock()


def wait_for_approval(session_id: str, timeout: int = 300) -> bool:
    key = str(session_id)
    ev = threading.Event()
    with _lock:
        _events[key] = ev
    approved = ev.wait(timeout=timeout)  # False = timed out
    with _lock:
        result = _decisions.pop(key, False)
        _events.pop(key, None)
    return result and approved


def respond(session_id: str, approved: bool):
    key = str(session_id)
    with _lock:
        _decisions[key] = approved
        ev = _events.get(key)
    if ev:
        ev.set()


def has_pending(session_id: str) -> bool:
    return str(session_id) in _events
