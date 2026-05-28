import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { argsSummary, fmtNow } from '../utils';
import { stopSession } from '../api';
import { SessionNotes } from './NotesDrawer';

function fmtIso(iso) {
  if (!iso) return '—';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function buildRows(session) {
  const rows = [];
  for (const msg of (session.messages || [])) {
    const ts = fmtIso(msg.created_at);
    if (msg.role === 'user') {
      rows.push({ kind: 'user', t: ts, text: msg.content });
    } else {
      const toolCalls = (msg.steps || []).filter(s => s.step_type === 'tool_call');
      if (toolCalls.length > 0) {
        rows.push({ kind: 'tool_group', t: ts, tools: toolCalls, groupId: msg.id ?? `g-${rows.length}` });
      }
      if (msg.content) rows.push({ kind: 'agent', t: ts, text: msg.content });
    }
  }
  for (const step of (session.liveSteps || [])) {
    if (step.step_type === 'tool_call') {
      rows.push({ kind: 'tool', t: step.t || fmtNow(), tool: step.data.tool, args: argsSummary(step.data.tool, step.data.args || {}) });
    }
  }
  if (session.pendingApproval) {
    const pa = session.pendingApproval;
    if (pa.event_type === 'plan') {
      const bullets = [];
      if (pa.files_to_change?.length) bullets.push(`Files: ${pa.files_to_change.join(', ')}`);
      if (pa.steps?.length) pa.steps.forEach(s => bullets.push(s));
      rows.push({ kind: 'question', t: fmtNow(), isApproval: true, isPlan: true,
        text: pa.summary || 'Implementation plan ready for review.',
        bullets: bullets.length ? bullets : undefined,
        ask: 'Approve and proceed, or revise?',
        options: ['Approve', 'Revise plan'] });
    } else {
      rows.push({ kind: 'question', t: fmtNow(), isApproval: true, isPlan: false,
        text: `Approval required: ${pa.tool}`,
        reasoning: pa.reasoning,
        args: pa.args,
        options: ['Approve', 'Reject'] });
    }
  }
  if (session.liveText) {
    rows.push({ kind: 'live', t: fmtNow(), text: session.liveText });
  }
  return rows;
}

function ChatRow({ m, onApprove, onReject, expanded, onToggle, argsDraft, onArgsDraftChange, argsDraftError }) {
  if (m.kind === 'user') return (
    <div className="chat-row user">
      <span className="ts">{m.t}</span><span className="glyph">▸</span>
      <span className="msg">{m.text}</span>
    </div>
  );
  if (m.kind === 'agent') return (
    <div className="chat-row agent">
      <span className="ts">{m.t}</span><span className="glyph">◆</span>
      <span className="msg markdown"><ReactMarkdown>{m.text}</ReactMarkdown></span>
    </div>
  );
  if (m.kind === 'tool_group') {
    const n = m.tools.length;
    return (
      <div className="chat-row tool">
        <span className="ts">{m.t}</span><span className="glyph">⚒</span>
        <span className="msg">
          <button className="tool-group-toggle" onClick={onToggle}>
            {n} tool call{n !== 1 ? 's' : ''} <span style={{ opacity: 0.5 }}>{expanded ? '▾' : '▸'}</span>
          </button>
          {expanded && (
            <div className="tool-group-items">
              {m.tools.map((step, i) => (
                <div key={i} className="tool-group-item">
                  <span className="tool-name">{step.data.tool}</span>
                  {step.data.args && <span className="tool-args">{argsSummary(step.data.tool, step.data.args)}</span>}
                </div>
              ))}
            </div>
          )}
        </span>
      </div>
    );
  }
  if (m.kind === 'tool') {
    return (
      <div className="chat-row tool">
        <span className="ts">{m.t}</span><span className="glyph">⚒</span>
        <span className="msg">
          <span className="tool-name">{m.tool}</span>
          {m.args && <span className="tool-args">{m.args}</span>}
        </span>
      </div>
    );
  }
  if (m.kind === 'question') return (
    <div className="chat-row question">
      <span className="ts">{m.t}</span><span className="glyph">?</span>
      <span className="msg">
        <div className="q-text">{m.text}</div>
        {m.reasoning && <div className="q-reasoning">{m.reasoning}</div>}
        {m.bullets && <ul className="q-bullets">{m.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {!m.isPlan && argsDraft !== undefined && (
          <div className="q-args">
            <div className="q-args-label">args <span className="q-args-hint">editable</span></div>
            <textarea
              className={argsDraftError ? 'error' : ''}
              value={argsDraft}
              onChange={e => onArgsDraftChange(e.target.value)}
              rows={Math.min(12, (argsDraft || '').split('\n').length + 1)}
              spellCheck={false}
            />
            {argsDraftError && <div className="q-args-error">invalid JSON — fix before approving</div>}
          </div>
        )}
        {m.ask && <div className="q-ask">{m.ask}</div>}
        {m.options && (
          <div className="q-opts">
            {m.options.map((o, i) => (
              <button key={i} className={i === 0 ? 'primary' : ''}
                onClick={() => i === 0 ? onApprove?.() : onReject?.()}>{o}</button>
            ))}
          </div>
        )}
        <div className="q-wait">waiting · tokens paused</div>
      </span>
    </div>
  );
  if (m.kind === 'live') return (
    <div className="chat-row live">
      <span className="ts">{m.t}</span><span className="glyph">›</span>
      <span className="msg">{m.text}<span className="live-cursor" /></span>
    </div>
  );
  return null;
}

export default function ChatView({ session, onClose, onSend, onApprove, onReject, onDelete, notes, onOpenNote, onNewNoteForSession }) {
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [argsDraft, setArgsDraft] = useState('');
  const [argsDraftError, setArgsDraftError] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  const pa = session?.pendingApproval;
  useEffect(() => {
    if (pa && pa.event_type !== 'plan' && pa.args) {
      setArgsDraft(JSON.stringify(pa.args, null, 2));
    } else {
      setArgsDraft('');
    }
    setArgsDraftError(false);
  }, [pa?.tool]);

  const handleApprove = useCallback(() => {
    if (pa && pa.event_type !== 'plan') {
      try {
        const parsed = JSON.parse(argsDraft);
        setArgsDraftError(false);
        onApprove(parsed);
      } catch {
        setArgsDraftError(true);
      }
    } else {
      onApprove(null);
    }
  }, [pa, argsDraft, onApprove]);

  const toggleGroup = (id) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [session?.messages?.length, session?.liveSteps?.length, session?.liveText]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!session) return null;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  const rows = buildRows(session);
  const needsInput = !!session.pendingApproval;
  const isRunning = session.status === 'running' && !session.pendingApproval && !session.liveText;
  const tokens = (session.inputTokens || 0) + (session.outputTokens || 0);

  return (
    <div className="chat" role="dialog">
      <header className="chat-head">
        {session.linear_issue_key && <span className="id">{session.linear_issue_key}</span>}
        <span className="ti">{session.title || 'New agent'}</span>
        <span className="meta">
          {tokens > 0 && <span>{(tokens / 1000).toFixed(1)}k tok</span>}
        </span>
        {session.status === 'running' && !needsInput && (
          <button className="btn stop-btn" onClick={() => stopSession(session.id)} title="stop agent">■ stop</button>
        )}
        {needsInput && (
          <span className="needs"><span className="d" /> needs your input</span>
        )}
        <span className="right">
          {onDelete && session.status !== 'running' && (
            confirmDelete
              ? <>
                  <button className="btn" style={{ color: 'var(--err)', fontSize: 11 }} onClick={() => { onDelete(session.id); onClose(); }}>confirm delete</button>
                  <button className="btn x" onClick={() => setConfirmDelete(false)}>cancel</button>
                </>
              : <button className="btn x" title="delete session" style={{ color: 'var(--fg-4)' }} onClick={() => setConfirmDelete(true)}>⊠</button>
          )}
          <button className="btn x" title="close (esc)" onClick={onClose}>✕</button>
        </span>
      </header>

      <div className="chat-body" ref={bodyRef}>
        {session.linear_issue_key && notes && (
          <SessionNotes
            sessionRef={session.linear_issue_key}
            notes={notes}
            onOpenNote={onOpenNote}
            onNewForSession={onNewNoteForSession}
          />
        )}
        {rows.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>
            <div style={{ color: 'var(--fg-4)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>no messages yet</div>
            <div style={{ color: 'var(--fg-2)', maxWidth: 420, margin: '0 auto' }}>{session.title || 'type a prompt below to start this agent.'}</div>
          </div>
        )}
        {rows.map((m, i) => (
          <ChatRow key={i} m={m}
            onApprove={m.isApproval ? handleApprove : null}
            onReject={m.isApproval ? onReject : null}
            expanded={m.groupId != null && expandedGroups.has(m.groupId)}
            onToggle={m.groupId != null ? () => toggleGroup(m.groupId) : undefined}
            argsDraft={m.isApproval && !m.isPlan ? argsDraft : undefined}
            onArgsDraftChange={m.isApproval && !m.isPlan ? setArgsDraft : undefined}
            argsDraftError={argsDraftError}
          />
        ))}
        {isRunning && (
          <div className="chat-row live">
            <span className="ts">{fmt()}</span>
            <span className="glyph">›</span>
            <span className="msg">working<span className="live-cursor" /></span>
          </div>
        )}
      </div>

      <footer className="chat-foot">
        <div className="chat-input">
          <span className="prompt">›</span>
          <textarea ref={inputRef} value={draft} rows={1}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={needsInput ? 'answer the agent…' : session.status === 'done' ? 'follow up or re-run…' : 'steer, ask a question, or add context…'}
          />
          <button className="send" onClick={send}>send <span className="k">⌘↵</span></button>
        </div>
        <div className="hint">
          <span className="seg"><kbd>esc</kbd> close</span>
          <span className="seg"><kbd>⌘</kbd><kbd>↵</kbd> send</span>
          <span className="seg" style={{ marginLeft: 'auto', color: 'var(--fg-4)' }}>
            streamed to <b style={{ color: 'var(--fg-3)' }}>{session.linear_issue_key || session.id?.slice(0, 8)}</b>
          </span>
        </div>
      </footer>
    </div>
  );
}
