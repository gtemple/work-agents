import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { updateProject } from '../api';
import Chat from './Chat';
import { formatTokens, estimateCost, formatCost, formatElapsed } from '../utils';

const STATUS_CONFIG = {
  running: { label: 'Running', color: '#22d3ee', pulse: true },
  done:    { label: 'Done',    color: '#4ade80', pulse: false },
  error:   { label: 'Error',   color: '#f87171', pulse: false },
  idle:    { label: 'Idle',    color: '#334155', pulse: false },
};

function StatusDot({ status, color }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const dotColor = status === 'running' && color ? color : cfg.color;
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: dotColor, flexShrink: 0,
      boxShadow: cfg.pulse ? `0 0 0 2px ${dotColor}44` : 'none',
      animation: cfg.pulse ? 'pulse 1.2s ease-in-out infinite' : 'none',
    }} />
  );
}

function TaskRow({ session, onSelect, now }) {
  const elapsed = session.status === 'running' ? formatElapsed(session.startedAt, now) : null;
  const cost = (session.inputTokens || session.outputTokens)
    ? formatCost(estimateCost(session.inputTokens || 0, session.outputTokens || 0))
    : null;

  return (
    <div
      onClick={() => onSelect(session.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
        borderBottom: '1px solid #0d1829',
        background: session.status === 'running' ? `${session.color}0a` : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1e293b44'}
      onMouseLeave={e => e.currentTarget.style.background = session.status === 'running' ? `${session.color}0a` : 'transparent'}
    >
      <StatusDot status={session.status} color={session.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {session.title || 'Untitled task'}
        </div>
        {session.status === 'running' && (
          <div style={{ fontSize: 11, color: session.color, marginTop: 2 }}>
            {session.stepCount > 0 ? `${session.stepCount} steps` : 'running…'}
            {elapsed ? ` · ${elapsed}` : ''}
          </div>
        )}
      </div>
      {cost && (
        <span style={{ fontSize: 10, color: '#334155', flexShrink: 0 }}>{cost}</span>
      )}
    </div>
  );
}

export default function ProjectView({ projects, sessions, setSessions, send, approve, saveSystemPrompt, now, onNewTask }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const project = projects.find(p => p.id === id) ?? null;
  const orchestratorSession = project ? sessions.find(s => s.id === project.orchestrator_id) ?? null : null;
  const taskSessions = project
    ? sessions.filter(s => s.project_id === project.id && s.session_role === 'task')
    : [];

  useEffect(() => {
    if (project) setTitleDraft(project.title);
  }, [project?.title]);

  if (!project) return null;

  const runningCount = taskSessions.filter(s => s.status === 'running').length;

  function handleTitleSave() {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== project.title) {
      updateProject(project.id, { title: titleDraft });
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false); }}
              autoFocus
              style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                color: '#f1f5f9', padding: '4px 8px', fontSize: 16, fontWeight: 600,
                outline: 'none', width: '100%',
              }}
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f1f5f9', cursor: 'text' }}
            >
              {project.title}
            </h2>
          )}
          {project.description && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>{project.description}</p>
          )}
        </div>
        {runningCount > 0 && (
          <span style={{
            background: '#22d3ee22', color: '#22d3ee', borderRadius: 10,
            padding: '2px 8px', fontSize: 11,
            animation: 'pulse 1.2s ease-in-out infinite',
          }}>
            {runningCount} task{runningCount !== 1 ? 's' : ''} running
          </span>
        )}
      </div>

      {/* Body: chat + task panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Orchestrator chat */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {orchestratorSession ? (
            <Chat
              session={orchestratorSession}
              onSend={(prompt) => send(orchestratorSession.id, prompt)}
              onSaveSystemPrompt={(v) => saveSystemPrompt(orchestratorSession.id, v)}
              onApprove={() => approve(orchestratorSession.id, true)}
              onReject={() => approve(orchestratorSession.id, false)}
              now={now}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155' }}>
              No orchestrator session
            </div>
          )}
        </div>

        {/* Task panel */}
        <div style={{
          width: 280, flexShrink: 0,
          borderLeft: '1px solid #1e293b',
          display: 'flex', flexDirection: 'column',
          background: '#0a1628',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1e293b',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              Tasks
              {taskSessions.length > 0 && (
                <span style={{ marginLeft: 5, color: '#334155' }}>{taskSessions.length}</span>
              )}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {taskSessions.length === 0 ? (
              <div style={{ padding: '24px 14px', color: '#334155', fontSize: 12, textAlign: 'center' }}>
                No tasks yet.<br />
                Ask the orchestrator to spawn some.
              </div>
            ) : (
              taskSessions.map(s => (
                <TaskRow
                  key={s.id}
                  session={s}
                  onSelect={(sid) => navigate(`/session/${sid}`)}
                  now={now}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
