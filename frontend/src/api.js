export async function createSession(title = '', model = 'gemini-2.5-flash') {
  const res = await fetch('/api/sessions/new/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, model }),
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

export async function deleteSession(id) {
  await fetch(`/api/sessions/${id}/delete/`, { method: 'DELETE' });
}

export async function updateSession(id, patch) {
  await fetch(`/api/sessions/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
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

export async function approveAction(sessionId, approved) {
  await fetch(`/api/sessions/${sessionId}/approve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved }),
  });
}

export async function listMemories() {
  const res = await fetch('/api/memory/');
  return res.json();
}

export async function writeMemory(key, value) {
  const res = await fetch(`/api/memory/${encodeURIComponent(key)}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return res.json();
}

export async function deleteMemory(key) {
  await fetch(`/api/memory/${encodeURIComponent(key)}/`, { method: 'DELETE' });
}

export async function syncLinear() {
  const res = await fetch('/api/linear/sync/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return res.json();
}

export async function getStats() {
  const res = await fetch('/api/stats/');
  return res.json();
}

export async function listSchedules() {
  const res = await fetch('/api/schedules/');
  return res.json();
}

export async function createSchedule(data) {
  const res = await fetch('/api/schedules/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSchedule(id, patch) {
  const res = await fetch(`/api/schedules/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}

export async function deleteSchedule(id) {
  await fetch(`/api/schedules/${id}/`, { method: 'DELETE' });
}

export async function getEvents(afterId = 0) {
  const res = await fetch(`/api/events/?after=${afterId}`);
  return res.json();
}

export async function getRecentEvents(n = 80) {
  const res = await fetch(`/api/events/?latest=${n}`);
  return res.json();
}

export async function getSessionEvents(sessionId) {
  const res = await fetch(`/api/events/?session=${sessionId}&after=0`);
  return res.json();
}

export async function getUserContext() {
  const res = await fetch('/api/context/user/');
  return res.json();
}

export async function updateUserContext(content) {
  await fetch('/api/context/user/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function listRepoMemories() {
  const res = await fetch('/api/context/repos/');
  return res.json();
}

export async function updateRepoMemory(repo, content) {
  await fetch(`/api/context/repos/${encodeURIComponent(repo)}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function listProjects() {
  const res = await fetch('/api/projects/');
  return res.json();
}

export async function createProject(data) {
  const res = await fetch('/api/projects/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateProject(id, patch) {
  await fetch(`/api/projects/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function listActionItems() {
  const res = await fetch('/api/action-items/');
  return res.json();
}

export async function actionItemAct(id, action) {
  const res = await fetch(`/api/action-items/${id}/${action}/`, { method: 'POST' });
  return res.json();
}

export async function listProcesses() {
  const res = await fetch('/api/processes/');
  return res.json();
}

export async function stopProcess(id) {
  const res = await fetch(`/api/processes/${id}/stop/`, { method: 'POST' });
  return res.json();
}

export async function restartProcess(id) {
  const res = await fetch(`/api/processes/${id}/restart/`, { method: 'POST' });
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
