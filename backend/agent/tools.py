import re
from pathlib import Path
from . import sandbox
from . import github as gh
from . import web


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
    {
        'name': 'clone_repo',
        'description': 'Clone a GitHub repository into the session working directory. Accepts "owner/repo" or a full GitHub URL.',
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {
                    'type': 'string',
                    'description': 'GitHub repo as "owner/repo" or full URL, e.g. "octocat/Hello-World"',
                },
            },
            'required': ['repo'],
        },
    },
    {
        'name': 'git_branch',
        'description': 'Create and checkout a new git branch in the cloned repository.',
        'parameters': {
            'type': 'object',
            'properties': {
                'name': {
                    'type': 'string',
                    'description': 'Name for the new branch, e.g. "feature/add-login"',
                },
            },
            'required': ['name'],
        },
    },
    {
        'name': 'git_status',
        'description': 'Show the current git status of the repository (modified, staged, untracked files).',
        'parameters': {
            'type': 'object',
            'properties': {},
        },
    },
    {
        'name': 'git_diff',
        'description': 'Show a diff of all changes made since the last commit.',
        'parameters': {
            'type': 'object',
            'properties': {},
        },
    },
    {
        'name': 'git_commit',
        'description': 'Stage all changes and create a git commit.',
        'parameters': {
            'type': 'object',
            'properties': {
                'message': {
                    'type': 'string',
                    'description': 'Commit message',
                },
            },
            'required': ['message'],
        },
    },
    {
        'name': 'git_push',
        'description': 'Push the current branch to the GitHub remote.',
        'parameters': {
            'type': 'object',
            'properties': {},
        },
    },
    {
        'name': 'memory_write',
        'description': 'Store a fact, decision, or piece of knowledge in persistent memory. This persists across all sessions.',
        'parameters': {
            'type': 'object',
            'properties': {
                'key': {'type': 'string', 'description': 'Short descriptive key, e.g. "auth-approach" or "django-version"'},
                'value': {'type': 'string', 'description': 'The content to store'},
            },
            'required': ['key', 'value'],
        },
    },
    {
        'name': 'memory_read',
        'description': 'Read a stored memory by key.',
        'parameters': {
            'type': 'object',
            'properties': {
                'key': {'type': 'string', 'description': 'The memory key to read'},
            },
            'required': ['key'],
        },
    },
    {
        'name': 'memory_list',
        'description': 'List all stored memories with a short preview of each value.',
        'parameters': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'memory_delete',
        'description': 'Delete a stored memory by key.',
        'parameters': {
            'type': 'object',
            'properties': {
                'key': {'type': 'string', 'description': 'The memory key to delete'},
            },
            'required': ['key'],
        },
    },
    {
        'name': 'web_search',
        'description': 'Search the web for documentation, Stack Overflow answers, library info, or any other information needed to complete the task.',
        'parameters': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string', 'description': 'Search query'},
                'num_results': {'type': 'integer', 'description': 'Number of results to return (default 6, max 10)'},
            },
            'required': ['query'],
        },
    },
    {
        'name': 'fetch_page',
        'description': 'Fetch the full text content of a web page URL. Use after web_search to read documentation or articles.',
        'parameters': {
            'type': 'object',
            'properties': {
                'url': {'type': 'string', 'description': 'URL to fetch'},
            },
            'required': ['url'],
        },
    },
    {
        'name': 'get_pr',
        'description': 'Get metadata for a GitHub pull request: title, author, description, files changed.',
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {'type': 'string', 'description': '"owner/repo" or "auto" to detect from cloned repo'},
                'pr_number': {'type': 'integer', 'description': 'Pull request number'},
            },
            'required': ['repo', 'pr_number'],
        },
    },
    {
        'name': 'get_pr_diff',
        'description': 'Get the full unified diff of a GitHub pull request.',
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {'type': 'string', 'description': '"owner/repo" or "auto" to detect from cloned repo'},
                'pr_number': {'type': 'integer', 'description': 'Pull request number'},
            },
            'required': ['repo', 'pr_number'],
        },
    },
    {
        'name': 'post_pr_review',
        'description': 'Post a review on a GitHub pull request. Use APPROVE, REQUEST_CHANGES, or COMMENT as the event.',
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {'type': 'string', 'description': '"owner/repo" or "auto" to detect from cloned repo'},
                'pr_number': {'type': 'integer', 'description': 'Pull request number'},
                'body': {'type': 'string', 'description': 'Review body in markdown'},
                'event': {'type': 'string', 'description': 'APPROVE, REQUEST_CHANGES, or COMMENT'},
            },
            'required': ['repo', 'pr_number', 'body', 'event'],
        },
    },
    {
        'name': 'create_pr',
        'description': 'Create a GitHub pull request from the current branch.',
        'parameters': {
            'type': 'object',
            'properties': {
                'title': {
                    'type': 'string',
                    'description': 'PR title',
                },
                'body': {
                    'type': 'string',
                    'description': 'PR description in markdown',
                },
                'base_branch': {
                    'type': 'string',
                    'description': 'Branch to merge into, e.g. "main" or "master"',
                },
            },
            'required': ['title', 'body', 'base_branch'],
        },
    },
]


