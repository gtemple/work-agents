import json
import threading
import time
import logging

logger = logging.getLogger(__name__)
_thread = None


def _generate_daily_digest(date_str: str):
    """Summarise yesterday's sessions into a markdown digest and store in Memory."""
    from datetime import date, timedelta, datetime, timezone as dt_tz
    from django.conf import settings
    from google import genai
    from .models import Session, AgentStep, Memory, TokenUsage

    yesterday_start = datetime.combine(
        date.today() - timedelta(days=1),
        datetime.min.time(),
    ).replace(tzinfo=dt_tz.utc)
    today_start = datetime.combine(
        date.today(), datetime.min.time()
    ).replace(tzinfo=dt_tz.utc)

    sessions = Session.objects.filter(
        created_at__gte=yesterday_start,
        created_at__lt=today_start,
    ).order_by('created_at')

    if not sessions.exists():
        return

    lines = []
    for s in sessions:
        step_count = AgentStep.objects.filter(message__session=s).count()
        tag = 'work' if s.is_work else 'personal'
        title = s.title or 'Untitled'
        lines.append(f"- [{tag}] {title} — {step_count} steps")

    session_summary = '\n'.join(lines)

    prompt = f"""You are writing a short daily digest for a developer dashboard.

Here are the AI agent sessions from yesterday ({date_str}):

{session_summary}

Return JSON with two fields:
- headline: one punchy sentence (max 12 words) summarising the day — what was the main thing that happened? Be specific, not generic.
- content: a concise markdown digest (3–5 short sections max). Use these headings as relevant: ### Shipped, ### In progress, ### Notes. Keep each bullet to one line. Be specific — use the session titles. No filler. No intro sentence."""

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    from google.genai import types
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    'headline': types.Schema(type=types.Type.STRING),
                    'content':  types.Schema(type=types.Type.STRING),
                },
                required=['headline', 'content'],
            ),
        ),
    )

    if response.usage_metadata:
        u = response.usage_metadata
        try:
            TokenUsage.objects.create(
                session=None, source='digest',
                input_tokens=getattr(u, 'prompt_token_count', 0) or 0,
                output_tokens=getattr(u, 'candidates_token_count', 0) or 0,
            )
        except Exception:
            pass

    result = json.loads(response.candidates[0].content.parts[0].text)
    value = json.dumps({'date': date_str, 'headline': result.get('headline', ''), 'content': result.get('content', '')})
    Memory.objects.update_or_create(key=f'daily_digest_{date_str}', defaults={'value': value})


def _loop():
    # Wait for Django to finish starting up
    time.sleep(5)
    while True:
        try:
            from django.utils import timezone
            from datetime import date, timedelta
            from .models import Schedule, Session, UserContext, Memory
            from . import agent_loop
            from . import suggestions as sug

            # Always promote queued items into open slots
            sug.promote_queued_to_active()

            # Daily action-item refresh (fill queue + re-promote)
            ctx = UserContext.get()
            if (
                ctx.suggestions_generated_at is None
                or (timezone.now() - ctx.suggestions_generated_at).total_seconds() > 86400
            ):
                try:
                    sug.daily_refresh()
                except Exception:
                    logger.exception('Action item refresh failed')

            # Daily digest — generate once per day after 8am
            now_local = timezone.now().astimezone()
            if now_local.hour >= 8:
                today_str = date.today().isoformat()
                digest_done = Memory.objects.filter(key=f'daily_digest_{today_str}').exists()
                if not digest_done:
                    try:
                        _generate_daily_digest(today_str)
                    except Exception:
                        logger.exception('Daily digest generation failed')

            now = timezone.now()
            for schedule in Schedule.objects.filter(enabled=True, next_run__lte=now):
                session = Session.objects.create(
                    title=f'[Scheduled] {schedule.name}',
                    system_prompt=schedule.system_prompt,
                )
                try:
                    for _ in agent_loop.run(session, schedule.prompt):
                        pass
                except Exception:
                    logger.exception('Scheduled agent failed: %s', schedule.name)

                schedule.last_run = now
                schedule.next_run = now + timedelta(minutes=schedule.interval_minutes)
                schedule.save(update_fields=['last_run', 'next_run'])
        except Exception:
            logger.exception('Scheduler loop error')

        time.sleep(60)


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_loop, daemon=True, name='agent-scheduler')
    _thread.start()
