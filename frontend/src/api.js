async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function patch(url, data) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createSession(title = '', model = 'gemini-2.5-flash') {
  return post('/api/sessions/new/', { title, model });
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

export async function updateSession(id, data) {
  await patch(`/api/sessions/${id}/`, data);
}

export async function uploadFiles(sessionId, files) {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const res = await fetch(`/api/sessions/${sessionId}/files/`, { method: 'POST', body: form });
  return res.json();
}

export async function approveAction(sessionId, approved, args = null) {
  const body = { approved };
  if (args) body.args = args;
  await post(`/api/sessions/${sessionId}/approve/`, body);
}

export async function stopSession(sessionId) {
  await fetch(`/api/sessions/${sessionId}/stop/`, { method: 'POST' });
}

export async function listMemories() {
  const res = await fetch('/api/memory/');
  return res.json();
}

export async function getDigest(dateStr) {
  const res = await fetch(`/api/memory/daily_digest_${dateStr}/`);
  if (!res.ok) return null;
  const data = await res.json();
  try { return JSON.parse(data.value); } catch { return null; }
}

function isoDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export { isoDate };

export async function writeMemory(key, value) {
  return post(`/api/memory/${encodeURIComponent(key)}/`, { value });
}

export async function deleteMemory(key) {
  await fetch(`/api/memory/${encodeURIComponent(key)}/`, { method: 'DELETE' });
}

export async function syncLinear() {
  return post('/api/linear/sync/', {});
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
  return post('/api/schedules/', data);
}

export async function updateSchedule(id, data) {
  return patch(`/api/schedules/${id}/`, data);
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
  await patch('/api/context/user/', { content });
}

export async function listRepoMemories() {
  const res = await fetch('/api/context/repos/');
  return res.json();
}

export async function updateRepoMemory(repo, content) {
  await patch(`/api/context/repos/${encodeURIComponent(repo)}/`, { content });
}

export async function listProjects() {
  const res = await fetch('/api/projects/');
  return res.json();
}

export async function createProject(data) {
  return post('/api/projects/', data);
}

export async function updateProject(id, data) {
  await patch(`/api/projects/${id}/`, data);
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

export async function deleteProcess(id) {
  await fetch(`/api/processes/${id}/`, { method: 'DELETE' });
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

export async function listNotes() {
  const res = await fetch('/api/notes/');
  return res.json();
}

export async function createNote(data) {
  return post('/api/notes/', data);
}

export async function updateNote(id, data) {
  return patch(`/api/notes/${id}/`, data);
}

export async function deleteNote(id) {
  await fetch(`/api/notes/${id}/`, { method: 'DELETE' });
}
