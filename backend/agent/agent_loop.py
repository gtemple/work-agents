import threading
import queue as _queue
from pathlib import Path
from django.conf import settings
from google import genai
from google.genai import types
from . import tools
from . import approval

GATED_TOOLS = {'git_push', 'create_pr', 'post_pr_review'}
PLAN_TOOLS = {'submit_plan'}

# Session IDs that have been requested to stop
_cancel_requested = set()

def request_cancel(session_id):
    _cancel_requested.add(str(session_id))

def clear_cancel(session_id):
    _cancel_requested.discard(str(session_id))


def _save_global_event(session, event_type: str, data: dict):
    from .models import GlobalEvent
    try:
        GlobalEvent.objects.create(session=session, event_type=event_type, data=data)
    except Exception:
        pass

BASE_SYSTEM_PROMPT = """You are an expert coding assistant running directly on the user's Mac. You are NOT sandboxed — the bash tool executes real shell commands with full access to the local filesystem. You can read and write any file by absolute path, access environment variables, and run any command. Do not refuse bash commands on the grounds of sandboxing or filesystem restrictions.

You can read and write files, run code, execute bash commands, search the web, interact with GitHub repositories, and read/write persistent memory.

When working on a task:
- Always explain what you're doing before and after each step
- Use tools to verify your work (run code to test it)
- If a task has multiple steps, work through them systematically
- When writing code, prefer clarity and correctness over brevity

When the user sends a short status-check message ("hey", "all done?", "did you do it?", "what happened?", "where are we?") — answer concisely based on what you've already done in this conversation. Do NOT restart the task, re-run tools, or repeat work that is already complete.

When starting web apps or servers with start_process:
- ALWAYS bind to 0.0.0.0 (not 127.0.0.1 or localhost) so the app is reachable from other devices on the network
- For Flask: app.run(host='0.0.0.0', port=...) or pass --host 0.0.0.0 as a flag
- For Node/Vite/other servers: set the host to 0.0.0.0 in the config or via CLI flag
- For Docker Compose apps: only start the app if the task requires verifying runtime behaviour (e.g. integration tests, checking an API response, visual verification). Don't spin it up just to make a code change or open a PR. If you do need to run it, use `PATH=/usr/local/bin:/usr/bin:/bin docker compose -p session-<short_session_id> up -d --build` with a free port, and always `docker compose -p session-<short_session_id> down` when you're done.
- Confirm the port in the start_process call so a clickable URL appears in the dashboard

Working directory:
- Every bash command runs inside your session working directory — a private folder just for this session
- Cloned repos appear as subdirectories: after `clone_repo owner/repo`, the code is at `repo-name/` relative to your working dir
- Never use `../` or absolute paths to hunt for files — everything you need is inside your working directory
- If you're unsure what's there, run `bash("ls -F")` to list the working directory, then `bash("ls -F repo-name/")` to explore a cloned repo

For GitHub tasks:
- Start by cloning the repo with clone_repo using "owner/repo" format
- Always create a new branch with git_branch before making changes — never commit directly to main/master
- Use git_status and git_diff to review changes before committing
- Write clear commit messages and PR descriptions that explain what changed and why
- After pushing, use create_pr to open the pull request

For memory:
- Use memory_write to store important facts, decisions, or patterns you discover
- Use memory_read or memory_list to recall stored knowledge before starting a task
- Store things like: architectural decisions, known gotchas, stack versions, team conventions"""

TASK_TYPE_INSTRUCTIONS = {
    'bug_fix': """## Bug fix guidelines
- First identify and explain the root cause before touching any code
- Add a comment in the code explaining why the bug occurred
- Consider edge cases that might cause similar bugs
- Add error handling if it is missing
- Test the fix against the original bug report""",

    'feature': """## Feature development guidelines
- Check if similar functionality exists elsewhere and follow that pattern
- Consider performance implications (database queries, API calls, rendering)
- Plan for edge cases: empty states, loading states, error states
- Keep the same API/interface — don't break dependent code""",

    'refactor': """## Refactoring guidelines
- Preserve ALL existing functionality — do not change behaviour
- Improve code organisation and readability
- Reduce code duplication
- Keep the same public API — don't break dependent code
- Focus on making the code more maintainable""",

    'test': """## Test development guidelines
- Cover happy path, edge cases, and error conditions
- Test boundary values and null/undefined cases
- Use descriptive test names that explain what is being tested
- Follow existing test patterns in the project
- Mock external dependencies (API calls, database)""",
}

