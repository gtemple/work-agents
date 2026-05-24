import hashlib
import hmac
import json
import threading
import time
from pathlib import Path
from django.conf import settings
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Session, Message, Memory, Schedule, TokenUsage, GlobalEvent, Project
from . import agent_loop
from . import approval as approval_mod


def _start_planning_thread(session):
    """Run the agent in a background thread so it can plan without an active SSE connection."""
    def _run():
        import django.db
        try:
            prompt = (
                "Review this Linear issue carefully and produce an implementation plan. "
                "Explore the codebase as needed, then call submit_plan with your concrete plan."
            )
            for _ in agent_loop.run(session, prompt):
                pass
        except Exception:
            pass
        finally:
            django.db.close_old_connections()

    threading.Thread(target=_run, daemon=True).start()


@csrf_exempt
@require_http_methods(['POST'])
def create_session(request):
    data = json.loads(request.body or '{}')
    from django.conf import settings as _settings
    session = Session.objects.create(
        title=data.get('title', ''),
        system_prompt=data.get('system_prompt', ''),
        model=data.get('model', _settings.GEMINI_MODEL),
    )
    return JsonResponse({'id': str(session.id), 'title': session.title, 'system_prompt': session.system_prompt, 'created_at': session.created_at.isoformat()})


@csrf_exempt
@require_http_methods(['DELETE'])
def delete_session(request, session_id):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    session.delete()
    return JsonResponse({'ok': True})


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
        'pending_plan': session.pending_plan,
    })


@require_http_methods(['GET'])
def list_sessions(request):
    sessions = Session.objects.all()
    max_event_id = GlobalEvent.objects.order_by('-id').values_list('id', flat=True).first() or 0
    return JsonResponse({'sessions': [
        {
            'id': str(s.id), 'title': s.title, 'system_prompt': s.system_prompt,
            'created_at': s.created_at.isoformat(),
            'input_tokens': s.input_tokens, 'output_tokens': s.output_tokens,
            'is_work': s.is_work,
            'linear_issue_key': s.linear_issue_key,
            'linear_issue_url': s.linear_issue_url,
            'linear_task_type': s.linear_task_type,
            'has_pending_plan': s.pending_plan is not None,
            'session_role': s.session_role,
            'project_id': str(s.project_id) if s.project_id else None,
            'model': s.model,
        }
        for s in sessions
    ], 'max_event_id': max_event_id})


@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def user_context(request):
    from .models import UserContext
    ctx = UserContext.get()
    if request.method == 'PATCH':
        data = json.loads(request.body or '{}')
        if 'content' in data:
            ctx.content = data['content']
            ctx.save()
        return JsonResponse({'ok': True})
    return JsonResponse({'content': ctx.content, 'updated_at': ctx.updated_at.isoformat()})


@require_http_methods(['GET'])
def list_repo_memories(request):
    from .models import RepoMemory
    repos = RepoMemory.objects.all().order_by('-updated_at')
    return JsonResponse({'repos': [
        {'repo': r.repo, 'content': r.content, 'updated_at': r.updated_at.isoformat()}
        for r in repos
    ]})


@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def repo_memory_detail(request, repo):
    from .models import RepoMemory
    rm, _ = RepoMemory.objects.get_or_create(repo=repo)
    if request.method == 'PATCH':
        data = json.loads(request.body or '{}')
        if 'content' in data:
            rm.content = data['content']
            rm.save()
        return JsonResponse({'ok': True})
    return JsonResponse({'repo': rm.repo, 'content': rm.content, 'updated_at': rm.updated_at.isoformat()})


def _project_dict(p, include_tasks=False):
    d = {
        'id': str(p.id),
        'title': p.title,
        'description': p.description,
        'orchestrator_id': str(p.orchestrator_id) if p.orchestrator_id else None,
        'created_at': p.created_at.isoformat(),
    }
    if include_tasks:
        d['tasks'] = [
            {
                'id': str(t.id), 'title': t.title,
                'input_tokens': t.input_tokens, 'output_tokens': t.output_tokens,
                'has_pending_plan': t.pending_plan is not None,
            }
            for t in p.tasks.all()
        ]
    return d


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def list_or_create_projects(request):
    if request.method == 'POST':
        data = json.loads(request.body or '{}')
        title = data.get('title', 'New Project')
        description = data.get('description', '')

        orchestrator = Session.objects.create(
            title=title,
            system_prompt=description,
            session_role='orchestrator',
        )
        project = Project.objects.create(
            title=title,
            description=description,
            orchestrator=orchestrator,
        )
        return JsonResponse(_project_dict(project))

    projects = Project.objects.select_related('orchestrator').prefetch_related('tasks')
    return JsonResponse({'projects': [_project_dict(p, include_tasks=True) for p in projects]})


