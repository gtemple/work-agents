import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  createSession, listSessions, getSession, streamAgent, updateSession,
  approveAction, getEvents, getSessionEvents, getRecentEvents,
  listActionItems, actionItemAct,
  listProcesses, deleteSession,
} from './api';
import LeftRail from './components/LeftRail';
import TriageQueue from './components/TriageQueue';
import SessionsList, { getSessionStatus } from './components/SessionsList';
import BottomLog from './components/BottomLog';
import ChatView from './components/ChatView';
import Toast from './components/Toast';
import WorkspacePanel from './components/WorkspacePanel';
import ProcessesBar from './components/ProcessesBar';
import { estimateCost, argsSummary } from './utils';
import './index.css';

function fmtT() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function useClock() {
  const [t, setT] = useState(fmtT);
  useEffect(() => { const id = setInterval(() => setT(fmtT()), 1000); return () => clearInterval(id); }, []);
  return t;
}

function makeSessionState(s, idx) {
  return {
    ...s,
    messages: [], liveSteps: [], liveText: '',
    status: 'idle', stepCount: 0, startedAt: null, eventsLoadedUpTo: 0,
    system_prompt: s.system_prompt ?? '',
    inputTokens: s.input_tokens ?? 0,
    outputTokens: s.output_tokens ?? 0,
    pendingApproval: null,
    is_work: s.is_work ?? false,
    linear_issue_key: s.linear_issue_key ?? '',
    linear_task_type: s.linear_task_type ?? '',
    session_role: s.session_role ?? 'standard',
    project_id: s.project_id ?? null,
    hasPendingPlan: s.has_pending_plan ?? false,
    model: s.model ?? 'gemini-2.5-flash',
  };
}

function TitleBar({ running, queued, totalCost, onHamburger }) {
  const clock = useClock();
  return (
    <div className="title">
      <button className="hamb" onClick={onHamburger} aria-label="menu">≡</button>
      <span className="dots"><i /><i /><i /></span>
      <span className="crumb">
        <b>~/agent-manager</b>
        <span className="sep">/</span>
        <span>dashboard</span>
      </span>
      <span className="meta">
        <span><span className="ok">●</span> {running} running</span>
        <span>{queued} queued</span>
        <span>${totalCost.toFixed(4)}</span>
        <span>{clock}</span>
      </span>
    </div>
  );
}

function StatusBar({ running, queued, done, errors, needsInput, totalTokens, totalCost, focused, onOpenNeeds }) {
  return (
    <footer className="stat">
      {needsInput > 0 && (
        <button className="seg" style={{
          color: 'var(--accent)', cursor: 'pointer', background: 'rgba(230,179,74,.08)',
          border: '1px solid rgba(230,179,74,.4)', borderRadius: 'var(--r)',
          padding: '0 8px', height: 16, fontSize: 10.5, font: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }} onClick={onOpenNeeds}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'needs-pulse 1.2s ease-in-out infinite' }} />
          <b style={{ color: 'var(--accent)' }}>{needsInput}</b> needs input →
        </button>
      )}
      <span className="seg"><span className="d amber" /> <b>{running}</b> running</span>
      <span className="seg"><span className="d" style={{ background: 'var(--fg-4)' }} /> <b>{queued}</b> queued</span>
      <span className="seg"><span className="d" style={{ background: 'var(--ok)' }} /> <b>{done}</b> done</span>
      <span className="seg"><span className="d err" /> <b>{errors}</b> error</span>
      <span className="seg" style={{ color: 'var(--fg-4)' }}>│</span>
      <span className="seg"><b>{(totalTokens / 1000).toFixed(1)}k</b> tokens</span>
      <span className="seg"><b>${totalCost.toFixed(4)}</b></span>
      <span className="right">
        {focused && <span className="seg">focus: <b style={{ color: 'var(--accent)' }}>{String(focused).slice(0, 12)}</b></span>}
        <span className="seg"><span className="key">i</span> investigate</span>
        <span className="seg"><span className="key">s</span> save</span>
        <span className="seg"><span className="key">n</span> dismiss</span>
        <span className="seg"><span className="key">?</span> help</span>
      </span>
    </footer>
  );
}

