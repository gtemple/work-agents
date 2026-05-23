from pathlib import Path
from django.conf import settings
from google import genai
from google.genai import types
from . import tools
from . import approval
from . import token_store

GATED_TOOLS = {'git_push', 'create_pr', 'post_pr_review'}

BASE_SYSTEM_PROMPT = """You are an expert coding assistant. You can read and write files, run code, execute bash commands, search the web, interact with GitHub repositories, and read/write persistent memory.

When working on a task:
- Always explain what you're doing before and after each step
- Use tools to verify your work (run code to test it)
- If a task has multiple steps, work through them systematically
- When writing code, prefer clarity and correctness over brevity

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


def _compose_system_prompt(session) -> str:
    from .models import Memory
    parts = [BASE_SYSTEM_PROMPT]

    if settings.GITHUB_USERNAME:
        parts.append(
            f"## GitHub identity\n"
            f"The user's GitHub username is `{settings.GITHUB_USERNAME}`. "
            f"When they say \"my repo\", \"my account\", or similar, default to this username. "
            f"List repos with: bash(\"curl -s -H 'Authorization: Bearer $GITHUB_TOKEN' "
            f"'https://api.github.com/users/{settings.GITHUB_USERNAME}/repos?per_page=100&sort=updated'\")"
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


def run(session, prompt: str, skip_gated: bool = False):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

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

    while True:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=_compose_system_prompt(session),
                tools=[_build_tool_config()],
            ),
        )

        # Accumulate token usage
        if response.usage_metadata:
            u = response.usage_metadata
            total_input_tokens += getattr(u, 'prompt_token_count', 0) or 0
            total_output_tokens += getattr(u, 'candidates_token_count', 0) or 0
            token_store.update(str(session.id), total_input_tokens, total_output_tokens)
            yield {'type': 'tokens', 'payload': {
                'input': total_input_tokens,
                'output': total_output_tokens,
            }}

        candidate = response.candidates[0]
        content = candidate.content

        function_calls = [
            p for p in content.parts
            if p.function_call and p.function_call.name
        ]

        if not function_calls:
            text = ''.join(p.text for p in content.parts if p.text)
            yield {'type': 'assistant_text', 'payload': {'text': text}}

            from .models import Message, AgentStep
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

            if tool_name in GATED_TOOLS and not skip_gated:
                yield {'type': 'approval_required', 'payload': {'tool': tool_name, 'args': args}}
                approved = approval.wait_for_approval(session.id)
                if not approved:
                    result_text = f'Action "{tool_name}" was rejected by the user.'
                    yield {'type': 'approval_rejected', 'payload': {'tool': tool_name}}
                else:
                    yield {'type': 'approval_granted', 'payload': {'tool': tool_name}}
                    yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                    agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                    result_text = tools.dispatch(tool_name, args, session_dir, settings.GITHUB_TOKEN)
                    yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                    agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})
            else:
                yield {'type': 'tool_call', 'payload': {'tool': tool_name, 'args': args}}
                agent_steps.append({'step_type': 'tool_call', 'data': {'tool': tool_name, 'args': args}})
                result_text = tools.dispatch(tool_name, args, session_dir, settings.GITHUB_TOKEN)
                yield {'type': 'tool_result', 'payload': {'tool': tool_name, 'result': result_text[:2000]}}
                agent_steps.append({'step_type': 'tool_result', 'data': {'tool': tool_name, 'result': result_text}})

            tool_response_parts.append(types.Part(
                function_response=types.FunctionResponse(
                    name=tool_name,
                    response={'result': result_text},
                )
            ))

        history.append(types.Content(role='user', parts=tool_response_parts))
