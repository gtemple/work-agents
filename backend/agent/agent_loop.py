from pathlib import Path
from django.conf import settings
from google import genai
from google.genai import types
from . import tools

SYSTEM_PROMPT = """You are an expert coding assistant. You can read and write files, run code, execute bash commands, and interact with GitHub repositories.

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
- After pushing, use create_pr to open the pull request"""


def _session_dir(session_id) -> Path:
    return Path(settings.MEDIA_ROOT) / 'sessions' / str(session_id)


def _build_tool_config():
    return types.Tool(function_declarations=[
        types.FunctionDeclaration(**decl) for decl in tools.DECLARATIONS
    ])


def run(session, prompt: str):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    history = []
    for msg in session.messages.all():
        role = 'model' if msg.role == 'assistant' else 'user'
        history.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    session_dir = _session_dir(session.id)
    if session_dir.exists():
        files = [f.name for f in session_dir.iterdir() if f.is_file()]
        if files:
            prompt = f'[Available files in session: {", ".join(files)}]\n\n{prompt}'

    history.append(types.Content(role='user', parts=[types.Part(text=prompt)]))

    agent_steps = []

    while True:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=[_build_tool_config()],
            ),
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
            yield {'type': 'done', 'payload': {'message_id': assistant_msg.id}}
            return

        history.append(content)

        tool_response_parts = []
        for part in function_calls:
            fc = part.function_call
            tool_name = fc.name
            args = dict(fc.args)

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