@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def project_detail(request, project_id):
    try:
        project = Project.objects.select_related('orchestrator').prefetch_related('tasks').get(id=project_id)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    if request.method == 'PATCH':
        data = json.loads(request.body or '{}')
        if 'title' in data:
            project.title = data['title']
        if 'description' in data:
            project.description = data['description']
        project.save()
        return JsonResponse({'ok': True})

    return JsonResponse(_project_dict(project, include_tasks=True))


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
def get_events(request):
    after_id = int(request.GET.get('after', 0))
    session_id = request.GET.get('session')
    latest = request.GET.get('latest')

    qs = GlobalEvent.objects.select_related('session').order_by('id')
    if session_id:
        qs = qs.filter(session_id=session_id)

    if latest:
        n = min(int(latest), 500)
        rows = list(qs.order_by('-id')[:n])
        rows.reverse()
    else:
        rows = list(qs.filter(id__gt=after_id)[:200])

    return JsonResponse({'events': [
        {
            'id': e.id,
            'session_id': str(e.session_id),
            'session_title': e.session.title,
            'event_type': e.event_type,
            'data': e.data,
            'created_at': e.created_at.isoformat(),
        }
        for e in rows
    ]})


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

_MODEL_PRICING = {
    'gemini-2.5-flash-lite': {'input': 0.10,  'output': 0.40},
    'gemini-2.5-flash':      {'input': 0.30,  'output': 2.50},
    'gemini-3.5-flash':      {'input': 1.50,  'output': 9.00},
}

def _token_cost(input_tokens, output_tokens, model):
    p = _MODEL_PRICING.get(model, _MODEL_PRICING['gemini-2.5-flash'])
    return (input_tokens / 1e6) * p['input'] + (output_tokens / 1e6) * p['output']


