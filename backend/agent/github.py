import re
import subprocess
from pathlib import Path

import requests

_SKIP_DIRS = {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'dist', 'build', '.next', '.cache', 'coverage'}
_CONFIG_FILES = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'composer.json', 'Gemfile', 'Makefile']
_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', '.agent-instructions.md', 'AGENT.md']
_README_NAMES = ['README.md', 'README.rst', 'README.txt', 'README']


def _file_tree(root: Path, depth: int = 2, prefix: str = '') -> str:
    lines = []
    try:
        entries = sorted(root.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        visible = [e for e in entries if e.name not in _SKIP_DIRS]
        for i, entry in enumerate(visible):
            is_last = i == len(visible) - 1
            connector = '└── ' if is_last else '├── '
            lines.append(f'{prefix}{connector}{entry.name}{"/" if entry.is_dir() else ""}')
            if entry.is_dir() and depth > 1:
                ext = '    ' if is_last else '│   '
                subtree = _file_tree(entry, depth - 1, prefix + ext)
                if subtree:
                    lines.append(subtree)
    except PermissionError:
        pass
    return '\n'.join(lines)


def get_repo_context(repo_root: Path) -> str:
    """Build a rich context summary injected after clone_repo."""
    parts = []

    # Agent instruction file (highest priority — inject first)
    for name in _INSTRUCTION_FILES:
        p = repo_root / name
        if p.exists():
            content = p.read_text(errors='replace').strip()
            if content:
                parts.append(f"## Agent instructions ({name})\n{content[:4000]}")
            break

    # File tree
    tree = _file_tree(repo_root)
    if tree:
        parts.append(f"## Repository structure\n{repo_root.name}/\n{tree}")

    # README
    for name in _README_NAMES:
        p = repo_root / name
        if p.exists():
            content = p.read_text(errors='replace').strip()
            if content:
                parts.append(f"## {name}\n{content[:3000]}")
            break

    # Key config files
    for name in _CONFIG_FILES:
        p = repo_root / name
        if p.exists():
            content = p.read_text(errors='replace').strip()
            if content:
                parts.append(f"## {name}\n{content[:1500]}")

    return '\n\n'.join(parts)


def find_git_root(session_dir: Path, repo: str | None = None) -> Path | None:
    """Find the git repo root within session_dir.

    If repo is given, look for session_dir/<repo>/.git first (exact folder name match).
    Otherwise fall back to checking session_dir itself, then the first subdirectory with .git.
    """
    if repo:
        candidate = session_dir / repo
        if (candidate / '.git').exists():
            return candidate
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

    data = resp.json()
    errors = data.get('errors', [])

    # PR already exists — fetch and return the existing URL
    if resp.status_code == 422 and any('already exists' in e.get('message', '') for e in errors):
        existing = requests.get(
            f'https://api.github.com/repos/{slug}/pulls',
            headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'},
            params={'head': f'{slug.split("/")[0]}:{head}', 'state': 'open'},
            timeout=10,
        )
        if existing.status_code == 200 and existing.json():
            pr = existing.json()[0]
            return f'PR already exists: {pr["html_url"]} (#{pr["number"]})'

    msg = data.get('message', 'unknown error')
    detail = '; '.join(e.get('message', '') for e in errors) if errors else ''
    return f'Error {resp.status_code}: {msg}' + (f' — {detail}' if detail else '')


def _gh_headers(token: str) -> dict:
    return {'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}


def _resolve_slug(repo: str, session_dir: Path) -> str | None:
    """Accept explicit 'owner/repo' or detect from cloned git root."""
    if repo and repo != 'auto':
        m = re.search(r'github\.com[/:](.+?)(?:\.git)?$', repo)
        return m.group(1) if m else repo
    git_root = find_git_root(session_dir)
    return _get_repo_slug(git_root) if git_root else None


def get_pr(repo: str, pr_number: int, token: str, session_dir: Path) -> str:
    slug = _resolve_slug(repo, session_dir)
    if not slug:
        return 'Error: could not determine repo — provide "owner/repo" as the repo argument'
    resp = requests.get(
        f'https://api.github.com/repos/{slug}/pulls/{pr_number}',
        headers=_gh_headers(token), timeout=15,
    )
    if resp.status_code != 200:
        return f'Error {resp.status_code}: {resp.json().get("message", "not found")}'
    d = resp.json()
    return (
        f'PR #{d["number"]}: {d["title"]}\n'
        f'Author: {d["user"]["login"]} | {d["head"]["ref"]} → {d["base"]["ref"]}\n'
        f'State: {d["state"]} | +{d["additions"]} -{d["deletions"]} across {d["changed_files"]} files\n'
        f'URL: {d["html_url"]}\n\n'
        f'Description:\n{d["body"] or "(none)"}'
    )


def get_pr_diff(repo: str, pr_number: int, token: str, session_dir: Path) -> str:
    slug = _resolve_slug(repo, session_dir)
    if not slug:
        return 'Error: could not determine repo'
    resp = requests.get(
        f'https://api.github.com/repos/{slug}/pulls/{pr_number}',
        headers={**_gh_headers(token), 'Accept': 'application/vnd.github.diff'},
        timeout=15,
    )
    if resp.status_code != 200:
        return f'Error {resp.status_code}'
    return resp.text[:24000]


def post_pr_review(repo: str, pr_number: int, token: str, body: str, event: str, session_dir: Path) -> str:
    """event: APPROVE | REQUEST_CHANGES | COMMENT"""
    if not token:
        return 'Error: GITHUB_TOKEN not configured'
    slug = _resolve_slug(repo, session_dir)
    if not slug:
        return 'Error: could not determine repo'
    valid_events = {'APPROVE', 'REQUEST_CHANGES', 'COMMENT'}
    event = event.upper()
    if event not in valid_events:
        event = 'COMMENT'
    resp = requests.post(
        f'https://api.github.com/repos/{slug}/pulls/{pr_number}/reviews',
        headers=_gh_headers(token),
        json={'body': body, 'event': event},
        timeout=15,
    )
    if resp.status_code == 200:
        return f'Review posted ({event}): {resp.json()["html_url"]}'
    return f'Error {resp.status_code}: {resp.json().get("message", "unknown")}'
