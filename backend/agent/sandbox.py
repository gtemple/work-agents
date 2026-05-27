import os
import subprocess
from pathlib import Path


_GIT_ENV = {
    **os.environ,
    'GIT_AUTHOR_NAME': 'Gemini Agent',
    'GIT_AUTHOR_EMAIL': 'agent@gemini.local',
    'GIT_COMMITTER_NAME': 'Gemini Agent',
    'GIT_COMMITTER_EMAIL': 'agent@gemini.local',
    'GIT_TERMINAL_PROMPT': '0',
}


def git_exec(command: str, cwd: Path, timeout: int = 60) -> dict:
    cwd.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            ['bash', '-c', command],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_GIT_ENV,
        )
        return {
            'stdout': result.stdout[:6000],
            'stderr': result.stderr[:2000],
            'exit_code': result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {'stdout': '', 'stderr': f'Git operation timed out ({timeout}s)', 'exit_code': 124}


LANGUAGE_COMMANDS = {
    'python': ['python3', '-c'],
    'python3': ['python3', '-c'],
    'javascript': ['node', '-e'],
    'js': ['node', '-e'],
    'bash': ['bash', '-c'],
    'sh': ['bash', '-c'],
}


_TIMEOUTS = {'bash': 300, 'sh': 300}


def execute(language: str, code: str, cwd: Path) -> dict:
    cmd_prefix = LANGUAGE_COMMANDS.get(language.lower())
    if not cmd_prefix:
        return {'stdout': '', 'stderr': f'Unsupported language: {language}', 'exit_code': 1}

    cwd.mkdir(parents=True, exist_ok=True)
    timeout = _TIMEOUTS.get(language.lower(), 60)

    try:
        result = subprocess.run(
            cmd_prefix + [code],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            'stdout': result.stdout[:8000],
            'stderr': result.stderr[:2000],
            'exit_code': result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {'stdout': '', 'stderr': f'Execution timed out ({timeout}s limit)', 'exit_code': 124}
    except FileNotFoundError:
        return {'stdout': '', 'stderr': f'Runtime not found for language: {language}', 'exit_code': 1}
