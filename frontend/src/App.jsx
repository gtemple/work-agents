import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation, Routes, Route } from 'react-router-dom';
import { createSession, listSessions, getSession, streamAgent, updateSession, approveAction } from './api';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import AgentCards from './components/AgentCards';
import ActivityFeed from './components/ActivityFeed';
import Toast from './components/Toast';
import MemoryPanel from './components/MemoryPanel';
import SchedulePanel from './components/SchedulePanel';
import StatsPanel from './components/StatsPanel';

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
    is_work: s.is_work ?? false,
    linear_issue_key: s.linear_issue_key ?? '',
    linear_issue_url: s.linear_issue_url ?? '',
    linear_task_type: s.linear_task_type ?? '',
  };
}

function SessionView({ sessions, setSessions, send, approve, saveSystemPrompt, now }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = sessions.find(s => s.id === id) ?? null;

  useEffect(() => {
    if (!session) return;
    if (!session.messages.length && session.status === 'idle') {
      getSession(id).then(data => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, messages: data.messages } : s));
      });
    }
  }, [id]);

  if (!session) return null;
  return (
    <Chat
      session={session}
      onSend={(prompt) => send(session.id, prompt)}
      onSaveSystemPrompt={(v) => saveSystemPrompt(session.id, v)}
      onApprove={() => approve(session.id, true)}
      onReject={() => approve(session.id, false)}
      now={now}
    />
  );
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [feed, setFeed] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const navigate = useNavigate();
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
      const loaded = list.map((s, i) => ({
        ...makeSessionState(s, i),
        inputTokens: s.input_tokens ?? 0,
        outputTokens: s.output_tokens ?? 0,
      }));
      setSessions(loaded);
    });
  }, []);

  const refreshSessions = useCallback(() => {
    listSessions().then(({ sessions: list }) => {
      setSessions(prev => list.map((s, i) => {
        const existing = prev.find(p => p.id === s.id);
        return existing
          ? { ...existing, title: s.title, is_work: s.is_work, linear_issue_key: s.linear_issue_key, linear_issue_url: s.linear_issue_url, linear_task_type: s.linear_task_type }
          : { ...makeSessionState(s, i), inputTokens: s.input_tokens ?? 0, outputTokens: s.output_tokens ?? 0 };
      }));
    });
  }, []);

  const newAgent = useCallback(async () => {
    const s = await createSession();
    setSessions(prev => [makeSessionState(s, prev.length), ...prev]);
    navigate(`/session/${s.id}`);
  }, [navigate]);

  const switchTo = useCallback((id) => {
    navigate(`/session/${id}`);
  }, [navigate]);

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
        if (!window.location.pathname.includes(sessionId)) {
          const t = sessionsRef.current.find(s => s.id === sessionId);
          setToasts(prev => [...prev, {
            id: Math.random(), color,
            title: t?.title || title,
            stepCount,
          }]);
        }
        delete esRefs.current[sessionId];
      } else if (event.type === 'plan_ready') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: { ...event.payload, event_type: 'plan' } } : s
        ));
      } else if (event.type === 'approval_required') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: { ...event.payload, event_type: 'action' } } : s
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

  const location = useLocation();
  const activeId = location.pathname.match(/\/session\/([^/]+)/)?.[1] ?? null;
  const globalInputTokens = sessions.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
  const globalOutputTokens = sessions.reduce((sum, s) => sum + (s.outputTokens || 0), 0);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar sessions={sessions} activeId={activeId} onSelect={switchTo} onNew={newAgent} onDashboard={() => navigate('/')} onMemory={() => setMemoryOpen(true)} onSchedules={() => setSchedulesOpen(true)} onStats={() => setStatsOpen(true)} globalInputTokens={globalInputTokens} globalOutputTokens={globalOutputTokens} onSessionsChanged={refreshSessions} now={now} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Routes>
          <Route path="/" element={<AgentCards sessions={sessions} onSelect={switchTo} onNew={newAgent} now={now} />} />
          <Route path="/session/:id" element={<SessionView sessions={sessions} setSessions={setSessions} send={send} approve={approve} saveSystemPrompt={saveSystemPrompt} now={now} />} />
        </Routes>
      </div>
      <ActivityFeed events={feed} now={now} />
      <Toast toasts={toasts} onDismiss={dismissToast} onSelect={switchTo} />
      {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
      {schedulesOpen && <SchedulePanel onClose={() => setSchedulesOpen(false)} />}
      {statsOpen && <StatsPanel onClose={() => setStatsOpen(false)} />}
    </div>
  );
}
