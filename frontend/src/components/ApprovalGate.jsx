import { TOOL_ICONS, argsSummary } from '../utils';

const TOOL_DESCRIPTIONS = {
  git_push: 'Push branch to GitHub remote',
  create_pr: 'Open a pull request on GitHub',
  post_pr_review: 'Post a review on a GitHub PR',
};

export default function ApprovalGate({ approval, onApprove, onReject }) {
  const { tool, args } = approval;
  const summary = argsSummary(tool, args);

  return (
    <div style={{
      border: '1px solid #f59e0b55',
      borderLeft: '3px solid #f59e0b',
      borderRadius: 8, padding: '12px 16px',
      background: '#1a1400', marginBottom: 16,
      animation: 'gateIn 0.2s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>
          Approval required
        </span>
      </div>

      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
        <span style={{ marginRight: 6 }}>{TOOL_ICONS[tool] || '🔧'}</span>
        <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{tool}</span>
        {' — '}
        <span>{TOOL_DESCRIPTIONS[tool] || tool}</span>
        {summary && (
          <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{summary}</div>
        )}
        {args.title && (
          <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>"{args.title}"</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          background: '#16a34a', border: 'none', borderRadius: 6,
          color: '#fff', padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>
          Approve
        </button>
        <button onClick={onReject} style={{
          background: 'transparent', border: '1px solid #475569', borderRadius: 6,
          color: '#94a3b8', padding: '6px 16px', cursor: 'pointer', fontSize: 13,
        }}>
          Reject
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