function HelpOverlay({ onClose }) {
  return (
    <div className="help" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <h3>keyboard</h3>
        <div className="grid">
          <kbd>j</kbd><span className="desc">focus next suggestion</span>
          <kbd>k</kbd><span className="desc">focus previous suggestion</span>
          <kbd>i</kbd><span className="desc">investigate focused</span>
          <kbd>s</kbd><span className="desc">save focused for later</span>
          <kbd>n</kbd><span className="desc">dismiss focused</span>
          <kbd>/</kbd><span className="desc">focus search</span>
          <kbd>?</kbd><span className="desc">toggle this help</span>
          <kbd>esc</kbd><span className="desc">close overlays</span>
        </div>
        <div className="foot">esc · close</div>
      </div>
    </div>
  );
}

export default function App() {
  const [sessions, setSessions]       = useState([]);
  const [feed, setFeed]               = useState([]);
  const [triageItems, setTriageItems] = useState([]);
  const [processes, setProcesses]     = useState([]);
  const [toasts, setToasts]           = useState([]);
  const [now, setNow]                 = useState(Date.now());

  const [tab, setTab]                 = useState('all');
  const [scope, setScope]             = useState('all');
  const [selectedAgent, setSelected]  = useState(null);
  const [triageFocus, setFocus]       = useState(0);
  const [triageActions, setActions]   = useState({});
  const [logHeight, setLogHeight]     = useState(220);
  const [helpOpen, setHelpOpen]       = useState(false);
  const [triageOpen, setTriageOpen]       = useState(true);
  const [sessionsOpen, setSessionsOpen]   = useState(true);
  const [openChat, setOpenChat]           = useState(null);
  const [openWorkspace, setOpenWorkspace] = useState(null); // 'memory' | 'schedules' | 'stats'
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [globalModel, setGlobalModel]     = useState(() => localStorage.getItem('globalModel') || 'gemini-2.5-flash');

  const sessionsRef    = useRef(sessions);
  const lastEventIdRef = useRef(0);
  const esRefs         = useRef({});
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // tick timer for running agents
  useEffect(() => {
    const id = setInterval(() => {
      if (sessionsRef.current.some(s => s.status === 'running')) setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // initial load
  useEffect(() => {
    listSessions().then(({ sessions: list, max_event_id }) => {
      if (max_event_id) lastEventIdRef.current = max_event_id;
      if (!list?.length) return;
      setSessions(list.map(makeSessionState));
    });
    listActionItems().then(({ active }) => setTriageItems(active ?? []));
    getRecentEvents(80).then(({ events }) => {
      if (!events?.length) return;
      const lines = events
        .filter(e => e.event_type === 'tool_call')
        .map(e => {
          const d = new Date(e.created_at), p = n => String(n).padStart(2, '0');
          return {
            t: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
            agent: e.session_title?.split(' ')[0] || e.session_id?.slice(0, 8) || '—',
            lvl: 'tool',
            msg: `${e.data.tool} ${argsSummary(e.data.tool, e.data.args || {})}`.trim(),
          };
        });
      setFeed(lines.slice(-60));
    });
  }, []);

  const refreshProcesses = useCallback(() =>
    listProcesses().then(({ processes: list }) => setProcesses(list ?? [])), []);

  // event polling
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { events } = await getEvents(lastEventIdRef.current);
        if (!events?.length) return;
        lastEventIdRef.current = events[events.length - 1].id;

        for (const ev of events) {
          const sess = sessionsRef.current.find(s => s.id === ev.session_id);

          if (ev.event_type === 'tool_call') {
            const d = new Date(ev.created_at), p = n => String(n).padStart(2, '0');
            setFeed(prev => [{
              t: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
              agent: sess?.linear_issue_key || ev.session_title?.split(' ')[0] || ev.session_id?.slice(0, 8) || '—',
              lvl: 'tool',
              msg: `${ev.data.tool} ${argsSummary(ev.data.tool, ev.data.args || {})}`.trim(),
            }, ...prev].slice(0, 80));
            setSessions(prev => prev.map(s => {
              if (s.id !== ev.session_id || ev.id <= s.eventsLoadedUpTo) return s;
              return { ...s, status: 'running', startedAt: s.startedAt ?? Date.now(),
                liveSteps: [...s.liveSteps, { step_type: 'tool_call', data: { tool: ev.data.tool, args: ev.data.args } }],
                stepCount: s.stepCount + 1 };
            }));
          }

          if (ev.event_type === 'plan_ready') {
            setSessions(prev => prev.map(s =>
              s.id === ev.session_id && !s.pendingApproval
                ? { ...s, pendingApproval: { ...ev.data, event_type: 'plan' }, status: 'running' }
                : s
            ));
          }

          if (ev.event_type === 'done') {
            setSessions(prev => prev.map(s =>
              s.id === ev.session_id
                ? { ...s, status: 'done', liveSteps: [], liveText: '', eventsLoadedUpTo: 0,
                    inputTokens: ev.data.input_tokens ?? s.inputTokens,
                    outputTokens: ev.data.output_tokens ?? s.outputTokens }
                : s
            ));
            getSession(ev.session_id).then(data => {
              setSessions(prev => prev.map(s =>
                s.id === ev.session_id ? { ...s, messages: data.messages, title: data.title || s.title } : s
              ));
            });
          }

          if (ev.event_type === 'process_started' || ev.event_type === 'process_stopped') {
            refreshProcesses();
          }

          if (ev.event_type === 'task_spawned') {
            listSessions().then(({ sessions: list }) => {
              setSessions(prev => list.map((s, i) => {
                const ex = prev.find(p => p.id === s.id);
                return ex ? { ...ex, title: s.title, session_role: s.session_role, project_id: s.project_id }
                          : makeSessionState(s, i);
              }));
            });
          }
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(id);
  }, [refreshProcesses]);

  // processes polling
  useEffect(() => {
    refreshProcesses();
    const id = setInterval(refreshProcesses, 5000);
    return () => clearInterval(id);
  }, [refreshProcesses]);

  // toast auto-dismiss
  const dismissToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => dismissToast(toasts[0].id), 5000);
    return () => clearTimeout(id);
  }, [toasts, dismissToast]);

  const refreshSessions = useCallback(() =>
    listSessions().then(({ sessions: list }) => {
      setSessions(prev => list.map((s, i) => {
        const ex = prev.find(p => p.id === s.id);
        return ex ? { ...ex, title: s.title, is_work: s.is_work,
            linear_issue_key: s.linear_issue_key, linear_task_type: s.linear_task_type,
            inputTokens: s.input_tokens ?? ex.inputTokens, outputTokens: s.output_tokens ?? ex.outputTokens }
          : makeSessionState(s, i);
      }));
    }), []);

  const openSession = useCallback((id) => {
    setOpenChat(id);
    setSelected(id);
    const sess = sessionsRef.current.find(s => s.id === id);
    if (!sess) return;
    if (sess.status === 'running' && !sess.liveSteps?.length && !sess.eventsLoadedUpTo) {
      getSessionEvents(id).then(({ events }) => {
        if (!events?.length) return;
        const steps = events.filter(e => e.event_type === 'tool_call')
          .map(e => ({ step_type: 'tool_call', data: { tool: e.data.tool, args: e.data.args } }));
        setSessions(prev => prev.map(s =>
          s.id === id ? { ...s, liveSteps: steps, stepCount: steps.length, eventsLoadedUpTo: events[events.length - 1].id } : s
        ));
      });
    } else if (!sess.messages?.length && sess.status !== 'running') {
      getSession(id).then(data => {
        setSessions(prev => prev.map(s => {
          if (s.id !== id) return s;
          const up = { ...s, messages: data.messages };
          if (data.pending_plan && !s.pendingApproval) {
            up.pendingApproval = { ...data.pending_plan, event_type: 'plan' };
            up.status = 'running';
          }
          return up;
        }));
      });
    }
  }, []);

  const newAgent = useCallback(async () => {
    const s = await createSession('', globalModel);
    const ns = makeSessionState(s, sessionsRef.current.length);
    setSessions(prev => [ns, ...prev]);
    openSession(s.id);
  }, [openSession, globalModel]);

  const send = useCallback((sessionId, prompt) => {
    const sess = sessionsRef.current.find(s => s.id === sessionId);
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, status: 'running', liveSteps: [], liveText: '', stepCount: 0, startedAt: Date.now(),
            messages: [...s.messages, { role: 'user', content: prompt, steps: [] }] }
        : s
    ));
    const acc = { steps: [], text: '' };
    const es = streamAgent(sessionId, prompt, ev => {
      if (ev.type === 'tool_call') {
        acc.steps = [...acc.steps, { step_type: 'tool_call', data: ev.payload }];
        setFeed(prev => [{
          t: fmtT(), agent: sess?.linear_issue_key || sessionId.slice(0, 8),
          lvl: 'tool', msg: `${ev.payload.tool} ${argsSummary(ev.payload.tool, ev.payload.args || {})}`.trim(),
        }, ...prev].slice(0, 80));
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, liveSteps: acc.steps, stepCount: acc.steps.filter(x => x.step_type === 'tool_call').length } : s
        ));
      } else if (ev.type === 'tool_result') {
        acc.steps = [...acc.steps, { step_type: 'tool_result', data: ev.payload }];
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, liveSteps: acc.steps } : s));
      } else if (ev.type === 'tokens') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, inputTokens: ev.payload.input, outputTokens: ev.payload.output } : s
        ));
      } else if (ev.type === 'assistant_text') {
        acc.text = ev.payload.text;
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, liveText: acc.text } : s));
      } else if (ev.type === 'done') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'done', liveSteps: [], liveText: '',
                stepCount: acc.steps.filter(x => x.step_type === 'tool_call').length,
                inputTokens: ev.payload.input_tokens ?? s.inputTokens,
                outputTokens: ev.payload.output_tokens ?? s.outputTokens,
                messages: [...s.messages, { role: 'assistant', content: acc.text, steps: acc.steps }] }
            : s
        ));
        getSession(sessionId).then(data => {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: data.title || s.title } : s));
        });
        delete esRefs.current[sessionId];
      } else if (ev.type === 'plan_ready') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: { ...ev.payload, event_type: 'plan' } } : s
        ));
      } else if (ev.type === 'approval_required') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: { ...ev.payload, event_type: 'action' } } : s
        ));
      } else if (ev.type === 'approval_granted' || ev.type === 'approval_rejected') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, pendingApproval: null } : s
        ));
      } else if (ev.type === 'error') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, status: 'error', liveSteps: [], liveText: '', pendingApproval: null,
                messages: [...s.messages, { role: 'assistant', content: `Error: ${ev.payload.message}`, steps: [] }] }
            : s
        ));
        delete esRefs.current[sessionId];
      }
    });
    esRefs.current[sessionId] = es;
  }, []);

  const handleDelete = useCallback(async (id) => {
    await deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (openChat === id) setOpenChat(null);
  }, [openChat]);

  const approve = useCallback((sessionId, approved) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, pendingApproval: null } : s));
    approveAction(sessionId, approved);
  }, []);

  const handleTriageAction = useCallback(async (id, action) => {
    if (action === 'investigate') {
      setActions(prev => ({ ...prev, [id]: 'investigate' }));
      const data = await actionItemAct(id, 'investigate');
      if (data.session_id) {
        await refreshSessions();
        openSession(data.session_id);
      }
    } else {
      setActions(prev => ({ ...prev, [id]: action }));
      actionItemAct(id, action).then(() =>
        listActionItems().then(({ active }) => setTriageItems(active ?? []))
      );
    }
  }, [refreshSessions, openSession]);

  // computed values
  const counts = useMemo(() => {
    const st = sessions.map(getSessionStatus);
    return {
      all: sessions.length,
      needs_input: st.filter(s => s === 'needs_input').length,
      running: st.filter(s => s === 'running').length,
      work: sessions.filter(s => s.is_work).length,
      personal: sessions.filter(s => !s.is_work).length,
      done: st.filter(s => s === 'done').length,
      error: st.filter(s => s === 'error').length,
    };
  }, [sessions]);

  const totals = useMemo(() => {
    const tokens = sessions.reduce((sum, s) => sum + (s.inputTokens || 0) + (s.outputTokens || 0), 0);
    const cost   = sessions.reduce((sum, s) => sum + estimateCost(s.inputTokens || 0, s.outputTokens || 0, s.model), 0);
    const queued = sessions.filter(s => getSessionStatus(s) === 'queued').length;
    return { tokens, cost, queued };
  }, [sessions]);

  const visibleSessions = useMemo(() => sessions.filter(s => {
    const st = getSessionStatus(s);
    if (tab === 'needs_input') return st === 'needs_input';
    if (tab === 'running')     return st === 'running' || st === 'needs_input';
    if (tab === 'done')        return st === 'done';
    if (tab === 'error')       return st === 'error';
    if (tab === 'work')        return s.is_work;
    if (tab === 'personal')    return !s.is_work;
    return true;
  }), [sessions, tab]);

  const visibleTriage = useMemo(() => triageItems.filter(s => {
    if (tab === 'work')     return s.type === 'work';
    if (tab === 'personal') return s.type === 'personal';
    if (['running', 'done', 'error', 'needs_input'].includes(tab)) return false;
    return true;
  }), [triageItems, tab]);

  const liveTriage = visibleTriage.filter(s => !triageActions[s.id]);
  const focusedItem = liveTriage[triageFocus];

  // keyboard nav
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (openChat) return;
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus(f => Math.min(liveTriage.length - 1, f + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(f => Math.max(0, f - 1)); }
      else if (e.key === 'i' && focusedItem) { e.preventDefault(); handleTriageAction(focusedItem.id, 'investigate'); }
      else if (e.key === 's' && focusedItem) { e.preventDefault(); handleTriageAction(focusedItem.id, 'save'); }
      else if (e.key === 'n' && focusedItem) { e.preventDefault(); handleTriageAction(focusedItem.id, 'dismiss'); }
      else if (e.key === '?') setHelpOpen(h => !h);
      else if (e.key === 'Escape') { setHelpOpen(false); setOpenWorkspace(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triageFocus, liveTriage, openChat, focusedItem, handleTriageAction]);

  const openChatSession = sessions.find(s => s.id === openChat) ?? null;
  const globalIn  = sessions.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
  const globalOut = sessions.reduce((sum, s) => sum + (s.outputTokens || 0), 0);

  return (
    <div className="app" data-mobile-drawer={drawerOpen ? '1' : '0'}>
      <TitleBar running={counts.running} queued={totals.queued} totalCost={totals.cost}
        onHamburger={() => setDrawerOpen(d => !d)} />
      {drawerOpen && <div className="mobile-backdrop" onClick={() => setDrawerOpen(false)} />}

      <LeftRail
        sessions={sessions}
        selected={selectedAgent}
        onSelect={id => { openSession(id); setDrawerOpen(false); }}
        scope={scope}
        setScope={setScope}
        onNew={newAgent}
        onMemory={() => { setOpenWorkspace('memory'); setDrawerOpen(false); }}
        onSchedules={() => { setOpenWorkspace('schedules'); setDrawerOpen(false); }}
        onStats={() => { setOpenWorkspace('stats'); setDrawerOpen(false); }}
        globalInputTokens={globalIn}
        globalOutputTokens={globalOut}
        globalModel={globalModel}
        onModelChange={m => { setGlobalModel(m); localStorage.setItem('globalModel', m); }}
      />

      <main className="main">
        {/* Tabs */}
        <div className="tabs">
          {[
            ['all', 'all', counts.all],
            ['needs_input', 'needs input', counts.needs_input, true],
            ['running', 'running', counts.running],
            ['work', 'work', counts.work],
            ['personal', 'personal', counts.personal],
            ['done', 'done', counts.done],
            ['error', 'error', counts.error],
          ].map(([k, label, n, isNeeds]) => (
            <div key={k} className="tab" data-on={tab === k ? '1' : '0'}
              data-needs={isNeeds && n > 0 ? '1' : '0'} onClick={() => setTab(k)}>
              {isNeeds && n > 0 && <span className="pulse" />}
              {label} <span className="n">{n}</span>
            </div>
          ))}
          <div className="right">
            <span style={{ color: 'var(--fg-4)' }}>triage: {visibleTriage.length}</span>
            <button className="btn primary" onClick={newAgent}>＋ new agent</button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="filterbar">
          <span style={{ color: 'var(--fg-4)' }}>triage:</span>
          <div className="grp">
            <button className="pill" data-on="1">all sources <span className="n">{visibleTriage.length}</span></button>
          </div>
          <span className="spacer" />
          <span style={{ color: 'var(--fg-4)' }}>sort:</span>
          <button className="pill" data-on="1">queue position</button>
        </div>

        <div className="main-scroll">
          <ProcessesBar processes={processes} onRefresh={refreshProcesses} />
          {visibleTriage.length > 0 && (
            <>
              <div className="sect" style={{ cursor: 'pointer' }} onClick={() => setTriageOpen(o => !o)}>
                <b>triage</b>
                <span>{liveTriage.length} of {visibleTriage.length}</span>
                <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>{triageOpen ? '▾' : '▸'}</span>
                <span className="hint">
                  <kbd>j</kbd><kbd>k</kbd> navigate · <kbd>i</kbd> investigate · <kbd>s</kbd> save · <kbd>n</kbd> dismiss
                </span>
              </div>
              {triageOpen && <TriageQueue items={visibleTriage} focus={triageFocus} setFocus={setFocus} actions={triageActions} onAction={handleTriageAction} />}
            </>
          )}
          <div className="sect" style={{ cursor: 'pointer' }} onClick={() => setSessionsOpen(o => !o)}>
            <b>sessions</b>
            <span>{visibleSessions.length}</span>
            <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>{sessionsOpen ? '▾' : '▸'}</span>
            <span className="hint">click any row → open chat thread</span>
          </div>
          {sessionsOpen && <SessionsList items={visibleSessions} onOpen={openSession} onDelete={handleDelete} now={now} />}
        </div>
      </main>

      <BottomLog lines={feed} height={logHeight} setHeight={setLogHeight} onClear={() => setFeed([])} />

      <StatusBar
        running={counts.running}
        queued={totals.queued}
        done={counts.done}
        errors={counts.error}
        needsInput={counts.needs_input}
        totalTokens={totals.tokens}
        totalCost={totals.cost}
        focused={focusedItem?.title}
        onOpenNeeds={() => {
          const first = sessions.find(s => getSessionStatus(s) === 'needs_input');
          if (first) openSession(first.id);
        }}
      />

      {openChat && openChatSession && (
        <ChatView
          session={openChatSession}
          onClose={() => setOpenChat(null)}
          onSend={prompt => send(openChat, prompt)}
          onApprove={() => approve(openChat, true)}
          onReject={() => approve(openChat, false)}
          onDelete={handleDelete}
        />
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      <Toast toasts={toasts} onDismiss={dismissToast} onSelect={openSession} />
      {openWorkspace && (
        <WorkspacePanel
          initialTab={openWorkspace}
          onClose={() => setOpenWorkspace(null)}
        />
      )}
    </div>
  );
}
