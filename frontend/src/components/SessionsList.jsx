import { estimateCost, timeAgo } from '../utils';

const PLANNING_TOOLS = ['read_file', 'list_files', 'clone_repo', 'git_status', 'git_diff', 'get_pr', 'get_pr_diff', 'web_search', 'fetch_page', 'memory_read', 'memory_list', 'read_user_context', 'read_repo_memory'];
const REVIEW_TOOLS   = ['git_push', 'create_pr', 'post_pr_review'];
const TESTING_TOOLS  = ['run_code', 'bash'];

function getPhase(liveSteps) {
  if (!liveSteps?.length) return null;
  const last = [...liveSteps].reverse().find(s => s.step_type === 'tool_call')?.data?.tool;
  if (!last) return null;
  if (REVIEW_TOOLS.includes(last))   return 'review';
  if (TESTING_TOOLS.includes(last))  return 'testing';
  if (PLANNING_TOOLS.includes(last)) return 'planning';
  return 'editing';
}

function PhaseStrip({ phase }) {
  const stages = ['planning', 'editing', 'testing', 'review'];
  const idx = stages.indexOf(phase);
  return (
    <span className="phase">
      {stages.map((st, i) => (
        <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i className={i < idx ? 'done' : i === idx ? 'on' : ''} />
          {i === idx && <span className="on">{st}</span>}
        </span>
      ))}
    </span>
  );
}

export function getSessionStatus(s) {
  if (s.pendingApproval) return 'needs_input';
  if (s.hasPendingPlan)  return 'planned';
  if (s.status === 'running') return 'running';
  if (s.status === 'error')   return 'error';
  if (s.status === 'done')    return 'done';
  return 'queued';
}

export default function SessionsList({ items, onOpen, now }) {
  return (
    <div className="sessions">
      <div className="sess-head">
        <span></span>
        <span>session</span>
        <span>kind / phase</span>
        <span style={{ textAlign: 'right' }}>tokens</span>
        <span style={{ textAlign: 'right' }}>cost</span>
        <span style={{ textAlign: 'right' }}>when</span>
      </div>
      {items.map(s => {
        const status = getSessionStatus(s);
        const tokens = (s.inputTokens || 0) + (s.outputTokens || 0);
        const cost = estimateCost(s.inputTokens || 0, s.outputTokens || 0);
        const phase = status === 'running' ? getPhase(s.liveSteps) : null;
        const when = s.created_at ? timeAgo(new Date(s.created_at).getTime(), now) : '—';

        return (
          <div key={s.id} className="sess-row"
            data-needs={status === 'needs_input' ? '1' : '0'}
            onClick={() => onOpen(s.id)}>
            <span className={`st ${status}`} />
            <span className="title">
              {s.linear_issue_key && <span className="ref">{s.linear_issue_key}</span>}
              <span className="t">{s.title || 'Untitled'}</span>
              {status === 'needs_input' && <span className="needs-pill">! needs input</span>}
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`tag ${s.is_work ? 'work' : 'personal'}`}>
                <span className="d" />{s.is_work ? 'work' : 'personal'}
              </span>
              {s.linear_task_type && (
                <span className={`kind${s.linear_task_type === 'bug' ? ' bug' : ''}`}>{s.linear_task_type}</span>
              )}
              {phase && <PhaseStrip phase={phase} />}
            </span>
            <span className="num">{tokens ? `${(tokens / 1000).toFixed(1)}k` : '—'}</span>
            <span className="num">{cost > 0.0001 ? `$${cost.toFixed(4)}` : '—'}</span>
            <span className="when">{when}</span>
          </div>
        );
      })}
    </div>
  );
}
