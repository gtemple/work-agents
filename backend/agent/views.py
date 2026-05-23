import hashlib
import hmac
import json
from pathlib import Path
from django.conf import settings
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Session, Message, Memory, Schedule, TokenUsage
from . import agent_loop
from . import approval as approval_mod


@csrf_exempt
@require_http_methods(['POST'])
def create_session(request):
    data = json.loads(request.body or '{}')
    session = Session.objects.create(title=data.get('title', ''), system_prompt=data.get('system_prompt', ''))
    return JsonResponse({'id': str(session.id), 'title': session.title, 'system_prompt': session.system_prompt, 'created_at': session.created_at.isoformat()})


@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def get_session(request, session_id):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    if request.method == 'PATCH':
        data = json.loads(request.body or '{}')
        if 'system_prompt' in data:
            session.system_prompt = data['system_prompt']
        if 'title' in data:
            session.title = data['title']
        session.save()
        return JsonResponse({'ok': True})

    messages = []
    for msg in session.messages.all():
        steps = [{'step_type': s.step_type, 'data': s.data} for s in msg.steps.all()]
        messages.append({
            'id': msg.id,
            'role': msg.role,
            'content': msg.content,
            'steps': steps,
            'created_at': msg.created_at.isoformat(),
        })

    return JsonResponse({
        'id': str(session.id),
        'title': session.title,
        'system_prompt': session.system_prompt,
        'messages': messages,
    })


@require_http_methods(['GET'])
def list_sessions(request):
    sessions = Session.objects.all()
    return JsonResponse({'sessions': [
        {
            'id': str(s.id), 'title': s.title, 'system_prompt': s.system_prompt,
            'created_at': s.created_at.isoformat(),
            'input_tokens': s.input_tokens, 'output_tokens': s.output_tokens,
            'is_work': s.is_work,
            'linear_issue_key': s.linear_issue_key,
            'linear_issue_url': s.linear_issue_url,
            'linear_task_type': s.linear_task_type,
        }
        for s in sessions
    ]})


@csrf_exempt
@require_http_methods(['POST'])
def upload_files(request, session_id):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    session_dir = Path(settings.MEDIA_ROOT) / 'sessions' / str(session.id)
    session_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for f in request.FILES.values():
        dest = session_dir / f.name
        with open(dest, 'wb') as out:
            for chunk in f.chunks():
                out.write(chunk)
        saved.append(f.name)

    return JsonResponse({'uploaded': saved})


@require_http_methods(['GET'])
def stream_agent(request, session_id):
    prompt = request.GET.get('prompt', '').strip()
    if not prompt:
        return JsonResponse({'error': 'prompt required'}, status=400)

    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    Message.objects.create(session=session, role='user', content=prompt)

    if not session.title:
        session.title = prompt[:60]
        session.save(update_fields=['title'])

    def event_stream():
        try:
            for event in agent_loop.run(session, prompt):
                yield f'data: {json.dumps(event)}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"type": "error", "payload": {"message": str(e)}})}\n\n'

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


# ── Approval ──────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def approve_action(request, session_id):
    data = json.loads(request.body or '{}')
    approved = data.get('approved', False)
    approval_mod.respond(session_id, approved)
    return JsonResponse({'ok': True})


# ── Memory ────────────────────────────────────────────────────────────────────

@require_http_methods(['GET'])
def list_memories(request):
    memories = Memory.objects.all()
    return JsonResponse({'memories': [
        {'key': m.key, 'value': m.value, 'updated_at': m.updated_at.isoformat()}
        for m in memories
    ]})


@csrf_exempt
@require_http_methods(['POST', 'DELETE'])
def memory_detail(request, key):
    if request.method == 'DELETE':
        Memory.objects.filter(key=key).delete()
        return JsonResponse({'ok': True})
    data = json.loads(request.body or '{}')
    obj, _ = Memory.objects.update_or_create(key=key, defaults={'value': data.get('value', '')})
    return JsonResponse({'key': obj.key, 'value': obj.value, 'updated_at': obj.updated_at.isoformat()})


# ── Stats ─────────────────────────────────────────────────────────────────────

