from pathlib import Path
from . import sandbox


DECLARATIONS = [
    {
        'name': 'run_code',
        'description': 'Execute code in a sandbox and return the output.',
        'parameters': {
            'type': 'object',
            'properties': {
                'language': {
                    'type': 'string',
                    'description': 'Programming language: python, javascript, or bash',
                },
                'code': {
                    'type': 'string',
                    'description': 'The code to execute',
                },
            },
            'required': ['language', 'code'],
        },
    },
    {
        'name': 'read_file',
        'description': 'Read the contents of an uploaded file.',
        'parameters': {
            'type': 'object',
            'properties': {
                'filename': {
                    'type': 'string',
                    'description': 'Name of the file to read',
                },
            },
            'required': ['filename'],
        },
    },
    {
        'name': 'write_file',
        'description': 'Write content to a file in the session working directory.',
        'parameters': {
            'type': 'object',
            'properties': {
                'filename': {
                    'type': 'string',
                    'description': 'Name of the file to write',
                },
                'content': {
                    'type': 'string',
                    'description': 'Content to write to the file',
                },
            },
            'required': ['filename', 'content'],
        },
    },
    {
        'name': 'list_files',
        'description': 'List all files available in the session working directory.',
        'parameters': {
            'type': 'object',
            'properties': {},
        },
    },
    {
        'name': 'bash',
        'description': 'Run a bash command in the session working directory.',
        'parameters': {
            'type': 'object',
            'properties': {
                'command': {
                    'type': 'string',
                    'description': 'Bash command to execute',
                },
            },
            'required': ['command'],
        },
    },
]


def dispatch(tool_name: str, args: dict, session_dir: Path) -> str:
    if tool_name == 'run_code':
        result = sandbox.execute(args['language'], args['code'], session_dir)
        parts = []
        if result['stdout']:
            parts.append(f'stdout:\n{result["stdout"]}')
        if result['stderr']:
            parts.append(f'stderr:\n{result["stderr"]}')
        parts.append(f'exit_code: {result["exit_code"]}')
        return '\n'.join(parts)

    elif tool_name == 'read_file':
        path = session_dir / args['filename']
        if not path.exists():
            return f'File not found: {args["filename"]}'
        try:
            return path.read_text(errors='replace')[:16000]
        except Exception as e:
            return f'Error reading file: {e}'

    elif tool_name == 'write_file':
        session_dir.mkdir(parents=True, exist_ok=True)
        path = session_dir / args['filename']
        path.write_text(args['content'])
        return f'Written {len(args["content"])} bytes to {args["filename"]}'

    elif tool_name == 'list_files':
        if not session_dir.exists():
            return 'No files uploaded yet.'
        files = [f.name for f in session_dir.iterdir() if f.is_file()]
        return '\n'.join(files) if files else 'No files.'

    elif tool_name == 'bash':
        result = sandbox.execute('bash', args['command'], session_dir)
        parts = []
        if result['stdout']:
            parts.append(result['stdout'])
        if result['stderr']:
            parts.append(f'stderr: {result["stderr"]}')
        if result['exit_code'] != 0:
            parts.append(f'exit_code: {result["exit_code"]}')
        return '\n'.join(parts) or '(no output)'

    return f'Unknown tool: {tool_name}'
