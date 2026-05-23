const STATUS_DOT = {
  idle:    { color: '#475569', pulse: false },
  running: { color: '#22d3ee', pulse: true  },
  done:    { color: '#4ade80', pulse: false },
  error:   { color: '#f87171', pulse: false },
};

function StatusDot({ status }) {
  const { color, pulse } = STATUS_DOT[status] ?? STATUS_DOT.idle;
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7,
      borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: pulse ? `0 0 0 2px ${color}44` : 'none',
      animation: pulse ? 'pulse 1.2s ease-in-out infinite' : 'none',
    }} />
  );
}

export default function Sidebar({ sessions, activeId, onSelect, onNew }) {
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
        <span style={{ fontWeight: 600, fontSize: 13, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Agents
        </span>
        <button onClick={onNew} title="New agent" style={{
          background: '#1d4ed8', border: 'none', borderRadius: 6,
          color: '#fff', width: 24, height: 24, cursor: 'pointer',
          fontSize: 16, lineHeight: '24px', textAlign: 'center', padding: 0,
        }}>+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#334155', fontSize: 12, textAlign: 'center' }}>
            No agents yet
          </div>
        )}
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              width: '100%', textAlign: 'left', background: s.id === activeId ? '#1e293b' : 'transparent',
              border: 'none', borderLeft: s.id === activeId ? '2px solid #1d4ed8' : '2px solid transparent',
              padding: '9px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              color: s.id === activeId ? '#f1f5f9' : '#64748b',
            }}
          >
            <StatusDot status={s.status} />
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {s.title || 'New agent'}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
