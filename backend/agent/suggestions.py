"""
Action item generation — calls Gemini with structured JSON output.
Maintains 9 active slots (3 work + 3 personal + 3 repo) plus a queue of ~9.

Daily refresh:
  1. Promote queued items to fill active slots
  2. Generate enough new items to keep queue at ~9
  3. New items go to the back of the queue
"""
import json
import logging
from datetime import datetime, timezone as dt_timezone, timedelta

from django.conf import settings
from django.utils import timezone
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

WORK_SLOTS     = 3
PERSONAL_SLOTS = 3
REPO_SLOTS     = 3
TARGET_QUEUE   = 9


def _log_tokens(input_tokens, output_tokens):
    try:
        from .models import TokenUsage
        TokenUsage.objects.create(
            session=None, source='suggestions',
            input_tokens=input_tokens, output_tokens=output_tokens,
        )
    except Exception:
        pass


def _build_context() -> str:
    from .models import UserContext, RepoMemory, ActionItem, Session

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

    # All sessions — used to avoid re-suggesting things already being worked on
    all_sessions = Session.objects.order_by('-created_at')[:60]
    if all_sessions:
        lines = [f"- {s.title or 'Untitled'} ({'work' if s.is_work else 'personal'})" for s in all_sessions]
        parts.append(
            "## Existing sessions (already being worked on — do NOT suggest anything resembling these)\n"
            + '\n'.join(lines)
        )

    # Active, queued, and saved items — all should be excluded
    existing_items = ActionItem.objects.exclude(status='dismissed').values_list('title', flat=True)[:60]
    dismissed = ActionItem.objects.filter(status='dismissed').values_list('title', flat=True)[:40]
    exclude_titles = list(existing_items) + list(dismissed)
    if exclude_titles:
        parts.append(
            "## Do not re-suggest any of these (already active, saved, queued, or dismissed)\n"
            + '\n'.join(f"- {t}" for t in exclude_titles)
        )

    return '\n\n'.join(parts)


def _fetch_recent_repos() -> list[dict]:
    """Fetch user's GitHub repos updated in the last 12 months."""
    if not settings.GITHUB_TOKEN:
        return []
    import requests
    cutoff = datetime.now(dt_timezone.utc) - timedelta(days=365)
    repos = []
    page = 1
    while True:
        try:
            resp = requests.get(
                'https://api.github.com/user/repos',
                headers={'Authorization': f'token {settings.GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'},
                params={'sort': 'updated', 'per_page': 100, 'page': page},
                timeout=10,
            )
            if resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            for r in batch:
                pushed = r.get('pushed_at') or r.get('updated_at', '')
                try:
                    pushed_dt = datetime.fromisoformat(pushed.replace('Z', '+00:00'))
                except Exception:
                    continue
                if pushed_dt < cutoff:
                    # Results are sorted by updated desc — stop when we hit old ones
                    return repos
                if not r.get('fork', False):
                    repos.append({
                        'name': r['full_name'],
                        'description': r.get('description') or '',
                        'language': r.get('language') or '',
                        'stars': r.get('stargazers_count', 0),
                        'pushed_at': pushed[:10],
                    })
            page += 1
        except Exception:
            break
    return repos


def _call_gemini_work_personal(context: str, n_work: int, n_personal: int) -> list[dict]:
    if n_work + n_personal == 0:
        return []

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    prompt = f"""You are generating actionable suggestion items for a developer dashboard.

{context}

CRITICAL: Do not suggest anything that overlaps with the existing sessions or excluded items listed above — not even a variation or renamed version of the same idea.

Generate exactly {n_work} work-related and {n_personal} personal suggestions.

Work suggestions: purposely-web codebase — code quality, open PRs, tech debt, architectural improvements. Be specific.

Personal suggestions: new side project ideas, learning opportunities, personal repo maintenance, productivity improvements. Keep them grounded and actionable. Must be genuinely different from anything in the existing sessions list.

Each suggestion needs:
- title: short, punchy headline (max 10 words)
- description: one sentence explaining the value or what to do
- type: "work" or "personal"
- category: one of repo_health, tech_debt, new_idea, learning, maintenance, workflow, pattern
- repo: repo slug if relevant (e.g. "purposely/purposely-web"), else empty string
- confidence: float 0.0–1.0. Be calibrated — spread scores, don't cluster around 0.8.

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
                                'confidence':  types.Schema(type=types.Type.NUMBER),
                            },
                            required=['title', 'description', 'type', 'category', 'repo', 'confidence'],
                        ),
                    ),
                },
                required=['items'],
            ),
        ),
    )

    if response.usage_metadata:
        u = response.usage_metadata
        _log_tokens(getattr(u, 'prompt_token_count', 0) or 0, getattr(u, 'candidates_token_count', 0) or 0)

    text = response.candidates[0].content.parts[0].text
    return json.loads(text).get('items', [])


def _call_gemini_repos(repos: list[dict], context: str, n: int) -> list[dict]:
    if not repos or n == 0:
        return []

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    repo_lines = '\n'.join(
        f"- {r['name']} ({r['language']}, last pushed {r['pushed_at']}): {r['description']}"
        for r in repos[:30]
    )

    prompt = f"""You are generating actionable improvement suggestions for a developer's GitHub repositories.

