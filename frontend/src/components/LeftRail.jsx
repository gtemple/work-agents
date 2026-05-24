import { useState } from 'react';
import { estimateCost } from '../utils';

function sessionStatus(s) {
  if (s.pendingApproval) return 'needs_input';
  if (s.hasPendingPlan) return 'planned';
  if (s.status === 'running') return 'running';
  if (s.status === 'error') return 'error';
  if (s.status === 'done') return 'done';
  return 'queued';
}

export default function LeftRail({ sessions, selected, onSelect, scope, setScope, onNew, onMemory, onSchedules, onStats, globalInputTokens, globalOutputTokens }) {
  const [openWork, setOpenWork] = useState(true);
  const [openPersonal, setOpenPersonal] = useState(true);
  const [filter, setFilter] = useState('');

  const work = sessions.filter(s => s.is_work);
  const personal = sessions.filter(s => !s.is_work);
  const totalTokens = globalInputTokens + globalOutputTokens;
  const cost = estimateCost(globalInputTokens, globalOutputTokens);

  const filterFn = s => !filter || (s.title || '').toLowerCase().includes(filter.toLowerCase()) || (s.linear_issue_key || '').toLowerCase().includes(filter.toLowerCase());

  const renderRow = s => {
    const st = sessionStatus(s);
    const tag = s.hasPendingPlan ? 'plan ready' : s.linear_task_type || null;
    const tagCls = tag === 'plan ready' ? 'plan' : tag === 'bug' ? 'bug' : 'feature';
    return (
      <div key={s.id} className="tree-row" data-on={selected === s.id ? '1' : '0'} onClick={() => onSelect(s.id)}>
        <span className={`status ${st}`} />
        <span className="id">{s.linear_issue_key || s.id.slice(0, 8)}</span>
        <span className="ti">{s.title || 'Untitled'}</span>
        {tag && <span className={`tag ${tagCls}`}>{tag}</span>}
      </div>
    );
  };

  const visWork = (scope === 'all' || scope === 'work') ? work.filter(filterFn) : [];
  const visPersonal = (scope === 'all' || scope === 'personal') ? personal.filter(filterFn) : [];

  return (
    <aside className="rail">
      <div className="rh">
        <span>agents</span>
        <button title="new agent" onClick={onNew}>+</button>
      </div>
      <div className="search">
        <input placeholder="filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <span className="kbd">/</span>
      </div>
      <div className="scope">
        {['all', 'work', 'personal'].map(s => (
          <button key={s} data-on={scope === s ? '1' : '0'} onClick={() => setScope(s)}>{s}</button>
        ))}
      </div>
      <div className="list">
        {(scope === 'all' || scope === 'work') && (
          <>
            <div className="tree-h" onClick={() => setOpenWork(o => !o)}>
              <span className="caret">{openWork ? '▾' : '▸'}</span>
              <span>work</span>
              <span className="count">{visWork.length}</span>
            </div>
            {openWork && visWork.map(renderRow)}
          </>
        )}
        {(scope === 'all' || scope === 'personal') && (
          <>
            <div className="tree-h" onClick={() => setOpenPersonal(o => !o)} style={{ marginTop: 6 }}>
              <span className="caret">{openPersonal ? '▾' : '▸'}</span>
              <span>personal</span>
              <span className="count">{visPersonal.length}</span>
            </div>
            {openPersonal && visPersonal.map(renderRow)}
          </>
        )}
      </div>
      <div className="foot">
        <div className="row"><span>sessions</span><b>{sessions.length}</b></div>
        <div className="row"><span>tokens</span><b>{totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens}</b></div>
        <div className="row"><span>cost</span><b>${cost.toFixed(4)}</b></div>
        <div className="actions">
          <button onClick={onMemory}>memory</button>
          <button onClick={onSchedules}>schedules</button>
          <button onClick={onStats}>stats</button>
        </div>
      </div>
    </aside>
  );
}
