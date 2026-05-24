"""
Shared repo cache — one mirror clone per repo, reused across all agent sessions.

Flow:
  1. First request for a repo: git clone --mirror <github_url> <cache_dir>  (full download, once)
  2. Subsequent requests:       git fetch --all --prune                       (incremental, fast)
  3. Every session:             git clone --local <cache_dir> <session_dir>  (hard-links, instant)
  4. After local clone:         git remote set-url origin <github_url>       (so push works)

The per-repo lock prevents two agents from racing on the initial mirror clone.
After the mirror exists, concurrent fetches are safe — git handles it.
"""
import subprocess
import threading
from pathlib import Path

_locks: dict[str, threading.Lock] = {}
_locks_mutex = threading.Lock()


def _repo_lock(slug: str) -> threading.Lock:
    with _locks_mutex:
        if slug not in _locks:
            _locks[slug] = threading.Lock()
        return _locks[slug]


def get_local_clone(slug: str, session_dir: Path, github_token: str) -> tuple[Path, str]:
    """
    Return (clone_path, status_message).
    clone_path is the fully-ready working tree inside session_dir.
    """
    from django.conf import settings

    cache_root = Path(settings.MEDIA_ROOT) / 'repo_cache'
    cache_dir = cache_root / slug.replace('/', '-')
    auth_url = f'https://x-access-token:{github_token}@github.com/{slug}.git'
    repo_name = slug.split('/')[-1]
    dest = session_dir / repo_name

    if dest.exists():
        return dest, f'{repo_name}/ already present in session.'

    with _repo_lock(slug):
        if not cache_dir.exists():
            cache_root.mkdir(parents=True, exist_ok=True)
            r = subprocess.run(
                ['git', 'clone', '--mirror', auth_url, str(cache_dir)],
                capture_output=True, text=True, timeout=300,
            )
            if r.returncode != 0:
                err = r.stderr.replace(github_token, '***')
                return dest, f'Mirror clone failed: {err[:400]}'
            source = 'full download'
        else:
            # Refresh auth token in case it changed, then fetch
            subprocess.run(
                ['git', '-C', str(cache_dir), 'remote', 'set-url', 'origin', auth_url],
                capture_output=True, timeout=10,
            )
            subprocess.run(
                ['git', '-C', str(cache_dir), 'fetch', '--all', '--prune'],
                capture_output=True, text=True, timeout=120,
            )
            source = 'local cache'

    # Hard-link the object store — instant on same filesystem
    session_dir.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ['git', 'clone', '--local', str(cache_dir), str(dest)],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        return dest, f'Local clone failed: {r.stderr[:400]}'

    # Reset remote so git push goes to GitHub, not the cache
    subprocess.run(
        ['git', '-C', str(dest), 'remote', 'set-url', 'origin', auth_url],
        capture_output=True, timeout=10,
    )

    return dest, source
