import { useState, useEffect, useCallback, useRef } from 'react';
import { createSession, listSessions, getSession, streamAgent } from './api';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';

function makeSessionState(s) {
  return { ...s, messages: [], liveSteps: [], liveText: '', status: 'idle' };
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const esRefs = useRef({});

  useEffect(() => {
    listSessions().then(({ sessions: list }) => {
      if (!list.length) return;
      const loaded = list.map(makeSessionState);
      setSessions(loaded);
      setActiveId(loaded[0].id);
      // load messages for first session
      getSession(loaded[0].id).then(data => {
        setSessions(prev => prev.map(s => s.id === data.id ? { ...s, messages: data.messages } : s));
      });
    });
  }, []);

  const newAgent = useCallback(async () => {
    const s = await createSession();
    setSessions(prev => [makeSessionState(s), ...prev]);
    setActiveId(s.id);
  }, []);

  const switchTo = useCallback((id) => {
    setActiveId(id);
    setSessions(prev => {
      const s = prev.find(s => s.id === id);
      if (s && !s.messages.length && s.status === 'idle') {
        getSession(id).then(data => {
          setSessions(p => p.map(s => s.id === id ? { ...s, messages: data.messages } : s));
        });
      }
      return prev;
    });
  }, []);

  const send = useCallback((sessionId, prompt) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, status: 'running', liveSteps: [], liveText: '',
            messages: [...s.messages, { role: 'user', content: prompt, steps: [] }] }
        : s
    ));

    // capture refs inside closure via a local accumulator to avoid stale state
    const acc = { steps: [], text: '' };

    const es = streamAgent(sessionId, prompt, (event) => {
      if (event.type === 'tool_call') {
        acc.steps = [...acc.steps, { step_type: 'tool_call', data: event.payload }];
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveSteps: acc.steps } : s
        ));
      } else if (event.type === 'tool_result') {
        acc.steps = [...acc.steps, { step_type: 'tool_result', data: event.payload }];
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveSteps: acc.steps } : s
        ));
      } else if (event.type === 'assistant_text') {
        acc.text = event.payload.text;
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveText: acc.text } : s
        ));
      } else if (event.type === 'done') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'done', liveSteps: [], liveText: '',
                messages: [...s.messages, { role: 'assistant', content: acc.text, steps: acc.steps }] }
            : s
        ));
        // update title from backend
        getSession(sessionId).then(data => {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: data.title } : s));
        });
        delete esRefs.current[sessionId];
      } else if (event.type === 'error') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'error', liveSteps: [], liveText: '',
                messages: [...s.messages, { role: 'assistant', content: `Error: ${event.payload.message}`, steps: [] }] }
            : s
        ));
        delete esRefs.current[sessionId];
      }
    });

    esRefs.current[sessionId] = es;
  }, []);

  const active = sessions.find(s => s.id === activeId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar sessions={sessions} activeId={activeId} onSelect={switchTo} onNew={newAgent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {active
          ? <Chat session={active} onSend={(prompt) => send(active.id, prompt)} />
          : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, marginBottom: 12 }}>No agents yet</div>
                <button onClick={newAgent} style={newBtnStyle}>+ New agent</button>
              </div>
            </div>
          )
        }
      </div>
    </div>
  );
}

const newBtnStyle = {
  background: '#1d4ed8', border: 'none', borderRadius: 8,
  color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 14,
};