{context}

## The user's recently active repos (updated in last 12 months)
{repo_lines}

Generate exactly {n} suggestions — each one tied to a specific repo from the list above.

Suggestions should be concrete improvements, new features, refactors, documentation, tests, or CI/CD improvements that would genuinely add value. Pick repos where you can make a specific, meaningful suggestion based on the repo name, description, and language.

Each suggestion needs:
- title: short, punchy headline (max 10 words)
- description: one sentence explaining the specific improvement and its value
- type: "repo"
- category: one of repo_health, tech_debt, new_idea, learning, maintenance, workflow, pattern
- repo: the full repo slug (e.g. "gtemple/some-repo")
- confidence: float 0.0–1.0 reflecting how actionable this is given what you know. Be calibrated.

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
                                'confidence':  types.Schema(type=types.Type.NUMBER),
                            },
                            required=['title', 'description', 'type', 'category', 'repo', 'confidence'],
                        ),
                    ),
                },
                required=['items'],
            ),
        ),
    )

    if response.usage_metadata:
        u = response.usage_metadata
        _log_tokens(getattr(u, 'prompt_token_count', 0) or 0, getattr(u, 'candidates_token_count', 0) or 0)

    text = response.candidates[0].content.parts[0].text
    items = json.loads(text).get('items', [])
    # Ensure type is set correctly
    for item in items:
        item['type'] = 'repo'
    return items


def promote_queued_to_active():
    from .models import ActionItem

    for type_, target in [('work', WORK_SLOTS), ('personal', PERSONAL_SLOTS), ('repo', REPO_SLOTS)]:
        current = ActionItem.objects.filter(status='active', type=type_).count()
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
    from .models import ActionItem, UserContext

    queued_work     = ActionItem.objects.filter(status='queued', type='work').count()
    queued_personal = ActionItem.objects.filter(status='queued', type='personal').count()
    queued_repo     = ActionItem.objects.filter(status='queued', type='repo').count()

    n_work     = max(0, WORK_SLOTS - queued_work)
    n_personal = max(0, PERSONAL_SLOTS - queued_personal)
    n_repo     = max(0, REPO_SLOTS - queued_repo)

    max_pos = ActionItem.objects.filter(
        status='queued'
    ).aggregate(m=__import__('django.db.models', fromlist=['Max']).Max('queue_position'))['m'] or 0
    offset = 0

    # Work + personal suggestions
    if n_work + n_personal > 0:
        context = _build_context()
        try:
            items = _call_gemini_work_personal(context, n_work, n_personal)
        except Exception:
            logger.exception('Work/personal suggestion generation failed')
            items = []

        for item in items:
            if item.get('type') not in ('work', 'personal'):
                continue
            raw_conf = item.get('confidence')
            confidence = max(0.0, min(1.0, float(raw_conf))) if raw_conf is not None else None
            ActionItem.objects.create(
                title=item.get('title', '')[:255],
                description=item.get('description', ''),
                type=item['type'],
                category=item.get('category', ''),
                repo=item.get('repo', ''),
                confidence=confidence,
                status='queued',
                queue_position=max_pos + offset + 1,
            )
            offset += 1

    # Repo suggestions
    if n_repo > 0:
        try:
            repos = _fetch_recent_repos()
            context = _build_context()
            items = _call_gemini_repos(repos, context, n_repo)
        except Exception:
            logger.exception('Repo suggestion generation failed')
            items = []

        for item in items:
            raw_conf = item.get('confidence')
            confidence = max(0.0, min(1.0, float(raw_conf))) if raw_conf is not None else None
            ActionItem.objects.create(
                title=item.get('title', '')[:255],
                description=item.get('description', ''),
                type='repo',
                category=item.get('category', ''),
                repo=item.get('repo', ''),
                confidence=confidence,
                status='queued',
                queue_position=max_pos + offset + 1,
            )
            offset += 1

    UserContext.get()
    UserContext.objects.filter(id=1).update(suggestions_generated_at=timezone.now())


def daily_refresh():
    promote_queued_to_active()
    fill_queue()
    promote_queued_to_active()
