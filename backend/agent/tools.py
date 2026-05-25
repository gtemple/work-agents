import re
from pathlib import Path
from . import sandbox
from . import github as gh
from . import web


def _upsert_section(doc: str, section: str, content: str) -> str:
    """Replace or append a ## section in a markdown document."""
    header = f'## {section}'
    lines = doc.split('\n')

    # Find where this section starts
    start = next((i for i, l in enumerate(lines) if l.strip() == header), None)

    if start is None:
        # Append new section
        prefix = doc.rstrip()
        return f'{prefix}\n\n{header}\n{content}' if prefix else f'{header}\n{content}'

    # Find where the next ## section starts (or end of doc)
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith('## ')), len(lines))

    new_lines = lines[:start] + [header, content] + lines[end:]
    return '\n'.join(new_lines)


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
    {
        'name': 'read_user_context',
        'description': 'Read persistent context about the user — their preferences, working style, interests, and past decisions. Useful before making suggestions or tailoring your approach.',
        'parameters': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'update_user_context',
        'description': 'Update a named section of the user context document. Call this when you learn something meaningful about the user that would help future agents — e.g. a preference they expressed, a decision they made, a technology they like or dislike.',
        'parameters': {
            'type': 'object',
            'properties': {
                'section': {
                    'type': 'string',
                    'description': 'Section name, e.g. "Preferences", "Working Style", "Interests", "Recent Decisions"',
                },
                'content': {
                    'type': 'string',
                    'description': 'Markdown content for this section.',
                },
            },
            'required': ['section', 'content'],
        },
    },
    {
        'name': 'read_repo_memory',
        'description': (
            'Read the persistent knowledge base for a repository. '
            'Always call this at the start of any work task before exploring the codebase — '
            'it contains architecture notes, conventions, gotchas, and patterns discovered by previous agents.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {
                    'type': 'string',
                    'description': 'Repository in "owner/repo" format, e.g. "purposely/purposely-web"',
                },
            },
            'required': ['repo'],
        },
    },
    {
        'name': 'update_repo_memory',
        'description': (
            'Update a named section of the repository knowledge base. '
            'Call this whenever you discover something worth remembering: architecture decisions, '
            'naming conventions, gotchas, key files, test patterns, or anything a future agent '
            'would benefit from knowing. Use clear section names like "Architecture", "Gotchas", '
            '"Conventions", "Key Files", "Tech Stack", "Test Patterns".'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'repo': {
                    'type': 'string',
                    'description': 'Repository in "owner/repo" format',
                },
                'section': {
                    'type': 'string',
                    'description': 'Section name, e.g. "Architecture", "Gotchas", "Conventions"',
                },
                'content': {
                    'type': 'string',
                    'description': 'Markdown content for this section. Replaces any existing content for the section.',
                },
            },
            'required': ['repo', 'section', 'content'],
        },
    },
    {
        'name': 'spawn_task',
        'description': 'Spawn a new task agent to implement a specific subtask in the background. Only available in project orchestrator sessions.',
        'parameters': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string', 'description': 'Short title for the task, e.g. "Implement JWT middleware"'},
                'prompt': {'type': 'string', 'description': 'Full detailed prompt for the task agent. Include all context, repo info, files to change, and approach.'},
            },
            'required': ['title', 'prompt'],
        },
    },
    {
        'name': 'list_project_tasks',
        'description': 'List all task agents spawned for this project and how many messages each has produced.',
        'parameters': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'submit_plan',
        'description': (
            'For work tasks from Linear: after exploring the codebase, call this to submit '
            'your implementation plan for user review before writing any code. '
            'The user will approve or reject before you proceed.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'summary': {
                    'type': 'string',
                    'description': '2-3 sentence summary of the approach',
                },
                'files_to_change': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'description': 'List of file paths that will be created or modified',
                },
                'steps': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'description': 'Ordered implementation steps',
                },
                'risks': {
                    'type': 'string',
                    'description': 'Potential risks or things to watch out for',
                },
            },
            'required': ['summary', 'files_to_change', 'steps'],
        },
    },
    {
        'name': 'start_process',
        'description': (
            'Start a long-running background process (e.g. a web app, API server, or dev server). '
            'The process runs independently and persists beyond this conversation turn. '
            'It will appear in the dashboard with a link and a stop button.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'label': {
                    'type': 'string',
                    'description': 'Human-readable name for this process, e.g. "Flask app" or "Vite dev server"',
                },
                'command': {
                    'type': 'string',
                    'description': 'Shell command to run, e.g. "python app.py" or "npm run dev"',
                },
                'port': {
                    'type': 'integer',
                    'description': 'Port the process listens on — used to generate a clickable URL in the dashboard',
                },
                'cwd': {
                    'type': 'string',
                    'description': 'Working directory relative to session dir (e.g. "my-app/"). Defaults to session root.',
                },
            },
            'required': ['label', 'command'],
        },
    },
    {
        'name': 'stop_process',
        'description': 'Stop a running background process by its dashboard ID.',
        'parameters': {
            'type': 'object',
            'properties': {
                'process_id': {
                    'type': 'integer',
                    'description': 'Process ID as shown by list_processes',
                },
            },
            'required': ['process_id'],
        },
    },
    {
        'name': 'list_processes',
        'description': 'List all background processes (running, stopped, or crashed) for the current session.',
        'parameters': {
            'type': 'object',
            'properties': {},
            'required': [],
        },
    },
]


