import subprocess
from pathlib import Path


LANGUAGE_COMMANDS = {
    'python': ['python3', '-c'],
    'python3': ['python3', '-c'],
    'javascript': ['node', '-e'],
    'js': ['node', '-e'],
    'bash': ['bash', '-c'],
    'sh': ['bash', '-c'],
}


def execute(language: str, code: str, cwd: Path) -> dict:
    cmd_prefix = LANGUAGE_COMMANDS.get(language.lower())
    if not cmd_prefix:
        return {'stdout': '', 'stderr': f'Unsupported language: {language}', 'exit_code': 1}

    cwd.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            cmd_prefix + [code],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            'stdout': result.stdout[:8000],
            'stderr': result.stderr[:2000],
            'exit_code': result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {'stdout': '', 'stderr': 'Execution timed out (30s limit)', 'exit_code': 124}
    except FileNotFoundError:
        return {'stdout': '', 'stderr': f'Runtime not found for language: {language}', 'exit_code': 1}
