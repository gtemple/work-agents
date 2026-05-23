export default function PlanCard({ plan, onApprove, onReject }) {
  return (
    <div style={{
      border: '1px solid #3b82f655',
      borderLeft: '3px solid #3b82f6',
      borderRadius: 8, padding: '14px 16px',
      background: '#0d1f3c', marginBottom: 16,
      animation: 'gateIn 0.2s ease-out',
      width: '80%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa' }}>
          Implementation plan — approval required
        </span>
      </div>

      <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 12px', lineHeight: 1.6 }}>
        {plan.summary}
      </p>

      {plan.files_to_change?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Files to change
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {plan.files_to_change.map((f, i) => (
              <span key={i} style={{
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#94a3b8',
                fontFamily: 'monospace',
              }}>{f}</span>
            ))}
          </div>
        </div>
      )}

      {plan.steps?.length > 0 && (
        <div style={{ marginBottom: plan.risks ? 10 : 14 }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Steps
          </div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {plan.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {plan.risks && (
        <div style={{ marginBottom: 14, padding: '8px 10px', background: '#1a1400', borderRadius: 6, border: '1px solid #f59e0b33' }}>
          <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{plan.risks}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          background: '#1d4ed8', border: 'none', borderRadius: 6,
          color: '#fff', padding: '6px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>
          Approve & proceed
        </button>
        <button onClick={onReject} style={{
          background: 'transparent', border: '1px solid #475569', borderRadius: 6,
          color: '#94a3b8', padding: '6px 16px', cursor: 'pointer', fontSize: 13,
        }}>
          Revise plan
        </button>
      </div>

      <style>{`
        @keyframes gateIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
