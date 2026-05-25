import { useState } from 'react';
import { argsSummary } from '../utils';
import { ToolIcon, Warning, CaretDown } from './Icons';

const TOOL_DESCRIPTIONS = {
  git_push:      'Push branch to GitHub remote',
  create_pr:     'Open a pull request on GitHub',
  post_pr_review:'Post a review on a GitHub PR',
};

function DiffLine({ line }) {
  const color =
    line.startsWith('+') && !line.startsWith('+++') ? '#4ade80' :
    line.startsWith('-') && !line.startsWith('---') ? '#f87171' :
    line.startsWith('@@') ? '#818cf8' :
    line.startsWith('diff ') || line.startsWith('index ') ? '#94a3b8' :
    '#64748b';
  return <div style={{ color, whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}>{line}</div>;
}

export default function ApprovalGate({ approval, onApprove, onReject }) {
  const { tool, args, diff } = approval;
  const summary = argsSummary(tool, args);
  const [diffOpen, setDiffOpen] = useState(false);

  return (
    <div style={{
      border: '1px solid #f59e0b55',
      borderLeft: '3px solid #f59e0b',
      borderRadius: 8,
      background: '#1a1400', marginBottom: 16,
      animation: 'gateIn 0.2s ease-out',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Warning size={16} color="#f59e0b" weight="fill" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>
            Approval required
          </span>
        </div>

        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
            <ToolIcon tool={tool} size={13} color="#94a3b8" />
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{tool}</span>
          </span>
          {' — '}
          <span>{TOOL_DESCRIPTIONS[tool] || tool}</span>
          {summary && (
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{summary}</div>
          )}
          {args.title && (
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>"{args.title}"</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          {diff && (
            <button onClick={() => setDiffOpen(o => !o)} style={{
              background: 'transparent', border: '1px solid #1e293b', borderRadius: 6,
              color: '#475569', padding: '6px 10px', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
            }}>
              <CaretDown size={10} style={{ transform: diffOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
              diff
            </button>
          )}
        </div>
      </div>

      {diff && diffOpen && (
        <div style={{
          borderTop: '1px solid #1e293b',
          maxHeight: 400, overflowY: 'auto',
          padding: '10px 14px',
          background: '#0a0e16',
        }}>
          {diff.split('\n').map((line, i) => <DiffLine key={i} line={line} />)}
        </div>
      )}

      <style>{`
        @keyframes gateIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
