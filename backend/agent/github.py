import re
import subprocess
from pathlib import Path

import requests


def find_git_root(session_dir: Path) -> Path | None:
    """Find the git repo root within session_dir (checks session_dir itself, then one level deep)."""
    if (session_dir / '.git').exists():
        return session_dir
    if session_dir.exists():
        for p in sorted(session_dir.iterdir()):
            if p.is_dir() and (p / '.git').exists():
                return p
    return None


def _get_repo_slug(git_root: Path) -> str | None:
    """Returns 'owner/repo' parsed from git remote origin URL."""
    result = subprocess.run(
        ['git', 'remote', 'get-url', 'origin'],
        cwd=str(git_root), capture_output=True, text=True,
    )
    url = result.stdout.strip()
    m = re.search(r'github\.com[/:](.+?)(?:\.git)?$', url)
    return m.group(1) if m else None


def _current_branch(git_root: Path) -> str:
    result = subprocess.run(
        ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
        cwd=str(git_root), capture_output=True, text=True,
    )
    return result.stdout.strip()


def create_pull_request(git_root: Path, token: str, title: str, body: str, base: str) -> str:
    if not token:
        return 'Error: GITHUB_TOKEN is not configured in .env'

    slug = _get_repo_slug(git_root)
    if not slug:
        return 'Error: could not determine GitHub repo from remote origin URL'

    head = _current_branch(git_root)
    if not head or head == 'HEAD':
        return 'Error: not on a named branch — checkout a branch before creating a PR'

    resp = requests.post(
        f'https://api.github.com/repos/{slug}/pulls',
        headers={
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json',
        },
        json={'title': title, 'body': body, 'head': head, 'base': base},
        timeout=15,
    )

    if resp.status_code == 201:
        data = resp.json()
        return f'PR created: {data["html_url"]} (#{data["number"]})'

    msg = resp.json().get('message', 'unknown error')
    errors = resp.json().get('errors', [])
    detail = '; '.join(e.get('message', '') for e in errors) if errors else ''
    return f'Error {resp.status_code}: {msg}' + (f' — {detail}' if detail else '')
