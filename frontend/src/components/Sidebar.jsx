import { useState } from 'react';
import { formatElapsed, formatTokens, estimateCost, formatCost } from '../utils';

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

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDashboard, onMemory, onSchedules, globalInputTokens, globalOutputTokens, now }) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? sessions.filter(s => (s.title || 'New agent').toLowerCase().includes(search.toLowerCase()))
    : sessions;

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
        {filtered.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#334155', fontSize: 12, textAlign: 'center' }}>
            {search ? 'No matches' : 'No agents yet'}
          </div>
        )}
        {filtered.map(s => {
          const isActive = s.id === activeId;
          const elapsed = s.status === 'running' ? formatElapsed(s.startedAt, now) : null;
          return (
            <button
              key={s.id}
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
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || 'New agent'}
                </div>
                {(s.status === 'running' || s.stepCount > 0) && (
                  <div style={{ fontSize: 10, color: s.status === 'running' ? s.color : '#475569', marginTop: 2 }}>
                    {s.stepCount > 0 ? `${s.stepCount} step${s.stepCount !== 1 ? 's' : ''}` : ''}
                    {elapsed ? ` · ${elapsed}` : ''}
                  </div>
                )}
              </div>
            </button>
          );
        })}
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
        <button onClick={onMemory} style={{
          flex: 1, background: 'none', border: '1px solid #1e293b',
          borderRadius: 6, color: '#475569', padding: '6px 0',
          cursor: 'pointer', fontSize: 12, textAlign: 'center',
        }}>
          Memory
        </button>
        <button onClick={onSchedules} style={{
          flex: 1, background: 'none', border: '1px solid #1e293b',
          borderRadius: 6, color: '#475569', padding: '6px 0',
          cursor: 'pointer', fontSize: 12, textAlign: 'center',
        }}>
          Schedules
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
