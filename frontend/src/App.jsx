import { useState, useEffect, useCallback, useRef } from 'react';
import { createSession, listSessions, getSession, streamAgent, updateSession, approveAction } from './api';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import AgentCards from './components/AgentCards';
import ActivityFeed from './components/ActivityFeed';
import Toast from './components/Toast';
import MemoryPanel from './components/MemoryPanel';
import SchedulePanel from './components/SchedulePanel';

const PALETTE = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171'];

function makeSessionState(s, colorIndex) {
  return {
    ...s,
    messages: [], liveSteps: [], liveText: '',
    status: 'idle', stepCount: 0, startedAt: null,
    system_prompt: s.system_prompt ?? '',
    color: PALETTE[colorIndex % PALETTE.length],
    inputTokens: 0,
    outputTokens: 0,
    pendingApproval: null,
  };
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [feed, setFeed] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const esRefs = useRef({});
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // tick elapsed timers while any agent is running
  useEffect(() => {
    const id = setInterval(() => {
      if (sessionsRef.current.some(s => s.status === 'running')) setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // auto-dismiss toasts after 5s
  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => dismissToast(toasts[0].id), 5000);
    return () => clearTimeout(id);
  }, [toasts, dismissToast]);

  useEffect(() => {
    listSessions().then(({ sessions: list }) => {
      if (!list.length) return;
      const loaded = list.map((s, i) => makeSessionState(s, i));
      setSessions(loaded);
      setActiveId(loaded[0].id);
      getSession(loaded[0].id).then(data => {
        setSessions(prev => prev.map(s => s.id === data.id ? { ...s, messages: data.messages } : s));
      });
    });
  }, []);

  const newAgent = useCallback(async () => {
    const s = await createSession();
    setSessions(prev => [makeSessionState(s, prev.length), ...prev]);
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
    const session = sessionsRef.current.find(s => s.id === sessionId);
    const color = session?.color ?? PALETTE[0];
    const title = session?.title || 'New agent';

    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, status: 'running', liveSteps: [], liveText: '', stepCount: 0,
            startedAt: Date.now(),
            messages: [...s.messages, { role: 'user', content: prompt, steps: [] }] }
        : s
    ));

    const acc = { steps: [], text: '' };

    const pushFeed = (tool, args) => {
      setFeed(prev => [{
        id: Math.random(), sessionId, color,
        sessionTitle: sessionsRef.current.find(s => s.id === sessionId)?.title || title,
        tool, args, ts: Date.now(),
      }, ...prev].slice(0, 60));
    };

    const es = streamAgent(sessionId, prompt, (event) => {
      if (event.type === 'tool_call') {
        acc.steps = [...acc.steps, { step_type: 'tool_call', data: event.payload }];
        pushFeed(event.payload.tool, event.payload.args);
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveSteps: acc.steps, stepCount: acc.steps.filter(s => s.step_type === 'tool_call').length } : s
        ));
      } else if (event.type === 'tool_result') {
        acc.steps = [...acc.steps, { step_type: 'tool_result', data: event.payload }];
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveSteps: acc.steps } : s
        ));
      } else if (event.type === 'tokens') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, inputTokens: event.payload.input, outputTokens: event.payload.output }
            : s
        ));
      } else if (event.type === 'assistant_text') {
        acc.text = event.payload.text;
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveText: acc.text } : s
        ));
      } else if (event.type === 'done') {
        const finalSteps = acc.steps;
        const stepCount = finalSteps.filter(s => s.step_type === 'tool_call').length;
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'done', liveSteps: [], liveText: '', stepCount,
                inputTokens: event.payload.input_tokens ?? s.inputTokens,
                outputTokens: event.payload.output_tokens ?? s.outputTokens,
                messages: [...s.messages, { role: 'assistant', content: acc.text, steps: finalSteps }] }
            : s
        ));
        getSession(sessionId).then(data => {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: data.title } : s));
        });
        // toast if user is looking elsewhere
        if (activeIdRef.current !== sessionId) {
          const t = sessionsRef.current.find(s => s.id === sessionId);
          setToasts(prev => [...prev, {
            id: Math.random(), color,
            title: t?.title || title,
            stepCount,
          }]);
        }
        delete esRefs.current[sessionId];
      } else if (event.type === 'approval_required') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: event.payload } : s
        ));
      } else if (event.type === 'approval_granted' || event.type === 'approval_rejected') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: null } : s
        ));
      } else if (event.type === 'error') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'error', liveSteps: [], liveText: '', pendingApproval: null,
                messages: [...s.messages, { role: 'assistant', content: `Error: ${event.payload.message}`, steps: [] }] }
            : s
        ));
        delete esRefs.current[sessionId];
      }
    });

    esRefs.current[sessionId] = es;
  }, []);

  const approve = useCallback((sessionId, approved) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, pendingApproval: null } : s));
    approveAction(sessionId, approved);
  }, []);

  const saveSystemPrompt = useCallback((sessionId, value) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, system_prompt: value } : s));
    updateSession(sessionId, { system_prompt: value });
  }, []);

  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const active = sessions.find(s => s.id === activeId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar sessions={sessions} activeId={activeId} onSelect={switchTo} onNew={newAgent} onDashboard={() => setActiveId(null)} onMemory={() => setMemoryOpen(true)} onSchedules={() => setSchedulesOpen(true)} now={now} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {active
          ? <Chat
              session={active}
              onSend={(prompt) => send(active.id, prompt)}
              onSaveSystemPrompt={(v) => saveSystemPrompt(active.id, v)}
              onApprove={() => approve(active.id, true)}
              onReject={() => approve(active.id, false)}
              now={now}
            />
          : <AgentCards sessions={sessions} onSelect={switchTo} onNew={newAgent} now={now} />
        }
      </div>
      <ActivityFeed events={feed} now={now} />
      <Toast toasts={toasts} onDismiss={dismissToast} onSelect={switchTo} />
      {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
      {schedulesOpen && <SchedulePanel onClose={() => setSchedulesOpen(false)} />}
    </div>
  );
}