ORCHESTRATOR_SYSTEM_PROMPT = """You are a project orchestrator. Your role is to:
1. Discuss the project goals with the user and break them into concrete, scoped subtasks
2. Delegate implementation work by calling spawn_task() — each task runs as an independent agent
3. Monitor progress with list_project_tasks() and report back to the user
4. Synthesize results, identify blockers, and plan next steps

You do NOT write code yourself. You think, plan, and coordinate.

When spawning tasks:
- Each task must be self-contained — the task agent has no memory of this conversation
- Write detailed prompts: include repo, relevant files, exact changes needed, and the approach to take
- Design tasks to be independent so they can run in parallel"""

WORK_SYSTEM_PROMPT_PREFIX = """You are working on a Linear issue for the Purposely codebase.

IMPORTANT: Before writing any code you MUST follow these steps in order:
1. Call read_repo_memory("purposely/purposely-web") to load accumulated knowledge about the codebase
2. Clone the repository with clone_repo("purposely/purposely-web") if not already present
   (env file and tunnel secrets are auto-provisioned on clone — do not copy them manually)
3. Explore the relevant files — use list_files, bash("find ..."), and read key files
4. If you discover architecture patterns, conventions, or gotchas not already in the knowledge base, call update_repo_memory() to save them
5. Call submit_plan with a concrete plan listing exactly which files you will change and the ordered steps
6. Wait for plan approval, then proceed with implementation

If the task requires running the app (integration tests, checking API responses, visual verification):
- FIRST check if the purposely-local stack is already running: `PATH=/usr/local/bin:/usr/bin:/bin docker compose -p purposely-local ps`
- If already running, use it — do NOT start a new stack. Run Django commands with:
  `PATH=/usr/local/bin:/usr/bin:/bin docker compose -p purposely-local exec -T backend python manage.py <command>`
- ALWAYS use `-T` with `docker compose exec` when piping stdin or running non-interactive commands — omitting it causes the command to hang waiting for a TTY
- Only start a new stack if nothing is running. Use project name purposely-local, not a session-specific name.
- Most code changes (edits, PRs, refactors) do NOT need Docker at all.

The repo knowledge base is shared across all agents — keep it accurate and useful for future tasks.
Do not skip the planning step. The user needs to review and approve your plan before you write code."""


def _compose_system_prompt(session) -> str:
    from .models import Memory
    parts = [BASE_SYSTEM_PROMPT]

    if session.session_role == 'orchestrator':
        try:
            project = session.as_project
            parts.append(ORCHESTRATOR_SYSTEM_PROMPT)
            parts.append(f'## Project: {project.title}\n{project.description}')
        except Exception:
            parts.append(ORCHESTRATOR_SYSTEM_PROMPT)

    if session.is_work:
        parts.append(WORK_SYSTEM_PROMPT_PREFIX)
        if session.linear_task_type and session.linear_task_type in TASK_TYPE_INSTRUCTIONS:
            parts.append(TASK_TYPE_INSTRUCTIONS[session.linear_task_type])
        # Pre-load repo knowledge so it's in context from the first turn
        from .models import RepoMemory
        try:
            rm = RepoMemory.objects.get(repo='purposely/purposely-web')
            if rm.content.strip():
                parts.append(f'## Current repo knowledge base (purposely/purposely-web)\n{rm.content}')
        except RepoMemory.DoesNotExist:
            pass

    if settings.GITHUB_USERNAME:
        parts.append(
            f"## GitHub identity\n"
            f"The user's GitHub username is `{settings.GITHUB_USERNAME}`. "
            f"When they say \"my repo\", \"my account\", or similar, default to this username."
        )

    if session.system_prompt.strip():
        parts.append(f"## Session context\n{session.system_prompt.strip()}")

    memories = list(Memory.objects.all()[:30])
    if memories:
        keys = ', '.join(f'"{m.key}"' for m in memories)
        parts.append(
            f"## Persistent memory ({len(memories)} entries)\n"
            f"Available keys: {keys}\n"
            f"Use memory_read(key) to retrieve a value, memory_list() to see all with previews."
        )

    return '\n\n'.join(parts)


