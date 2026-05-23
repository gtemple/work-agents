export async function createSession(title = '') {
  const res = await fetch('/api/sessions/new/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function listSessions() {
  const res = await fetch('/api/sessions/');
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`/api/sessions/${id}/`);
  return res.json();
}

export async function uploadFiles(sessionId, files) {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const res = await fetch(`/api/sessions/${sessionId}/files/`, {
    method: 'POST',
    body: form,
  });
  return res.json();
}

export function streamAgent(sessionId, prompt, onEvent) {
  const url = `/api/sessions/${sessionId}/stream/?prompt=${encodeURIComponent(prompt)}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') es.close();
  };
  es.onerror = () => {
    onEvent({ type: 'error', payload: { message: 'Connection lost' } });
    es.close();
  };
  return es;
}
