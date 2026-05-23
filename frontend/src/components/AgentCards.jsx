import { formatElapsed, TOOL_ICONS, estimateCost, formatCost, formatTokens } from '../utils';

const STATUS_LABEL = { idle: 'idle', running: 'running', done: 'done', error: 'error' };

function Card({ session, onSelect, now }) {
  const running = session.status === 'running';
  const elapsed = running ? formatElapsed(session.startedAt, now) : null;
  const lastTool = running && session.liveSteps.length
    ? session.liveSteps.filter(s => s.step_type === 'tool_call').at(-1)?.data?.tool
    : null;

  return (
    <button
      onClick={() => onSelect(session.id)}
      style={{
        background: '#0d1829',
        border: `1px solid ${running ? session.color + '55' : '#1e293b'}`,
        borderRadius: 10, padding: 0, cursor: 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: running ? `0 0 16px ${session.color}22` : 'none',
        animation: running ? 'cardPulse 2s ease-in-out infinite' : 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      {/* color bar */}
      <div style={{ height: 3, background: session.color, width: '100%' }} />

      <div style={{ padding: '14px 16px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: running ? session.color : STATUS_LABEL[session.status] === 'done' ? '#4ade80' : '#475569',
          }}>
            {STATUS_LABEL[session.status] || 'idle'}
          </span>
          {elapsed && (
            <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>{elapsed}</span>
          )}
        </div>

        <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500, marginBottom: 10, lineHeight: 1.4 }}>
          {session.title || 'New agent'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastTool && (
            <span style={{ fontSize: 11, color: session.color }}>
              {TOOL_ICONS[lastTool] || '🔧'} {lastTool}…
            </span>
          )}
          <span style={{ fontSize: 11, color: '#475569', marginLeft: lastTool ? 'auto' : 0 }}>
            {session.stepCount > 0 ? `${session.stepCount} steps` : ''}
            {session.outputTokens > 0
              ? ` · ${formatCost(estimateCost(session.inputTokens || 0, session.outputTokens))}`
              : ''}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function AgentCards({ sessions, onSelect, onNew, now }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
            {sessions.filter(s => s.status === 'running').length} running · {sessions.length} total
          </p>
        </div>
        <button onClick={onNew} style={{
          background: '#1d4ed8', border: 'none', borderRadius: 8,
          color: '#fff', padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
        }}>
          + New agent
        </button>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 80, color: '#334155' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 15 }}>No agents yet. Start one above.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {sessions.map(s => <Card key={s.id} session={s} onSelect={onSelect} now={now} />)}
        </div>
      )}

      <style>{`
        @keyframes cardPulse {
          0%, 100% { box-shadow: var(--glow-base); }
          50% { box-shadow: var(--glow-peak); }
        }
      `}</style>
    </div>
  );
}
