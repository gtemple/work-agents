export default function Toast({ toasts, onDismiss, onSelect }) {
  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 1000,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#1e293b', border: `1px solid ${t.color}55`,
          borderRadius: 10, padding: '12px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          minWidth: 240, maxWidth: 300,
          boxShadow: `0 4px 24px #00000066, 0 0 0 1px ${t.color}22`,
          animation: 'toastIn 0.2s ease-out',
          cursor: 'pointer',
        }} onClick={() => { onSelect(t.id); onDismiss(t.id); }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: t.color, flexShrink: 0, marginTop: 4,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title || 'Agent'} finished
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {t.stepCount} step{t.stepCount !== 1 ? 's' : ''} · click to view
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(t.id); }}
            style={{
              background: 'none', border: 'none', color: '#475569',
              cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
