import { argsSummary, timeAgo } from '../utils';
import { ToolIcon } from './Icons';

export default function ActivityFeed({ events, now }) {
  return (
    <div style={{
      width: 250, flexShrink: 0,
      background: '#080f1c', borderLeft: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 14px 10px', borderBottom: '1px solid #1e293b', flexShrink: 0,
        fontSize: 11, fontWeight: 600, color: '#475569',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        Activity
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {events.length === 0 && (
          <div style={{ padding: '24px 14px', color: '#1e293b', fontSize: 12, textAlign: 'center' }}>
            Tool calls will appear here
          </div>
        )}
        {events.map(ev => (
          <div key={ev.id} style={{
            padding: '8px 12px', borderBottom: '1px solid #0d1829',
            animation: 'feedIn 0.2s ease-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: ev.color, flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {ev.sessionTitle || 'Agent'}
              </span>
              <span style={{ fontSize: 10, color: '#334155', flexShrink: 0 }}>
                {timeAgo(ev.ts, now)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <ToolIcon tool={ev.tool} size={12} color="#475569" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{ev.tool}</span>
            </div>
            {argsSummary(ev.tool, ev.args) && (
              <div style={{
                fontSize: 11, color: '#475569', paddingLeft: 12, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {argsSummary(ev.tool, ev.args)}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes feedIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