def _session_dir(session_id) -> Path:
    return Path(settings.MEDIA_ROOT) / 'sessions' / str(session_id)


def _get_purposely_diff(session_dir: Path) -> str | None:
    """Return git diff origin/main...HEAD for purposely-web if present, else None."""
    from . import sandbox as _sandbox
    purposely_dir = session_dir / 'purposely-web'
    if not purposely_dir.exists():
        return None
    # Confirm remote is purposely-web
    remote = _sandbox.git_exec('git remote get-url origin', purposely_dir)
    if 'purposely-web' not in (remote.get('stdout') or ''):
        return None
    result = _sandbox.git_exec('git diff origin/main...HEAD', purposely_dir)
    diff = (result.get('stdout') or '').strip()
    if not diff:
        # Fall back to uncommitted changes
        result = _sandbox.git_exec('git diff HEAD', purposely_dir)
        diff = (result.get('stdout') or '').strip()
    if not diff:
        return None
    # Truncate to ~12k chars
    if len(diff) > 12000:
        lines = diff.splitlines()
        truncated = '\n'.join(lines[:300])
        truncated += f'\n\n… ({len(lines) - 300} more lines truncated)'
        return truncated
    return diff


def _build_tool_config():
    return types.Tool(function_declarations=[
        types.FunctionDeclaration(**decl) for decl in tools.DECLARATIONS
    ])


def _post_linear_comment(session, text: str):
    if session.is_work and session.linear_issue_id:
        try:
            from . import linear
            linear.post_comment(session.linear_issue_id, text)
        except Exception:
            pass


def _run_tool(tool_name, args, session_dir, session):
    """Run a tool in a background thread, yielding ping events every 15s to keep SSE alive."""
    out = _queue.Queue()
    threading.Thread(
        target=lambda: out.put(tools.dispatch(tool_name, args, session_dir, settings.GITHUB_TOKEN, session=session)),
        daemon=True,
    ).start()
    while True:
        try:
            return out.get(timeout=15)
        except _queue.Empty:
            yield {'type': 'ping', 'payload': {}}