def dispatch(tool_name: str, args: dict, session_dir: Path, github_token: str = '') -> str:
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

    elif tool_name == 'clone_repo':
        raw = args['repo'].strip()
        # Normalise to owner/repo slug
        m = re.search(r'github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$', raw)
        slug = m.group(1) if m else raw.strip('/')

        if not github_token:
            return 'Error: GITHUB_TOKEN is not configured in .env'

        auth_url = f'https://x-access-token:{github_token}@github.com/{slug}.git'
        repo_name = slug.split('/')[-1]
        clone_dir = session_dir / repo_name
        clone_dir.parent.mkdir(parents=True, exist_ok=True)

        result = sandbox.git_exec(f'git clone "{auth_url}" "{repo_name}"', session_dir, timeout=120)
        if result['exit_code'] != 0:
            err = result['stderr'].replace(github_token, '***')
            return f'Clone failed: {err}'

        # Configure git identity inside the repo
        sandbox.git_exec('git config user.name "Gemini Agent"', clone_dir)
        sandbox.git_exec('git config user.email "agent@gemini.local"', clone_dir)

        context = gh.get_repo_context(clone_dir)
        return f'Cloned {slug} into {repo_name}/\n\n{context}'

    elif tool_name == 'git_branch':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found — clone a repo first with clone_repo'
        name = args['name']
        result = sandbox.git_exec(f'git checkout -b "{name}"', git_root)
        if result['exit_code'] != 0:
            return f'Error: {result["stderr"]}'
        return f'Switched to new branch: {name}'

    elif tool_name == 'git_status':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found'
        result = sandbox.git_exec('git status', git_root)
        return result['stdout'] or result['stderr']

    elif tool_name == 'git_diff':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found'
        result = sandbox.git_exec('git diff HEAD', git_root)
        return result['stdout'][:8000] or '(no changes)'

    elif tool_name == 'git_commit':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found'
        message = args['message'].replace('"', '\\"')
        result = sandbox.git_exec(f'git add -A && git commit -m "{message}"', git_root)
        if result['exit_code'] != 0:
            return f'Commit failed: {result["stderr"]}'
        return result['stdout']

    elif tool_name == 'git_push':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found'
        result = sandbox.git_exec('git push -u origin HEAD', git_root, timeout=60)
        out = (result['stdout'] + result['stderr']).replace(github_token, '***')
        if result['exit_code'] != 0:
            return f'Push failed: {out}'
        return out or 'Pushed successfully'

    elif tool_name == 'create_pr':
        git_root = gh.find_git_root(session_dir)
        if not git_root:
            return 'Error: no git repository found'
        return gh.create_pull_request(
            git_root, github_token,
            title=args['title'],
            body=args['body'],
            base=args.get('base_branch', 'main'),
        )

    elif tool_name == 'memory_write':
        from .models import Memory
        obj, created = Memory.objects.update_or_create(
            key=args['key'], defaults={'value': args['value']}
        )
        return f'{"Stored" if created else "Updated"} memory: {args["key"]}'

    elif tool_name == 'memory_read':
        from .models import Memory
        try:
            m = Memory.objects.get(key=args['key'])
            return m.value
        except Memory.DoesNotExist:
            return f'No memory found for key: {args["key"]}'

    elif tool_name == 'memory_list':
        from .models import Memory
        memories = Memory.objects.all()
        if not memories:
            return 'No memories stored yet.'
        lines = []
        for m in memories:
            preview = m.value[:80].replace('\n', ' ')
            lines.append(f'**{m.key}**: {preview}{"…" if len(m.value) > 80 else ""}')
        return '\n'.join(lines)

    elif tool_name == 'memory_delete':
        from .models import Memory
        deleted, _ = Memory.objects.filter(key=args['key']).delete()
        return f'Deleted memory: {args["key"]}' if deleted else f'No memory found for key: {args["key"]}'

    elif tool_name == 'web_search':
        num = min(int(args.get('num_results', 6)), 10)
        return web.search(args['query'], num)

    elif tool_name == 'fetch_page':
        return web.fetch_page(args['url'])

    elif tool_name == 'get_pr':
        return gh.get_pr(args['repo'], int(args['pr_number']), github_token, session_dir)

    elif tool_name == 'get_pr_diff':
        return gh.get_pr_diff(args['repo'], int(args['pr_number']), github_token, session_dir)

    elif tool_name == 'post_pr_review':
        return gh.post_pr_review(
            args['repo'], int(args['pr_number']),
            github_token, args['body'], args.get('event', 'COMMENT'),
            session_dir,
        )

    return f'Unknown tool: {tool_name}'
