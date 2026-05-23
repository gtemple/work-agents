import json
from pathlib import Path
from django.conf import settings
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Session, Message
from . import agent_loop


@csrf_exempt
@require_http_methods(['POST'])
def create_session(request):
    data = json.loads(request.body or '{}')
    session = Session.objects.create(title=data.get('title', ''))
    return JsonResponse({'id': str(session.id), 'title': session.title, 'created_at': session.created_at.isoformat()})


@require_http_methods(['GET'])
def get_session(request, session_id):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

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

    return JsonResponse({'id': str(session.id), 'title': session.title, 'messages': messages})


@require_http_methods(['GET'])
def list_sessions(request):
    sessions = Session.objects.all()
    return JsonResponse({'sessions': [
        {'id': str(s.id), 'title': s.title, 'created_at': s.created_at.isoformat()}
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
