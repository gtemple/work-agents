from pathlib import Path
from django.conf import settings
from google import genai
from google.genai import types
from . import tools
from . import approval

GATED_TOOLS = {'git_push', 'create_pr', 'post_pr_review'}
PLAN_TOOLS = {'submit_plan'}


def _save_global_event(session, event_type: str, data: dict):
    from .models import GlobalEvent
    try:
        GlobalEvent.objects.create(session=session, event_type=event_type, data=data)
    except Exception:
        pass

BASE_SYSTEM_PROMPT = """You are an expert coding assistant. You can read and write files, run code, execute bash commands, search the web, interact with GitHub repositories, and read/write persistent memory.

When working on a task:
- Always explain what you're doing before and after each step
- Use tools to verify your work (run code to test it)
- If a task has multiple steps, work through them systematically
- When writing code, prefer clarity and correctness over brevity

When starting web apps or servers with start_process:
- ALWAYS bind to 0.0.0.0 (not 127.0.0.1 or localhost) so the app is reachable from other devices on the network
- For Flask: app.run(host='0.0.0.0', port=...) or pass --host 0.0.0.0 as a flag
- For Node/Vite/other servers: set the host to 0.0.0.0 in the config or via CLI flag
- For Docker Compose apps: only start the app if the task requires verifying runtime behaviour (e.g. integration tests, checking an API response, visual verification). Don't spin it up just to make a code change or open a PR. If you do need to run it, use `PATH=/usr/local/bin:/usr/bin:/bin docker compose -p session-<short_session_id> up -d --build` with a free port, and always `docker compose -p session-<short_session_id> down` when you're done.
- Confirm the port in the start_process call so a clickable URL appears in the dashboard

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
3. Set up the env file by running this bash command (replacing <repo> with the actual cloned path):
   bash("cp /Users/giordanotemple/.work-envs/purposely-backend.env <repo>/backend/.env")
   Then fix DATABASE_URL in that file: replace 127.0.0.1 with the postgres service name from docker-compose.yml
4. Explore the relevant files — use list_files, bash("find ..."), and read key files
5. If you discover architecture patterns, conventions, or gotchas not already in the knowledge base, call update_repo_memory() to save them
6. Call submit_plan with a concrete plan listing exactly which files you will change and the ordered steps
7. Wait for plan approval, then proceed with implementation

Only spin up Docker Compose if the task requires verifying runtime behaviour — most code changes do not need it.
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


def run(session, prompt: str, skip_gated: bool = False):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(session, 'model', None) or settings.GEMINI_MODEL

    history = []
    for msg in session.messages.all():
        role = 'model' if msg.role == 'assistant' else 'user'
        history.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    session_dir = _session_dir(session.id)
    if session_dir.exists():
        context_parts = []
        files = [f.name for f in session_dir.iterdir() if f.is_file()]
        if files:
            context_parts.append(f'Uploaded files: {", ".join(files)}')
        dirs = [d.name for d in session_dir.iterdir() if d.is_dir() and (d / '.git').exists()]
        if dirs:
            context_parts.append(f'Cloned repos: {", ".join(dirs)}')
        if context_parts:
            prompt = f'[Session context — {"; ".join(context_parts)}]\n\n{prompt}'

    history.append(types.Content(role='user', parts=[types.Part(text=prompt)]))

    agent_steps = []
    total_input_tokens = 0
    total_output_tokens = 0
    # Snapshot the session's existing token totals so mid-run saves don't double-count
    base_input_tokens  = session.input_tokens
    base_output_tokens = session.output_tokens

    while True:
        response = client.models.generate_content(
            model=model,
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=_compose_system_prompt(session),
                tools=[_build_tool_config()],
            ),
        )

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

        candidate = response.candidates[0]
        content = candidate.content

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
                    yield {'type': 'approval_rejected', 'payload': {'tool': tool_name}}
                else:
                    result_text = 'Plan approved. Proceed with implementation.'
                    yield {'type': 'approval_granted', 'payload': {'tool': tool_name}}

            elif tool_name in GATED_TOOLS and not skip_gated:
                _save_global_event(session, 'approval_required', {'tool': tool_name, 'args': args})
                yield {'type': 'approval_required', 'payload': {'tool': tool_name, 'args': args}}
                approved = approval.wait_for_approval(session.id)
                if not approved:
                    result_text = f'Action "{tool_name}" was rejected by the user.'
                    yield {'type': 'approval_rejected', 'payload': {'tool': tool_name}}
                else:
                    yield {'type': 'approval_granted', 'payload': {'tool': tool_name}}
                    yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                    agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                    _save_global_event(session, 'tool_call', {'tool': tool_name, 'args': args})
                    result_text = tools.dispatch(tool_name, args, session_dir, settings.GITHUB_TOKEN, session=session)
                    yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                    agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})

            else:
                yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                _save_global_event(session, 'tool_call', {'tool': tool_name, 'args': args})
                result_text = tools.dispatch(tool_name, args, session_dir, settings.GITHUB_TOKEN, session=session)
                yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})

            tool_response_parts.append(types.Part(
                function_response=types.FunctionResponse(
                    name=tool_name,
                    response={'result': result_text},
                )
            ))

        history.append(types.Content(role='user', parts=tool_response_parts))
