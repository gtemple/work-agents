import { useState } from 'react';
import { formatElapsed, estimateCost, formatCost, formatTokens } from '../utils';
import ActionItems from './ActionItems';
import { Robot } from './Icons';

const STATUS_CONFIG = {
  running: { label: 'Running', color: '#22d3ee', pulse: true },
  done:    { label: 'Done',    color: '#4ade80', pulse: false },
  error:   { label: 'Error',   color: '#f87171', pulse: false },
  idle:    { label: 'Idle',    color: '#334155', pulse: false },
};

const TASK_TYPE_BADGE = {
  bug_fix:  { label: 'Bug',      color: '#f87171' },
  feature:  { label: 'Feature',  color: '#34d399' },
  test:     { label: 'Test',     color: '#fbbf24' },
  refactor: { label: 'Refactor', color: '#a78bfa' },
};

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'running',  label: 'Running' },
  { key: 'work',     label: 'Work' },
  { key: 'personal', label: 'Personal' },
  { key: 'done',     label: 'Done' },
  { key: 'error',    label: 'Error' },
];

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

function Row({ session, onSelect, now }) {
  const running = session.status === 'running';
  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle;
  const elapsed = running ? formatElapsed(session.startedAt, now) : null;
  const badge = session.linear_task_type && TASK_TYPE_BADGE[session.linear_task_type];
  const lastTool = running && session.liveSteps.length
    ? session.liveSteps.filter(s => s.step_type === 'tool_call').at(-1)?.data?.tool
    : null;
  const cost = (session.inputTokens || session.outputTokens)
    ? formatCost(estimateCost(session.inputTokens || 0, session.outputTokens || 0))
    : null;
  const tokens = (session.inputTokens || session.outputTokens)
    ? formatTokens((session.inputTokens || 0) + (session.outputTokens || 0))
    : null;

  const displayTitle = session.linear_issue_key
    ? (session.title || '').replace(/^[A-Z]+-\d+:\s*/, '')
    : (session.title || 'New agent');

  return (
    <tr
      onClick={() => onSelect(session.id)}
      style={{
        cursor: 'pointer',
        borderBottom: '1px solid #0d1829',
        background: running ? `${session.color}08` : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = running ? `${session.color}14` : '#1e293b44'}
      onMouseLeave={e => e.currentTarget.style.background = running ? `${session.color}08` : 'transparent'}
    >
      {/* Status */}
      <td style={{ padding: '11px 0 11px 20px', width: 28 }}>
        <StatusDot status={session.status} color={session.color} />
      </td>

      {/* Title + issue key */}
      <td style={{ padding: '11px 16px 11px 10px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {session.color && (
            <span style={{ width: 3, height: 28, borderRadius: 2, background: session.color, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            {session.linear_issue_key && (
              <span style={{ fontSize: 10, color: '#3b82f6', marginRight: 6 }}>
                {session.linear_issue_key}
              </span>
            )}
            <span style={{
              fontSize: 13, color: running ? '#f1f5f9' : '#94a3b8', fontWeight: running ? 500 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline',
            }}>
              {displayTitle}
            </span>
          </div>
        </div>
      </td>

      {/* Type badges */}
      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap', width: 120 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {session.is_work && (
            <span style={{
              fontSize: 9, color: '#3b82f6', background: '#0d1f3c',
              border: '1px solid #3b82f633', borderRadius: 3, padding: '1px 5px',
            }}>work</span>
          )}
          {badge && (
            <span style={{
              fontSize: 9, color: badge.color, border: `1px solid ${badge.color}44`,
              borderRadius: 3, padding: '1px 5px',
            }}>{badge.label}</span>
          )}
          {!session.is_work && !badge && (
            <span style={{ fontSize: 9, color: '#334155' }}>personal</span>
          )}
        </div>
      </td>

      {/* Live activity */}
      <td style={{ padding: '11px 16px', width: 180 }}>
        {lastTool ? (
          <span style={{ fontSize: 11, color: session.color }}>
{lastTool}…
          </span>
        ) : session.stepCount > 0 ? (
          <span style={{ fontSize: 11, color: '#475569' }}>
            {session.stepCount} step{session.stepCount !== 1 ? 's' : ''}
          </span>
        ) : session.status === 'error' ? (
          <span style={{ fontSize: 11, color: '#f87171' }}>Failed</span>
        ) : null}
      </td>

      {/* Tokens + cost */}
      <td style={{ padding: '11px 16px', width: 130, textAlign: 'right' }}>
        {tokens && (
          <span style={{ fontSize: 11, color: '#334155', fontVariantNumeric: 'tabular-nums' }}
            title={`${formatTokens(session.inputTokens || 0)} in / ${formatTokens(session.outputTokens || 0)} out`}>
            {tokens} · {cost}
          </span>
        )}
      </td>

      {/* Elapsed / date */}
      <td style={{ padding: '11px 20px 11px 0', width: 90, textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
          {elapsed ?? ''}
        </span>
      </td>
    </tr>
  );
}

function FilterTab({ label, active, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#1e293b' : 'transparent',
      border: active ? '1px solid #334155' : '1px solid transparent',
      borderRadius: 6, color: active ? '#f1f5f9' : '#475569',
      padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: active ? 500 : 400,
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {label}
      {count > 0 && (
        <span style={{
          background: active ? '#334155' : '#1e293b',
          color: active ? '#94a3b8' : '#475569',
          borderRadius: 10, padding: '0 5px', fontSize: 10,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function AgentCards({ sessions, onSelect, onNew, now, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const counts = {
    all:      sessions.length,
    running:  sessions.filter(s => s.status === 'running').length,
    work:     sessions.filter(s => s.is_work).length,
    personal: sessions.filter(s => !s.is_work).length,
    done:     sessions.filter(s => s.status === 'done').length,
    error:    sessions.filter(s => s.status === 'error').length,
  };

  const filtered = sessions
    .filter(s => {
      if (filter === 'running')  return s.status === 'running';
      if (filter === 'work')     return s.is_work;
      if (filter === 'personal') return !s.is_work;
      if (filter === 'done')     return s.status === 'done';
      if (filter === 'error')    return s.status === 'error';
      return true;
    })
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (s.title || '').toLowerCase().includes(q) ||
             (s.linear_issue_key || '').toLowerCase().includes(q);
    });

  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return 0;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>Dashboard</h1>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#475569' }}>
              {counts.running > 0 ? `${counts.running} running · ` : ''}
              {counts.all} session{counts.all !== 1 ? 's' : ''}
              {counts.work > 0 ? ` · ${counts.work} work` : ''}
            </p>
          </div>
          <button onClick={onNew} style={{
            background: '#1d4ed8', border: 'none', borderRadius: 7,
            color: '#fff', padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}>
            + New agent
          </button>
        </div>

        {/* Filters + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <FilterTab
              key={f.key}
              label={f.label}
              active={filter === f.key}
              count={f.key !== 'all' ? counts[f.key] : 0}
              onClick={() => setFilter(f.key)}
            />
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              marginLeft: 'auto', background: '#1e293b', border: '1px solid #334155',
              borderRadius: 6, color: '#f1f5f9', padding: '5px 10px',
              fontSize: 12, outline: 'none', width: 150,
            }}
          />
        </div>
      </div>

      <ActionItems onNavigate={onNavigate} />

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 0 }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 80, color: '#334155' }}>
            <div style={{ marginBottom: 10 }}><Robot size={32} color="#334155" /></div>
            <div style={{ fontSize: 14 }}>
              {search || filter !== 'all' ? 'No sessions match this filter.' : 'No agents yet. Start one above.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={{ width: 28 }} />
                <th style={{ padding: '6px 16px 6px 10px', textAlign: 'left', fontSize: 10, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session</th>
                <th style={{ padding: '6px 16px', textAlign: 'left', fontSize: 10, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 120 }}>Type</th>
                <th style={{ padding: '6px 16px', textAlign: 'left', fontSize: 10, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 180 }}>Activity</th>
                <th style={{ padding: '6px 16px', textAlign: 'right', fontSize: 10, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 130 }}>Usage</th>
                <th style={{ padding: '6px 20px 6px 0', textAlign: 'right', fontSize: 10, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', width: 90 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => <Row key={s.id} session={s} onSelect={onSelect} now={now} />)}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