def dispatch(tool_name: str, args: dict, session_dir: Path, github_token: str = '', session=None) -> str:
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

        from . import repocache
        clone_dir, source = repocache.get_local_clone(slug, session_dir, github_token)

        if not clone_dir.exists():
            return source  # error message

        # Configure git identity
        sandbox.git_exec('git config user.name "Gemini Agent"', clone_dir)
        sandbox.git_exec('git config user.email "agent@gemini.local"', clone_dir)

        context = gh.get_repo_context(clone_dir)

        # Auto-provision env files and secrets for known repos
        import shutil
        env_note = ''
        if slug == 'purposely/purposely-web':
            # Mark session as work so it appears under Work in the sidebar
            if session:
                from .models import Session as _Session
                _Session.objects.filter(pk=session.pk).update(is_work=True)
            env_src = Path.home() / '.work-envs' / 'purposely-backend.env'
            env_dst = clone_dir / 'backend' / '.env'
            if env_src.exists() and not env_dst.exists():
                env_dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(env_src, env_dst)
                env_note += '\nEnv file auto-copied to backend/.env — DATABASE_URL host already set to db for Docker Compose.'
            secrets_src = Path.home() / '.work-envs' / 'purposely-secrets'
            secrets_dst = clone_dir / 'dev_setup' / 'secrets'
            if secrets_src.exists():
                secrets_dst.mkdir(parents=True, exist_ok=True)
                for secret_file in secrets_src.iterdir():
                    dst_file = secrets_dst / secret_file.name
                    if not dst_file.exists():
                        shutil.copy2(secret_file, dst_file)
                env_note += '\nCloudflare tunnel secrets auto-copied to dev_setup/secrets/.'

        return f'Cloned {slug} into {clone_dir.name}/ ({source})\n\n{context}{env_note}'

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
        branch_result = sandbox.git_exec('git rev-parse --abbrev-ref HEAD', git_root)
        current_branch = (branch_result.get('stdout') or '').strip()
        if current_branch in ('main', 'master'):
            return f'Error: pushing directly to {current_branch} is not allowed. Create a branch first with git_branch, then push and open a PR.'
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

    elif tool_name == 'read_user_context':
        from .models import UserContext
        ctx = UserContext.get()
        return ctx.content if ctx.content.strip() else 'No user context stored yet.'

    elif tool_name == 'update_user_context':
        from .models import UserContext
        ctx = UserContext.get()
        ctx.content = _upsert_section(ctx.content, args['section'], args['content'])
        ctx.save()
        return f'Updated "{args["section"]}" in user context.'

    elif tool_name == 'read_repo_memory':
        from .models import RepoMemory
        try:
            rm = RepoMemory.objects.get(repo=args['repo'])
            return rm.content if rm.content.strip() else 'No knowledge stored for this repo yet.'
        except RepoMemory.DoesNotExist:
            return 'No knowledge stored for this repo yet.'

    elif tool_name == 'update_repo_memory':
        from .models import RepoMemory
        repo = args['repo']
        section = args['section'].strip()
        content = args['content'].strip()
        rm, _ = RepoMemory.objects.get_or_create(repo=repo)
        rm.content = _upsert_section(rm.content, section, content)
        rm.save()
        return f'Updated "{section}" in {repo} knowledge base.'

    elif tool_name == 'spawn_task':
        if not session:
            return 'Error: no session context available.'
        try:
            project = session.as_project
        except Exception:
            return 'Error: this session is not a project orchestrator.'

        from .models import Session as SessionModel, GlobalEvent
        task_session = SessionModel.objects.create(
            title=args['title'],
            project=project,
            session_role='task',
        )

        import threading
        from . import agent_loop as _agent_loop
        import django.db

        def _run_task():
            try:
                for _ in _agent_loop.run(task_session, args['prompt']):
                    pass
            except Exception:
                pass
            finally:
                django.db.close_old_connections()

        threading.Thread(target=_run_task, daemon=True).start()

        try:
            GlobalEvent.objects.create(
                session=session,
                event_type='task_spawned',
                data={'task_session_id': str(task_session.id), 'title': args['title']},
            )
        except Exception:
            pass

        return f'Task spawned: "{args["title"]}" — session ID {task_session.id}. Running in background.'

    elif tool_name == 'list_project_tasks':
        if not session:
            return 'No session context.'
        try:
            project = session.as_project
        except Exception:
            return 'Not a project orchestrator.'
        tasks = project.tasks.all()
        if not tasks.exists():
            return 'No tasks spawned yet.'
        lines = []
        for t in tasks:
            msg_count = t.messages.count()
            lines.append(f'- **{t.title}** ({msg_count} message{"s" if msg_count != 1 else ""}) — id: {t.id}')
        return '\n'.join(lines)

    elif tool_name == 'start_process':
        import subprocess, uuid as _uuid
        from .models import Process as ProcessModel, GlobalEvent
        label = args['label']
        command = args['command']
        port = args.get('port')
        cwd_rel = args.get('cwd', '')
        work_dir = (session_dir / cwd_rel) if cwd_rel else session_dir
        work_dir.mkdir(parents=True, exist_ok=True)
        log_dir = Path(settings.MEDIA_ROOT) / 'process_logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f'{_uuid.uuid4().hex[:12]}.log'
        try:
            log_fh = open(log_path, 'w')
            proc = subprocess.Popen(
                command, shell=True, cwd=str(work_dir),
                stdout=log_fh, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except Exception as e:
            return f'Failed to start process: {e}'
        db_proc = ProcessModel.objects.create(
            session=session, label=label, command=command, cwd=str(work_dir),
            port=port, pid=proc.pid, status='running', log_file=str(log_path),
        )
        if session:
            try:
                GlobalEvent.objects.create(
                    session=session, event_type='process_started',
                    data={'process_id': db_proc.id, 'label': label, 'port': port, 'pid': proc.pid},
                )
            except Exception:
                pass
        url_str = f' — available on port {port}' if port else ''
        return f'Started "{label}" (PID {proc.pid}, process_id {db_proc.id}){url_str}'

    elif tool_name == 'stop_process':
        import signal as _signal, os as _os
        from django.utils import timezone
        from .models import Process as ProcessModel, GlobalEvent
        process_id = int(args['process_id'])
        try:
            db_proc = ProcessModel.objects.get(id=process_id)
        except ProcessModel.DoesNotExist:
            return f'Process {process_id} not found.'
        if db_proc.pid:
            try:
                _os.killpg(_os.getpgid(db_proc.pid), _signal.SIGTERM)
            except (ProcessLookupError, OSError):
                pass
        db_proc.status = 'stopped'
        db_proc.stopped_at = timezone.now()
        db_proc.save()
        if session:
            try:
                GlobalEvent.objects.create(
                    session=session, event_type='process_stopped',
                    data={'process_id': db_proc.id, 'label': db_proc.label},
                )
            except Exception:
                pass
        return f'Stopped "{db_proc.label}".'

    elif tool_name == 'list_processes':
        import os as _os
        from .models import Process as ProcessModel
        qs = ProcessModel.objects.filter(session=session).order_by('-started_at')[:20] if session else ProcessModel.objects.order_by('-started_at')[:20]
        if not qs.exists():
            return 'No processes.'
        lines = []
        for p in qs:
            if p.status == 'running' and p.pid:
                try:
                    _os.kill(p.pid, 0)
                except (ProcessLookupError, OSError):
                    p.status = 'crashed'
                    p.save(update_fields=['status'])
            url_str = f' — port {p.port}' if p.port else ''
            lines.append(f'[id={p.id}] {p.label} ({p.status}){url_str} | PID {p.pid} | {p.command}')
        return '\n'.join(lines)

    elif tool_name == 'submit_plan':
        # Handled specially in agent_loop — dispatch should never be called for this
        return 'Plan submitted.'

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
