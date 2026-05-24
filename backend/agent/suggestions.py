"""
Action item generation — calls Gemini with structured JSON output.
Maintains 8 active slots (4 work + 4 personal) plus a queue of ~8.

Daily refresh:
  1. Promote queued items to fill active slots
  2. Generate enough new items to keep queue at ~8
  3. New items go to the back of the queue
"""
import json
import logging

from django.conf import settings
from django.utils import timezone
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

TARGET_ACTIVE = 8
TARGET_QUEUE  = 8
WORK_SLOTS    = 4
PERSONAL_SLOTS = 4


def _build_context() -> str:
    from .models import UserContext, RepoMemory, ActionItem, Session, GlobalEvent

    parts = []

    ctx = UserContext.get()
    if ctx.content.strip():
        parts.append(f"## About the user\n{ctx.content}")
    else:
        parts.append("## About the user\nNo profile yet — infer from activity.")

    try:
        rm = RepoMemory.objects.get(repo='purposely/purposely-web')
        if rm.content.strip():
            parts.append(f"## Work repo knowledge (purposely/purposely-web)\n{rm.content}")
    except RepoMemory.DoesNotExist:
        pass

    # Recent sessions (last 14 days)
    recent = Session.objects.filter(
        created_at__gte=timezone.now() - timezone.timedelta(days=14)
    ).order_by('-created_at')[:20]
    if recent:
        lines = [f"- {s.title or 'Untitled'} ({'work' if s.is_work else 'personal'})" for s in recent]
        parts.append("## Recent sessions\n" + '\n'.join(lines))

    # Dismissed titles — so the AI avoids re-suggesting them
    dismissed = ActionItem.objects.filter(status='dismissed').values_list('title', flat=True)[:40]
    if dismissed:
        parts.append("## Previously dismissed (do not re-suggest)\n" + '\n'.join(f"- {t}" for t in dismissed))

    return '\n\n'.join(parts)


def _call_gemini(context: str, n_work: int, n_personal: int) -> list[dict]:
    if n_work + n_personal == 0:
        return []

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""You are generating actionable suggestion items for a developer dashboard.

{context}

Generate exactly {n_work} work-related and {n_personal} personal suggestions.

Work suggestions should be about the purposely-web codebase: code quality, open PRs, tech debt, patterns noticed, architectural improvements. Be specific — reference real things a software team would care about.

Personal suggestions should feel relevant to a developer's life: new side project ideas, learning opportunities, personal repo maintenance, productivity or workflow improvements, interesting tools or technologies to explore. Keep them grounded and actionable, not generic.

Each suggestion needs:
- title: short, punchy headline (max 10 words)
- description: one sentence explaining the value or what to do
- type: "work" or "personal"
- category: one of repo_health, tech_debt, new_idea, learning, maintenance, workflow, pattern
- repo: repo slug if relevant (e.g. "purposely/purposely-web"), else empty string

Return JSON only."""

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    'items': types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                'title':       types.Schema(type=types.Type.STRING),
                                'description': types.Schema(type=types.Type.STRING),
                                'type':        types.Schema(type=types.Type.STRING),
                                'category':    types.Schema(type=types.Type.STRING),
                                'repo':        types.Schema(type=types.Type.STRING),
                            },
                            required=['title', 'description', 'type', 'category', 'repo'],
                        ),
                    ),
                },
                required=['items'],
            ),
        ),
    )

    if response.usage_metadata:
        u = response.usage_metadata
        try:
            from .models import TokenUsage
            TokenUsage.objects.create(
                session=None,
                source='suggestions',
                input_tokens=getattr(u, 'prompt_token_count', 0) or 0,
                output_tokens=getattr(u, 'candidates_token_count', 0) or 0,
            )
        except Exception:
            pass

    text = response.candidates[0].content.parts[0].text
    return json.loads(text).get('items', [])


def promote_queued_to_active():
    """Move queued items into active slots up to TARGET_ACTIVE."""
    from .models import ActionItem

    active_work     = ActionItem.objects.filter(status='active', type='work').count()
    active_personal = ActionItem.objects.filter(status='active', type='personal').count()

    for type_, current, target in [
        ('work', active_work, WORK_SLOTS),
        ('personal', active_personal, PERSONAL_SLOTS),
    ]:
        needed = target - current
        if needed <= 0:
            continue
        candidates = ActionItem.objects.filter(
            status='queued', type=type_
        ).order_by('queue_position')[:needed]
        for item in candidates:
            item.status = 'active'
            item.save(update_fields=['status'])


def fill_queue():
    """Generate new items and append to the back of the queue if needed."""
    from .models import ActionItem, UserContext

    queued_work     = ActionItem.objects.filter(status='queued', type='work').count()
    queued_personal = ActionItem.objects.filter(status='queued', type='personal').count()

    n_work     = max(0, TARGET_QUEUE // 2 - queued_work)
    n_personal = max(0, TARGET_QUEUE // 2 - queued_personal)

    if n_work + n_personal == 0:
        return

    context = _build_context()
    try:
        items = _call_gemini(context, n_work, n_personal)
    except Exception:
        logger.exception('Suggestion generation failed')
        return

    max_pos = ActionItem.objects.filter(
        status='queued'
    ).aggregate(m=__import__('django.db.models', fromlist=['Max']).Max('queue_position'))['m'] or 0

    for i, item in enumerate(items):
        if item.get('type') not in ('work', 'personal'):
            continue
        ActionItem.objects.create(
            title=item.get('title', '')[:255],
            description=item.get('description', ''),
            type=item['type'],
            category=item.get('category', ''),
            repo=item.get('repo', ''),
            status='queued',
            queue_position=max_pos + i + 1,
        )

    UserContext.get()  # ensure singleton exists
    UserContext.objects.filter(id=1).update(suggestions_generated_at=timezone.now())


def daily_refresh():
    """Full daily cycle: promote queued → active, then top up the queue."""
    promote_queued_to_active()
    fill_queue()
    # Second promote pass in case queue had enough to fill active slots
    promote_queued_to_active()