@require_http_methods(['GET'])
def get_stats(request):
    from django.db.models import Sum, Count
    from django.db.models.functions import TruncDate

    totals = TokenUsage.objects.aggregate(
        total_input=Sum('input_tokens'),
        total_output=Sum('output_tokens'),
        total_turns=Count('id'),
    )

    top_sessions = (
        Session.objects
        .filter(input_tokens__gt=0)
        .order_by('-input_tokens', '-output_tokens')[:10]
    )

    daily = (
        TokenUsage.objects
        .annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(input=Sum('input_tokens'), output=Sum('output_tokens'), turns=Count('id'))
        .order_by('date')
    )

    return JsonResponse({
        'summary': {
            'total_input_tokens': totals['total_input'] or 0,
            'total_output_tokens': totals['total_output'] or 0,
            'total_turns': totals['total_turns'] or 0,
            'total_sessions': Session.objects.count(),
        },
        'top_sessions': [
            {
                'id': str(s.id), 'title': s.title or 'Untitled',
                'input_tokens': s.input_tokens, 'output_tokens': s.output_tokens,
                'created_at': s.created_at.isoformat(),
            }
            for s in top_sessions
        ],
        'daily': [
            {
                'date': row['date'].isoformat(),
                'input_tokens': row['input'],
                'output_tokens': row['output'],
                'turns': row['turns'],
            }
            for row in daily
        ],
    })


# ── Linear webhook ────────────────────────────────────────────────────────────

TASK_TYPE_LABELS = {
    'bug': 'bug_fix',
    'fix': 'bug_fix',
    'test': 'test',
    'refactor': 'refactor',
    'chore': 'refactor',
}


@csrf_exempt
@require_http_methods(['POST'])
def linear_webhook(request):
    secret = settings.LINEAR_WEBHOOK_SECRET
    if secret:
        sig = request.headers.get('Linear-Signature', '')
        expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return JsonResponse({'error': 'Invalid signature'}, status=401)

    data = json.loads(request.body or '{}')
    if data.get('type') != 'Issue' or data.get('action') not in ('create', 'update'):
        return JsonResponse({'received': True, 'processed': False})

    issue = data.get('data', {})
    labels = [l.get('name', '').lower() for l in (issue.get('labels') or [])]

    task_type = 'feature'
    for label_word, t in TASK_TYPE_LABELS.items():
        if any(label_word in l for l in labels):
            task_type = t
            break

    issue_id = issue.get('id')
    issue_key = issue.get('identifier', '')
    title = issue.get('title', '')
    description = issue.get('description', '') or ''
    url = issue.get('url', '')

    if not issue_id:
        return JsonResponse({'received': True, 'processed': False, 'reason': 'No issue id'})

    session, created = Session.objects.update_or_create(
        linear_issue_id=issue_id,
        defaults={
            'title': f'{issue_key}: {title}',
            'is_work': True,
            'linear_issue_key': issue_key,
            'linear_issue_url': url,
            'linear_task_type': task_type,
            'system_prompt': f'**{issue_key} — {title}**\n\n{description}'.strip(),
        },
    )

    return JsonResponse({
        'received': True, 'processed': True,
        'session_id': str(session.id), 'created': created,
    })


# ── Schedules ─────────────────────────────────────────────────────────────────

def _schedule_dict(s):
    return {
        'id': s.id,
        'name': s.name,
        'prompt': s.prompt,
        'system_prompt': s.system_prompt,
        'interval_minutes': s.interval_minutes,
        'enabled': s.enabled,
        'last_run': s.last_run.isoformat() if s.last_run else None,
        'next_run': s.next_run.isoformat(),
        'created_at': s.created_at.isoformat(),
    }


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def list_schedules(request):
    if request.method == 'POST':
        from django.utils import timezone
        from datetime import timedelta
        data = json.loads(request.body or '{}')
        interval = int(data.get('interval_minutes', 1440))
        schedule = Schedule.objects.create(
            name=data['name'],
            prompt=data['prompt'],
            system_prompt=data.get('system_prompt', ''),
            interval_minutes=interval,
            next_run=timezone.now() + timedelta(minutes=interval),
        )
        return JsonResponse(_schedule_dict(schedule))
    return JsonResponse({'schedules': [_schedule_dict(s) for s in Schedule.objects.all()]})


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def schedule_detail(request, schedule_id):
    try:
        schedule = Schedule.objects.get(id=schedule_id)
    except Schedule.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'DELETE':
        schedule.delete()
        return JsonResponse({'ok': True})
    data = json.loads(request.body or '{}')
    for field in ('name', 'prompt', 'system_prompt', 'interval_minutes', 'enabled'):
        if field in data:
            setattr(schedule, field, data[field])
    schedule.save()
    return JsonResponse(_schedule_dict(schedule))
