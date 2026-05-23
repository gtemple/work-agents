import json
from pathlib import Path
from django.conf import settings
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Session, Message, Memory, Schedule
from . import token_store
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
        {'id': str(s.id), 'title': s.title, 'system_prompt': s.system_prompt, 'created_at': s.created_at.isoformat()}
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


# ── Tokens ────────────────────────────────────────────────────────────────────

@require_http_methods(['GET'])
def get_tokens(request):
    return JsonResponse(token_store.load_all())


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