def run(session, prompt: str, skip_gated: bool = False):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(session, 'model', None) or settings.GEMINI_MODEL

    history = []
    messages = list(session.messages.all())
    # Trim history to avoid context overflow (~800k char budget ≈ 200k tokens).
    # Always keep the first message (original task) + as many recent messages as fit.
    CHAR_BUDGET = 800_000
    if messages:
        total = sum(len(m.content) for m in messages)
        if total > CHAR_BUDGET:
            first = messages[:1]
            rest = messages[1:]
            # Drop from the front of the middle until we're under budget
            while rest and sum(len(m.content) for m in first + rest) > CHAR_BUDGET:
                rest = rest[1:]
            messages = first + rest
    for msg in messages:
        role = 'model' if msg.role == 'assistant' else 'user'
        history.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    session_dir = _session_dir(session.id)
    if session_dir.exists():
        context_parts = []
        files = [f.name for f in session_dir.iterdir() if f.is_file()]
        if files:
            context_parts.append(f'Uploaded files: {", ".join(files)}')
        repo_summaries = []
        for d in session_dir.iterdir():
            if not d.is_dir() or not (d / '.git').exists():
                continue
            from . import sandbox as _sandbox
            branch = (_sandbox.git_exec('git branch --show-current', d).get('stdout') or '').strip()
            log = (_sandbox.git_exec('git log --oneline -5', d).get('stdout') or '').strip()
            status = (_sandbox.git_exec('git status --short', d).get('stdout') or '').strip()
            summary = f'Repo: {d.name}/ (branch: {branch or "unknown"})'
            if log:
                summary += f'\nRecent commits:\n{log}'
            if status:
                summary += f'\nUncommitted changes:\n{status}'
            repo_summaries.append(summary)
        if repo_summaries:
            context_parts.append('\n'.join(repo_summaries))
        if context_parts:
            prompt = f'[Session workspace state — pick up where you left off, do not redo completed work]\n{chr(10).join(context_parts)}\n\n{prompt}'

    history.append(types.Content(role='user', parts=[types.Part(text=prompt)]))

    agent_steps = []
    total_input_tokens = 0
    total_output_tokens = 0
    # Snapshot the session's existing token totals so mid-run saves don't double-count
    base_input_tokens  = session.input_tokens
    base_output_tokens = session.output_tokens
    assistant_message_saved = False
    clear_cancel(session.id)

    while True:
        if str(session.id) in _cancel_requested:
            clear_cancel(session.id)
            yield {'type': 'error', 'payload': {'message': 'Stopped by user.'}}
            return

        try:
            response = client.models.generate_content(
                model=model,
                contents=history,
                config=types.GenerateContentConfig(
                    system_instruction=_compose_system_prompt(session),
                    tools=[_build_tool_config()],
                ),
            )
        except Exception as e:
            msg = str(e)
            if '429' in msg or 'RESOURCE_EXHAUSTED' in msg:
                import re, time
                delay = 60
                m = re.search(r'retryDelay.*?(\d+)s', msg)
                if m:
                    delay = int(m.group(1)) + 5
                yield {'type': 'tool_call', 'payload': {'tool': '_rate_limit', 'args': {'retry_in': delay}}}
                time.sleep(delay)
                continue
            raise

        if response.usage_metadata:
            u = response.usage_metadata
            total_input_tokens  += getattr(u, 'prompt_token_count', 0) or 0
            total_output_tokens += getattr(u, 'candidates_token_count', 0) or 0
            # 3.5 Flash: thinking already included in candidates_token_count price
            # 2.5 Flash: thoughts billed separately — add them to output for cost tracking
            if model != 'gemini-3.5-flash':
                total_output_tokens += getattr(u, 'thoughts_token_count', 0) or 0
            yield {'type': 'tokens', 'payload': {
                'input': total_input_tokens,
                'output': total_output_tokens,
            }}
            # Persist after every API call so background runs show live token counts
            # and planning tokens aren't lost if the run stalls waiting for approval.
            # Write absolute value (base + cumulative) to avoid double-counting.
            from .models import Session as _Session
            _Session.objects.filter(pk=session.pk).update(
                input_tokens=base_input_tokens + total_input_tokens,
                output_tokens=base_output_tokens + total_output_tokens,
            )

        if not response.candidates:
            raise ValueError('Gemini returned no candidates — response may have been blocked')

        candidate = response.candidates[0]
        content = candidate.content

        if not content or not content.parts:
            finish_reason = str(getattr(candidate, 'finish_reason', 'unknown'))
            if 'MALFORMED_FUNCTION_CALL' in finish_reason:
                # Gemini generated an invalid tool call — inject a correction and retry
                yield {'type': 'tool_call', 'payload': {'tool': '_retry', 'args': {}}}
                history.append(types.Content(role='user', parts=[types.Part(
                    text='Your last tool call was malformed and could not be parsed. '
                         'Please try again — use the exact tool names and parameter types from the schema.'
                )]))
                continue
            if 'STOP' in finish_reason:
                # Model stopped with no output — treat as empty completed turn
                text = ''
                yield {'type': 'assistant_text', 'payload': {'text': text}}
                from .models import Message, TokenUsage
                assistant_msg = Message.objects.create(session=session, role='assistant', content=text)
                assistant_message_saved = True
                _save_global_event(session, 'done', {'message_id': str(assistant_msg.id)})
                yield {'type': 'done', 'payload': {'message_id': assistant_msg.id,
                    'input_tokens': total_input_tokens, 'output_tokens': total_output_tokens}}
                return
            raise ValueError(f'Gemini returned empty content (finish_reason: {finish_reason})')

        function_calls = [
            p for p in content.parts
            if p.function_call and p.function_call.name
        ]

        if not function_calls:
            text = ''.join(p.text for p in content.parts if p.text)
            yield {'type': 'assistant_text', 'payload': {'text': text}}

            from .models import Message, AgentStep, TokenUsage
            assistant_msg = Message.objects.create(
                session=session,
                role='assistant',
                content=text,
            )
            for i, step in enumerate(agent_steps):
                AgentStep.objects.create(
                    message=assistant_msg,
                    step_type=step['step_type'],
                    data=step['data'],
                    order=i,
                )
            if total_input_tokens or total_output_tokens:
                # Session totals already written after each API call — just log the usage record
                TokenUsage.objects.create(
                    session=session,
                    model=model,
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                )

            assistant_message_saved = True
            _post_linear_comment(session, f'✅ Agent completed turn.\n\n{text[:1000]}')
            _save_global_event(session, 'done', {
                'message_id': str(assistant_msg.id),
                'input_tokens': total_input_tokens,
                'output_tokens': total_output_tokens,
            })

            yield {'type': 'done', 'payload': {
                'message_id': assistant_msg.id,
                'input_tokens': total_input_tokens,
                'output_tokens': total_output_tokens,
            }}
            return

        history.append(content)

        tool_response_parts = []
        for part in function_calls:
            fc = part.function_call
            tool_name = fc.name
            args = dict(fc.args)

            if tool_name in PLAN_TOOLS:
                # Save plan to DB so frontend can discover it without an active SSE connection
                session.pending_plan = args
                session.save(update_fields=['pending_plan'])
                _save_global_event(session, 'plan_ready', args)
                yield {'type': 'plan_ready', 'payload': args}
                approved = approval.wait_for_approval(session.id)
                session.pending_plan = None
                session.save(update_fields=['pending_plan'])
                if not approved:
                    result_text = 'Plan rejected by the user. Revise your approach and submit a new plan.'
                    _save_global_event(session, 'approval_rejected', {'tool': tool_name})
                    yield {'type': 'approval_rejected', 'payload': {'tool': tool_name}}
                else:
                    result_text = 'Plan approved. Proceed with implementation.'
                    _save_global_event(session, 'approval_granted', {'tool': tool_name})
                    yield {'type': 'approval_granted', 'payload': {'tool': tool_name}}

            elif tool_name in GATED_TOOLS and not skip_gated:
                diff = _get_purposely_diff(session_dir)
                approval_payload = {'tool': tool_name, 'args': args}
                if diff:
                    approval_payload['diff'] = diff
                _save_global_event(session, 'approval_required', approval_payload)
                yield {'type': 'approval_required', 'payload': approval_payload}
                approved = approval.wait_for_approval(session.id)
                if not approved:
                    result_text = f'Action "{tool_name}" was rejected by the user.'
                    _save_global_event(session, 'approval_rejected', {'tool': tool_name})
                    yield {'type': 'approval_rejected', 'payload': {'tool': tool_name}}
                else:
                    _save_global_event(session, 'approval_granted', {'tool': tool_name})
                    yield {'type': 'approval_granted', 'payload': {'tool': tool_name}}
                    yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                    agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                    _save_global_event(session, 'tool_call', {'tool': tool_name, 'args': args})
                    result_text = yield from _run_tool(tool_name, args, session_dir, session)
                    yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                    agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})
                    _save_global_event(session, 'tool_result', {'tool': tool_name, 'result': result_text[:500]})

            else:
                yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                _save_global_event(session, 'tool_call', {'tool': tool_name, 'args': args})
                result_text = yield from _run_tool(tool_name, args, session_dir, session)
                yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})
                _save_global_event(session, 'tool_result', {'tool': tool_name, 'result': result_text[:500]})

            if str(session.id) in _cancel_requested:
                clear_cancel(session.id)
                _save_global_event(session, 'error', {'message': 'Stopped by user.'})
                yield {'type': 'error', 'payload': {'message': 'Stopped by user.'}}
                return

            tool_response_parts.append(types.Part(
                function_response=types.FunctionResponse(
                    name=tool_name,
                    response={'result': result_text},
                )
            ))

        history.append(types.Content(role='user', parts=tool_response_parts))
