import { useState } from 'react';
import { formatElapsed, TOOL_ICONS, estimateCost, formatCost, formatTokens } from '../utils';

const STATUS_CONFIG = {
  running: { label: 'Running', color: '#22d3ee', dot: true },
  done:    { label: 'Done',    color: '#4ade80', dot: false },
  error:   { label: 'Error',   color: '#f87171', dot: false },
  idle:    { label: 'Idle',    color: '#334155', dot: false },
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

function Card({ session, onSelect, now }) {
  const running = session.status === 'running';
  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle;
  const elapsed = running ? formatElapsed(session.startedAt, now) : null;
  const lastTool = running && session.liveSteps.length
    ? session.liveSteps.filter(s => s.step_type === 'tool_call').at(-1)?.data?.tool
    : null;
  const badge = session.linear_task_type && TASK_TYPE_BADGE[session.linear_task_type];
  const cost = (session.inputTokens || session.outputTokens)
    ? formatCost(estimateCost(session.inputTokens || 0, session.outputTokens || 0))
    : null;

  return (
    <button
      onClick={() => onSelect(session.id)}
      style={{
        background: '#0a1628',
        border: `1px solid ${running ? session.color + '44' : '#1e293b'}`,
        borderTop: `2px solid ${running ? session.color : session.color + '66'}`,
        borderRadius: 10, padding: 0, cursor: 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: running ? `0 4px 24px ${session.color}18` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        minHeight: 120,
      }}
    >
      <div style={{ padding: '13px 15px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Top row: status + elapsed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {status.dot ? (
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: status.color, flexShrink: 0,
              boxShadow: `0 0 0 2px ${status.color}44`,
              animation: 'pulse 1.2s ease-in-out infinite',
            }} />
          ) : (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 10, fontWeight: 600, color: status.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {status.label}
          </span>
          {session.is_work && (
            <span style={{
              fontSize: 9, color: '#3b82f6', background: '#0d1f3c',
              border: '1px solid #3b82f633', borderRadius: 3, padding: '0 5px', marginLeft: 2,
            }}>
              work
            </span>
          )}
          {elapsed && (
            <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {elapsed}
            </span>
          )}
        </div>

        {/* Title */}
        <div style={{ flex: 1 }}>
          {session.linear_issue_key && (
            <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 2 }}>{session.linear_issue_key}</div>
          )}
          <div style={{
            fontSize: 13, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {session.linear_issue_key
              ? (session.title || '').replace(/^[A-Z]+-\d+:\s*/, '')
              : (session.title || 'New agent')}
          </div>
        </div>

        {/* Bottom row: tool ticker / meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
          {badge && (
            <span style={{
              fontSize: 9, color: badge.color, border: `1px solid ${badge.color}44`,
              borderRadius: 3, padding: '1px 5px',
            }}>
              {badge.label}
            </span>
          )}

          {lastTool ? (
            <span style={{ fontSize: 11, color: session.color }}>
              {TOOL_ICONS[lastTool] || '🔧'} {lastTool}
            </span>
          ) : session.stepCount > 0 ? (
            <span style={{ fontSize: 11, color: '#475569' }}>
              {session.stepCount} step{session.stepCount !== 1 ? 's' : ''}
            </span>
          ) : null}

          {cost && (
            <span style={{ fontSize: 11, color: '#334155', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {cost}
            </span>
          )}

          {session.status === 'error' && !lastTool && (
            <span style={{ fontSize: 11, color: '#f87171' }}>Failed</span>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </button>
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
      transition: 'all 0.15s',
    }}>
      {label}
      {count > 0 && (
        <span style={{
          background: active ? '#334155' : '#1e293b',
          color: active ? '#94a3b8' : '#475569',
          borderRadius: 10, padding: '0 5px', fontSize: 10, minWidth: 16, textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function AgentCards({ sessions, onSelect, onNew, now }) {
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

  // Running first, then by created_at desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return 0;
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 28px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
            {counts.running > 0 ? `${counts.running} running · ` : ''}{counts.all} session{counts.all !== 1 ? 's' : ''}
            {counts.work > 0 ? ` · ${counts.work} work` : ''}
          </p>
        </div>
        <button onClick={onNew} style={{
          background: '#1d4ed8', border: 'none', borderRadius: 8,
          color: '#fff', padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>
          + New agent
        </button>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <FilterTab
              key={f.key}
              label={f.label}
              active={filter === f.key}
              count={f.key !== 'all' ? counts[f.key] : 0}
              onClick={() => setFilter(f.key)}
            />
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            marginLeft: 'auto', background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, color: '#f1f5f9', padding: '5px 10px',
            fontSize: 12, outline: 'none', width: 160,
          }}
        />
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 80, color: '#334155' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
          <div style={{ fontSize: 14 }}>
            {search || filter !== 'all' ? 'No sessions match this filter.' : 'No agents yet. Start one above.'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {sorted.map(s => <Card key={s.id} session={s} onSelect={onSelect} now={now} />)}
        </div>
      )}
    </div>
  );
}
