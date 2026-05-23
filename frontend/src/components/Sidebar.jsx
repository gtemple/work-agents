import { useState } from 'react';
import { formatElapsed, formatTokens, estimateCost, formatCost } from '../utils';
import { syncLinear } from '../api';

const STATUS_DOT = {
  idle:    { color: '#475569', pulse: false },
  running: { color: '#22d3ee', pulse: true  },
  done:    { color: '#4ade80', pulse: false },
  error:   { color: '#f87171', pulse: false },
};

function StatusDot({ status, color }) {
  const cfg = STATUS_DOT[status] ?? STATUS_DOT.idle;
  const dotColor = status === 'running' && color ? color : cfg.color;
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, flexShrink: 0,
      borderRadius: '50%', background: dotColor,
      boxShadow: cfg.pulse ? `0 0 0 2px ${dotColor}55` : 'none',
      animation: cfg.pulse ? 'pulse 1.2s ease-in-out infinite' : 'none',
    }} />
  );
}

function SessionRow({ s, activeId, onSelect, now }) {
  const isActive = s.id === activeId;
  const elapsed = s.status === 'running' ? formatElapsed(s.startedAt, now) : null;
  const badge = s.linear_task_type && TASK_TYPE_BADGE[s.linear_task_type];
  return (
    <button
      onClick={() => onSelect(s.id)}
      style={{
        width: '100%', textAlign: 'left',
        background: isActive ? '#1e293b' : 'transparent',
        border: 'none',
        borderLeft: isActive ? `2px solid ${s.color || '#1d4ed8'}` : '2px solid transparent',
        padding: '9px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        color: isActive ? '#f1f5f9' : '#64748b',
      }}
    >
      <StatusDot status={s.status} color={s.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {s.linear_issue_key && (
            <span style={{ fontSize: 10, color: '#3b82f6', flexShrink: 0 }}>{s.linear_issue_key}</span>
          )}
          <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {s.linear_issue_key ? (s.title || '').replace(/^[A-Z]+-\d+:\s*/, '') : (s.title || 'New agent')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          {badge && (
            <span style={{ fontSize: 9, color: badge.color, border: `1px solid ${badge.color}44`, borderRadius: 3, padding: '0 4px' }}>
              {badge.label}
            </span>
          )}
          {(s.status === 'running' || s.stepCount > 0) && (
            <span style={{ fontSize: 10, color: s.status === 'running' ? s.color : '#475569' }}>
              {s.stepCount > 0 ? `${s.stepCount} step${s.stepCount !== 1 ? 's' : ''}` : ''}
              {elapsed ? ` · ${elapsed}` : ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

const TASK_TYPE_BADGE = {
  bug_fix:  { label: 'Bug',      color: '#f87171' },
  feature:  { label: 'Feature',  color: '#34d399' },
  test:     { label: 'Test',     color: '#fbbf24' },
  refactor: { label: 'Refactor', color: '#a78bfa' },
};

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDashboard, onMemory, onSchedules, onStats, globalInputTokens, globalOutputTokens, onSessionsChanged, now }) {
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await syncLinear();
      onSessionsChanged?.();
    } finally {
      setSyncing(false);
    }
  }

  const matchSearch = s => !search.trim() ||
    (s.title || 'New agent').toLowerCase().includes(search.toLowerCase()) ||
    (s.linear_issue_key || '').toLowerCase().includes(search.toLowerCase());

  const workSessions = sessions.filter(s => s.is_work && matchSearch(s));
  const personalSessions = sessions.filter(s => !s.is_work && matchSearch(s));

  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: '#0a1628', borderRight: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1e293b',
      }}>
        <button onClick={onDashboard} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontWeight: 600, fontSize: 13, color: '#94a3b8',
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          Agents
        </button>
        <button onClick={onNew} title="New agent" style={{
          background: '#1d4ed8', border: 'none', borderRadius: 6,
          color: '#fff', width: 24, height: 24, cursor: 'pointer',
          fontSize: 16, lineHeight: '24px', textAlign: 'center', padding: 0,
        }}>+</button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #0d1829' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sessions…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, color: '#f1f5f9', padding: '5px 8px',
            fontSize: 12, outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {workSessions.length > 0 && (
          <>
            <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Work</span>
              <button onClick={handleSync} disabled={syncing} style={{
                background: 'none', border: 'none', color: '#334155', cursor: 'pointer',
                fontSize: 10, padding: 0, opacity: syncing ? 0.5 : 1,
              }}>
                {syncing ? '…' : '↻ sync'}
              </button>
            </div>
            {workSessions.map(s => <SessionRow key={s.id} s={s} activeId={activeId} onSelect={onSelect} now={now} />)}
            <div style={{ margin: '6px 12px', borderTop: '1px solid #1e293b' }} />
          </>
        )}

        {workSessions.length === 0 && (
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Work</span>
            <button onClick={handleSync} disabled={syncing} style={{
              background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
              fontSize: 10, padding: 0, opacity: syncing ? 0.5 : 1,
            }}>
              {syncing ? '…' : '↻ sync Linear'}
            </button>
          </div>
        )}

        {workSessions.length > 0 && personalSessions.length > 0 && (
          <div style={{ padding: '4px 12px 4px', fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Personal
          </div>
        )}

        {personalSessions.length === 0 && workSessions.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#334155', fontSize: 12, textAlign: 'center' }}>
            {search ? 'No matches' : 'No agents yet'}
          </div>
        )}
        {personalSessions.map(s => <SessionRow key={s.id} s={s} activeId={activeId} onSelect={onSelect} now={now} />)}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b' }}>
        <div style={{ fontSize: 10, color: '#334155', marginBottom: 2 }}>All sessions</div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}
          title={`${formatTokens(globalInputTokens)} in / ${formatTokens(globalOutputTokens)} out`}>
          {formatTokens(globalInputTokens + globalOutputTokens)} tok
          {(globalInputTokens + globalOutputTokens) > 0 ? ` · ${formatCost(estimateCost(globalInputTokens, globalOutputTokens))}` : ''}
        </div>
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid #1e293b', display: 'flex', gap: 6 }}>
        {[['Memory', onMemory], ['Schedules', onSchedules], ['Stats', onStats]].map(([label, fn]) => (
          <button key={label} onClick={fn} style={{
            flex: 1, background: 'none', border: '1px solid #1e293b',
            borderRadius: 6, color: '#475569', padding: '6px 0',
            cursor: 'pointer', fontSize: 11, textAlign: 'center',
          }}>{label}</button>
        ))}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