@require_http_methods(['GET'])
def get_stats(request):
    from django.db.models import Sum, Count
    from django.db.models.functions import TruncDate
    from collections import defaultdict

    # Per-model totals
    model_rows = (
        TokenUsage.objects
        .values('model')
        .annotate(input=Sum('input_tokens'), output=Sum('output_tokens'), turns=Count('id'))
    )
    total_input = total_output = total_turns = 0
    total_cost = 0.0
    for row in model_rows:
        i, o = row['input'] or 0, row['output'] or 0
        total_input  += i
        total_output += o
        total_turns  += row['turns'] or 0
        total_cost   += _token_cost(i, o, row['model'] or 'gemini-3.5-flash')

    top_sessions = (
        Session.objects
        .filter(input_tokens__gt=0)
        .order_by('-input_tokens', '-output_tokens')[:10]
    )

    # Daily — aggregate per (date, model) then sum cost by date
    daily_raw = (
        TokenUsage.objects
        .annotate(date=TruncDate('created_at'))
        .values('date', 'model')
        .annotate(input=Sum('input_tokens'), output=Sum('output_tokens'), turns=Count('id'))
        .order_by('date')
    )
    daily_map = defaultdict(lambda: {'input_tokens': 0, 'output_tokens': 0, 'turns': 0, 'cost': 0.0})
    for row in daily_raw:
        d = row['date'].isoformat()
        i, o = row['input'] or 0, row['output'] or 0
        daily_map[d]['input_tokens'] += i
        daily_map[d]['output_tokens'] += o
        daily_map[d]['turns']         += row['turns'] or 0
        daily_map[d]['cost']          += _token_cost(i, o, row['model'] or 'gemini-3.5-flash')

    return JsonResponse({
        'summary': {
            'total_input_tokens': total_input,
            'total_output_tokens': total_output,
            'total_turns': total_turns,
            'total_sessions': Session.objects.count(),
            'total_cost': total_cost,
        },
        'top_sessions': [
            {
                'id': str(s.id), 'title': s.title or 'Untitled',
                'input_tokens': s.input_tokens, 'output_tokens': s.output_tokens,
                'model': s.model,
                'created_at': s.created_at.isoformat(),
            }
            for s in top_sessions
        ],
        'daily': [
            {'date': d, **v}
            for d, v in sorted(daily_map.items())
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

    if created:
        _start_planning_thread(session)

    return JsonResponse({
        'received': True, 'processed': True,
        'session_id': str(session.id), 'created': created,
    })


@require_http_methods(['POST'])
@csrf_exempt
def linear_sync(request):
    """Pull open issues from Linear and create sessions for any not already imported."""
    from . import linear as linear_mod

    data = json.loads(request.body or '{}')
    state_filter = data.get('state', 'open')

    try:
        issues = linear_mod.fetch_issues(state_filter=state_filter)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

    created_count = 0
    skipped_count = 0
    sessions_to_plan = []

    for issue in issues:
        labels = [l.get('name', '').lower() for l in (issue.get('labels') or {}).get('nodes', [])]
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

        session, created = Session.objects.get_or_create(
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
        if created:
            created_count += 1
        else:
            skipped_count += 1

        needs_plan = session.pending_plan is None and not session.messages.exists()
        if needs_plan:
            sessions_to_plan.append(session)

    # Stagger planning threads 8s apart so they don't all hit the API at once
    def _start_staggered(sessions):
        for i, s in enumerate(sessions):
            if i > 0:
                time.sleep(8)
            _start_planning_thread(s)

    if sessions_to_plan:
        threading.Thread(target=_start_staggered, args=[sessions_to_plan], daemon=True).start()

    return JsonResponse({
        'imported': created_count,
        'already_existed': skipped_count,
        'planning': len(sessions_to_plan),
        'total': len(issues),
    })


# ── Schedules ─────────────────────────────────────────────────────────────────

def _action_item_dict(item):
    return {
        'id': item.id,
        'title': item.title,
        'description': item.description,
        'type': item.type,
        'status': item.status,
        'category': item.category,
        'repo': item.repo,
        'session_id': str(item.session_id) if item.session_id else None,
        'confidence': item.confidence,
        'created_at': item.created_at.isoformat(),
    }


@require_http_methods(['GET'])
def list_action_items(request):
    from .models import ActionItem
    active = ActionItem.objects.filter(status='active').order_by('type', 'queue_position')
    saved  = ActionItem.objects.filter(status='saved').order_by('-created_at')
    return JsonResponse({
        'active': [_action_item_dict(i) for i in active],
        'saved':  [_action_item_dict(i) for i in saved],
    })


@csrf_exempt
@require_http_methods(['POST'])
def action_item_act(request, item_id, action):
    from .models import ActionItem
    from . import suggestions as sug

    try:
        item = ActionItem.objects.get(id=item_id)
    except ActionItem.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    def _refill():
        sug.promote_queued_to_active()
        sug.fill_queue()
        sug.promote_queued_to_active()

    if action == 'save':
        item.status = 'saved'
        item.save(update_fields=['status'])
        threading.Thread(target=_refill, daemon=True).start()

    elif action == 'dismiss':
        item.status = 'dismissed'
        item.save(update_fields=['status'])
        threading.Thread(target=_refill, daemon=True).start()

    elif action == 'investigate':
        session = Session.objects.create(
            title=item.title,
            system_prompt=f'{item.title}\n\n{item.description}',
            is_work=(item.type == 'work'),
        )
        item.session = session
        item.status = 'saved'  # keep it accessible in saved list
        item.save(update_fields=['session', 'status'])
        threading.Thread(target=_refill, daemon=True).start()
        return JsonResponse({'session_id': str(session.id)})

    elif action == 'refresh':
        sug.daily_refresh()

    return JsonResponse({'ok': True})


def _process_dict(p):
    return {
        'id': p.id,
        'session_id': str(p.session_id) if p.session_id else None,
        'label': p.label,
        'command': p.command,
        'cwd': p.cwd,
        'port': p.port,
        'pid': p.pid,
        'status': p.status,
        'started_at': p.started_at.isoformat(),
        'stopped_at': p.stopped_at.isoformat() if p.stopped_at else None,
    }


@require_http_methods(['GET'])
def list_processes(request):
    import os
    from .models import Process
    processes = list(Process.objects.all())
    for p in processes:
        if p.status == 'running' and p.pid:
            try:
                os.kill(p.pid, 0)
            except (ProcessLookupError, OSError):
                p.status = 'crashed'
                p.save(update_fields=['status'])
    return JsonResponse({'processes': [_process_dict(p) for p in processes]})


@csrf_exempt
@require_http_methods(['POST'])
def stop_process_view(request, process_id):
    import signal, os
    from django.utils import timezone
    from .models import Process
    try:
        p = Process.objects.get(id=process_id)
    except Process.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    if p.pid:
        try:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
    p.status = 'stopped'
    p.stopped_at = timezone.now()
    p.save()
    return JsonResponse({'ok': True})


@csrf_exempt
@require_http_methods(['POST'])
def restart_process_view(request, process_id):
    import subprocess, os
    from .models import Process
    try:
        p = Process.objects.get(id=process_id)
    except Process.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    # Kill old pid if still running
    if p.pid:
        try:
            os.killpg(os.getpgid(p.pid), __import__('signal').SIGTERM)
        except (ProcessLookupError, OSError):
            pass
    work_dir = p.cwd or '.'
    try:
        proc = subprocess.Popen(
            p.command, shell=True, cwd=work_dir,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    p.pid = proc.pid
    p.status = 'running'
    p.stopped_at = None
    p.save()
    return JsonResponse(_process_dict(p))


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
