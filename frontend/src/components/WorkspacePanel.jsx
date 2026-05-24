import { useState, useEffect } from 'react';
import {
  listMemories, writeMemory, deleteMemory,
  getUserContext, updateUserContext,
  listRepoMemories, updateRepoMemory,
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
  getStats,
} from '../api';
import { estimateCost } from '../utils';

const INTERVALS = [
  { value: 60,    label: 'every hour' },
  { value: 360,   label: 'every 6 hours' },
  { value: 1440,  label: 'every day' },
  { value: 10080, label: 'every week' },
];

function intervalLabel(minutes) {
  return INTERVALS.find(i => i.value === minutes)?.label ?? `every ${minutes}m`;
}

function timeUntil(iso) {
  if (!iso) return '—';
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'due now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

// ── about me ─────────────────────────────────────────────────────────────────
function MemAbout() {
  const [val, setVal] = useState(null);
  const [saved, setSaved] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserContext().then(d => {
      setVal(d.content ?? '');
      setSaved(d.content ?? '');
      setUpdatedAt(d.updated_at);
    });
  }, []);

  const dirty = val !== null && val !== saved;
  const lines = (val ?? '').split('\n');
  const lineNos = lines.map((_, i) => String(i + 1).padStart(2, ' ')).join('\n');

  async function save() {
    setSaving(true);
    await updateUserContext(val);
    setSaved(val);
    setSaving(false);
  }

  return (
    <>
      <div className="pane-head">
        <span className="title">about me</span>
        <span className="sub">what agents have learned about you — edit directly or let agents update it.</span>
      </div>
      <div className="pane-body">
        {val === null ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', fontSize: 11.5 }}>loading…</div>
        ) : (
          <div className="mem-editor" style={{ margin: '12px 24px', height: 'calc(100% - 48px)' }}>
            <div className="me-head">
              <span className="file">about.md</span>
              {dirty && <span className="dirty">● modified</span>}
              <span className="right">
                <button onClick={() => setVal(saved)}>revert</button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  style={{ color: dirty ? 'var(--accent)' : 'var(--fg-4)', borderColor: dirty ? 'rgba(230,179,74,.4)' : 'var(--line-2)' }}>
                  {saving ? 'saving…' : 'save'}
                </button>
              </span>
            </div>
            <div className="me-body">
              <pre className="me-gutter">{lineNos}</pre>
              <textarea
                className="me-text"
                value={val}
                spellCheck={false}
                onChange={e => setVal(e.target.value)}
                placeholder="Nothing stored yet. Agents will fill this in as they learn about you."
              />
            </div>
            <div className="me-foot">
              <span>{lines.length} lines · {val.length} chars · markdown</span>
              {updatedAt && <span style={{ marginLeft: 'auto' }}>last updated {new Date(updatedAt).toLocaleString()}</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── memory keys ──────────────────────────────────────────────────────────────
function MemKeys() {
  const [memories, setMemories] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listMemories().then(d => setMemories(d.memories || []));
  }, []);

  async function add() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    const mem = await writeMemory(newKey.trim(), newValue.trim());
    setMemories(prev => [mem, ...prev.filter(m => m.key !== mem.key)]);
    setNewKey(''); setNewValue('');
    setSaving(false);
  }

  async function saveEdit(key) {
    const mem = await writeMemory(key, editVal);
    setMemories(prev => prev.map(m => m.key === key ? mem : m));
    setEditing(null);
  }

  async function remove(key) {
    await deleteMemory(key);
    setMemories(prev => prev.filter(m => m.key !== key));
  }

  return (
    <>
      <div className="pane-head">
        <span className="title">memory keys</span>
        <span className="sub">persistent key-value store — agents read and write automatically.</span>
      </div>
      <div className="pane-body">
        <div className="sched-new" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
          <input
            placeholder='key (e.g. "auth-approach")'
            value={newKey}
            onChange={e => setNewKey(e.target.value)} />
          <input
            placeholder="value…"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button className="add-btn" onClick={add} disabled={saving || !newKey.trim() || !newValue.trim()}>
            {saving ? '…' : 'add'}
          </button>
        </div>
        {memories === null ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', fontSize: 11.5 }}>loading…</div>
        ) : memories.length === 0 ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', textAlign: 'center', fontSize: 11.5 }}>
            no entries yet · agents write here automatically
          </div>
        ) : (
          <div className="mem-list">
            {memories.map(m => (
              <div key={m.key} className="mem-row" style={{ gridTemplateColumns: '1fr auto auto auto', gap: 12 }}>
                <span className="nm">{m.key}
                  {editing !== m.key && <span className="sub" style={{ marginTop: 2 }}>{m.value}</span>}
                </span>
                <span className="when">{new Date(m.updated_at).toLocaleDateString()}</span>
                <button className="act" onClick={() => { setEditing(m.key); setEditVal(m.value); }}>edit</button>
                <button className="act" onClick={() => remove(m.key)}>del</button>
                {editing === m.key && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <textarea
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      rows={3}
                      style={{
                        flex: 1, background: 'var(--bg)', border: '1px solid var(--line)',
                        color: 'var(--fg)', font: 'inherit', fontFamily: 'var(--mono)',
                        fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r)',
                        outline: 'none', resize: 'vertical',
                      }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button className="add-btn" style={{ height: 'auto', padding: '4px 10px' }} onClick={() => saveEdit(m.key)}>save</button>
                      <button onClick={() => setEditing(null)} style={{
                        background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--fg-3)',
                        padding: '4px 10px', fontSize: 11, borderRadius: 'var(--r)', cursor: 'pointer', font: 'inherit',
                      }}>cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── repos ─────────────────────────────────────────────────────────────────────
function MemRepos() {
  const [repos, setRepos] = useState(null);
  const [selected, setSelected] = useState(null);
  const [val, setVal] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listRepoMemories().then(d => {
      const list = d.repos ?? [];
      setRepos(list);
      if (list.length) {
        setSelected(list[0].repo);
        setVal(list[0].content ?? '');
        setSaved(list[0].content ?? '');
      }
    });
  }, []);

  function selectRepo(repo) {
    const r = repos.find(x => x.repo === repo);
    setSelected(repo);
    setVal(r?.content ?? '');
    setSaved(r?.content ?? '');
  }

  async function save() {
    setSaving(true);
    await updateRepoMemory(selected, val);
    setRepos(prev => prev.map(r => r.repo === selected ? { ...r, content: val } : r));
    setSaved(val);
    setSaving(false);
  }

  const dirty = val !== saved;

  return (
    <>
      <div className="pane-head">
        <span className="title">repo knowledge</span>
        <span className="sub">architecture notes, conventions, and gotchas agents have learned.</span>
      </div>
      <div className="pane-body" style={{ display: 'flex', overflow: 'hidden' }}>
        {repos === null ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', fontSize: 11.5 }}>loading…</div>
        ) : repos.length === 0 ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', textAlign: 'center', fontSize: 11.5 }}>
            no repos yet · agents populate this when working on a repository
          </div>
        ) : (
          <>
            <div className="ws-sidenav" style={{ width: 180 }}>
              {repos.map(r => (
                <div key={r.repo} className="sn-item" data-on={selected === r.repo ? '1' : '0'}
                  onClick={() => selectRepo(r.repo)}>
                  <span className="ic">⎇</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.repo.split('/').pop()}
                  </span>
                </div>
              ))}
            </div>
            {selected && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <div className="mem-editor" style={{ margin: '12px 24px', flex: 1 }}>
                  <div className="me-head">
                    <span className="file">{selected}</span>
                    {dirty && <span className="dirty">● modified</span>}
                    <span className="right">
                      <button onClick={() => { setVal(saved); }}>revert</button>
                      <button onClick={save} disabled={saving || !dirty}
                        style={{ color: dirty ? 'var(--accent)' : 'var(--fg-4)', borderColor: dirty ? 'rgba(230,179,74,.4)' : 'var(--line-2)' }}>
                        {saving ? 'saving…' : 'save'}
                      </button>
                    </span>
                  </div>
                  <div className="me-body">
                    <pre className="me-gutter">{val.split('\n').map((_, i) => String(i + 1).padStart(2, ' ')).join('\n')}</pre>
                    <textarea className="me-text" value={val} spellCheck={false}
                      onChange={e => setVal(e.target.value)}
                      placeholder="No knowledge stored yet." />
                  </div>
                  <div className="me-foot">
                    <span>{val.split('\n').length} lines · {val.length} chars</span>
                    {repos.find(r => r.repo === selected)?.updated_at && (
                      <span style={{ marginLeft: 'auto' }}>
                        last updated {new Date(repos.find(r => r.repo === selected).updated_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── memory view ───────────────────────────────────────────────────────────────
function MemoryView() {
  const [sub, setSub] = useState('about');
  return (
    <>
      <nav className="ws-sidenav">
        <div className="sn-h">memory</div>
        {[
          { k: 'about', ic: '≡', label: 'about me' },
          { k: 'keys',  ic: '⚿', label: 'keys' },
          { k: 'repos', ic: '⎇', label: 'repos' },
        ].map(({ k, ic, label }) => (
          <div key={k} className="sn-item" data-on={sub === k ? '1' : '0'} onClick={() => setSub(k)}>
            <span className="ic">{ic}</span> {label}
          </div>
        ))}
      </nav>
      <div className="ws-pane">
        {sub === 'about' && <MemAbout />}
        {sub === 'keys'  && <MemKeys />}
        {sub === 'repos' && <MemRepos />}
      </div>
    </>
  );
}

// ── schedules view ────────────────────────────────────────────────────────────
function SchedulesView() {
  const [schedules, setSchedules] = useState(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [interval, setIntervalVal] = useState(1440);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSchedules().then(d => setSchedules(d.schedules || []));
  }, []);

  async function add() {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    const s = await createSchedule({ name: name.trim(), prompt: prompt.trim(), interval_minutes: interval });
    setSchedules(prev => [...prev, s]);
    setName(''); setPrompt(''); setIntervalVal(1440);
    setSaving(false);
  }

  async function toggle(s) {
    const updated = await updateSchedule(s.id, { enabled: !s.enabled });
    setSchedules(prev => prev.map(x => x.id === s.id ? updated : x));
  }

  async function remove(id) {
    await deleteSchedule(id);
    setSchedules(prev => prev.filter(x => x.id !== id));
  }

  return (
    <div className="ws-pane">
      <div className="pane-head">
        <span className="title">schedules</span>
        <span className="sub">
          {schedules ? `${schedules.filter(s => s.enabled).length} active · ` : ''}
          run automatically on interval
        </span>
      </div>
      <div className="pane-body">
        <div className="sched-new">
          <span className="lbl">›</span>
          <input placeholder='name (e.g. "daily PR review")' value={name} onChange={e => setName(e.target.value)} />
          <select value={interval} onChange={e => setIntervalVal(Number(e.target.value))}>
            {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <button className="add-btn" onClick={add} disabled={saving || !name.trim() || !prompt.trim()}>
            {saving ? '…' : 'add'}
          </button>
          <div className="prompt-row">
            <span style={{ color: 'var(--fg-4)', textAlign: 'right', fontSize: 10.5, paddingTop: 6 }}>prompt</span>
            <textarea placeholder="prompt to run on this schedule…" value={prompt}
              onChange={e => setPrompt(e.target.value)} />
          </div>
        </div>

        {schedules === null ? (
          <div style={{ padding: '32px 24px', color: 'var(--fg-4)', fontSize: 11.5 }}>loading…</div>
        ) : (
          <div className="sched-table">
            <div className="sched-head">
              <span></span>
              <span>name / interval</span>
              <span>prompt</span>
              <span>last</span>
              <span>next</span>
              <span></span>
            </div>
            {schedules.map(s => (
              <div key={s.id} className="sched-row" data-off={s.enabled ? '0' : '1'}>
                <button className="tog" data-on={s.enabled ? '1' : '0'} onClick={() => toggle(s)} />
                <span>
                  <div className="nm">{s.name}</div>
                  <div className="cron">{intervalLabel(s.interval_minutes)}</div>
                </span>
                <span className="prm">{s.prompt}</span>
                <span className="last">
                  {s.last_run ? '✓ done' : '—'}
                  <span className="lt">{s.last_run ? new Date(s.last_run).toLocaleDateString() : ''}</span>
                </span>
                <span className="next">
                  {s.enabled ? 'scheduled' : 'paused'}
                  <span className="lt">{s.next_run ? timeUntil(s.next_run) : ''}</span>
                </span>
                <button className="act" title="delete" onClick={() => remove(s.id)}>✕</button>
              </div>
            ))}
            {schedules.length === 0 && (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 11.5 }}>
                no schedules · agents run on demand only
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── stats view ────────────────────────────────────────────────────────────────
function StatsView({ globalModel }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStats().then(setStats);
  }, []);

  if (!stats) return (
    <div className="ws-pane">
      <div className="pane-head"><span className="title">stats</span></div>
      <div className="pane-body" style={{ padding: '32px 24px', color: 'var(--fg-4)', fontSize: 11.5 }}>loading…</div>
    </div>
  );

  const { summary, daily, top_sessions } = stats;
  const totalTokens = (summary.total_input_tokens || 0) + (summary.total_output_tokens || 0);
  // Aggregate cost uses globalModel as best estimate (daily data has no per-model breakdown)
  const totalCost = estimateCost(summary.total_input_tokens || 0, summary.total_output_tokens || 0, globalModel);
  const avgCostPerSession = summary.total_sessions > 0 ? totalCost / summary.total_sessions : 0;
  const avgTokensPerSession = summary.total_sessions > 0 ? totalTokens / summary.total_sessions : 0;

  const last30 = (daily || []).slice(-30);
  const maxTokens = Math.max(...last30.map(d => (d.input_tokens || 0) + (d.output_tokens || 0)), 1);

  const workTokens = summary.work_tokens || 0;
  const personalTokens = summary.personal_tokens || 0;
  const totalScoped = workTokens + personalTokens;
  const workPct = totalScoped > 0 ? Math.round(workTokens / totalScoped * 100) : 50;
  const personalPct = 100 - workPct;

  const peakDay = last30.reduce((best, d) => {
    const t = (d.input_tokens || 0) + (d.output_tokens || 0);
    return t > (best.t || 0) ? { ...d, t } : best;
  }, {});

  const bySource = summary.by_source || [];

  return (
    <div className="ws-pane">
      <div className="pane-head">
        <span className="title">stats</span>
        <span className="sub">last 30 days · {last30.length} days of data</span>
      </div>
      <div className="pane-body" style={{ paddingBottom: 32 }}>
        <div className="stats-strip">
          <div className="cell">
            <span className="lbl">tokens</span>
            <span className="val">{(totalTokens / 1000).toFixed(1)}k</span>
            <span className="sub">{(summary.total_input_tokens / 1000).toFixed(1)}k in · {(summary.total_output_tokens / 1000).toFixed(1)}k out</span>
          </div>
          <div className="cell">
            <span className="lbl">cost</span>
            <span className="val">${totalCost.toFixed(2)}</span>
            <span className="sub">~${(totalCost / 30).toFixed(3)}/day avg</span>
          </div>
          <div className="cell">
            <span className="lbl">sessions</span>
            <span className="val">{summary.total_sessions}</span>
            <span className="sub">{summary.total_turns} turns</span>
          </div>
          <div className="cell">
            <span className="lbl">avg / session</span>
            <span className="val">{(avgTokensPerSession / 1000).toFixed(1)}k</span>
            <span className="sub">${avgCostPerSession.toFixed(4)} each</span>
          </div>
          <div className="cell">
            <span className="lbl">scope split</span>
            <span className="val" style={{ fontSize: 18 }}>
              {workPct}<span style={{ color: 'var(--fg-4)' }}>/</span>{personalPct}
            </span>
            <span className="sub">
              <span style={{ color: 'var(--info)' }}>work</span>
              {' / '}
              <span style={{ color: 'var(--personal)' }}>personal</span>
            </span>
          </div>
          <div className="cell">
            <span className="lbl">peak day</span>
            <span className="val">{(peakDay.t / 1000 || 0).toFixed(1)}k</span>
            <span className="sub">{peakDay.date || '—'}</span>
          </div>
        </div>

        <div className="stats-section">
          <div className="sh">
            <span className="t">daily token usage</span>
            <span className="sub">last 30 days · hover any bar for detail</span>
          </div>
          {last30.length === 0 ? (
            <div style={{ color: 'var(--fg-4)', fontSize: 11.5, padding: '20px 0' }}>no data yet</div>
          ) : (
            <>
              <div className="spark">
                {last30.map((d, i) => {
                  const t = (d.input_tokens || 0) + (d.output_tokens || 0);
                  const h = Math.max(2, (t / maxTokens) * 70);
                  const isToday = i === last30.length - 1;
                  const cost = estimateCost(d.input_tokens || 0, d.output_tokens || 0, globalModel);
                  return (
                    <div key={i} className="col" data-today={isToday ? '1' : '0'} style={{ height: 70 }}>
                      <i style={{ height: `${h}px`, marginTop: `${70 - h}px` }} />
                      <div className="tip">{d.date} · {(t / 1000).toFixed(1)}k tok · ${cost.toFixed(4)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="spark-axis">
                <span>{last30[0]?.date}</span>
                <span>{last30[Math.floor(last30.length / 2)]?.date}</span>
                <span>{last30[last30.length - 1]?.date} (today)</span>
              </div>
            </>
          )}
        </div>

        {bySource.length > 0 && (
          <div className="stats-section">
            <div className="sh"><span className="t">usage by source</span></div>
            <div className="bd-bars">
              {bySource.map((b, i) => (
                <div key={i} className="bd-row">
                  <span className="nm">{b.name}</span>
                  <span className="bar"><i style={{ width: `${b.pct * 100}%` }} /></span>
                  <span className="tok">{(b.tokens / 1000).toFixed(0)}k</span>
                  <span className="pct">{Math.round(b.pct * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stats-section">
          <div className="sh">
            <span className="t">top sessions by tokens</span>
            <span className="sub">all-time</span>
          </div>
          {!top_sessions?.length ? (
            <div style={{ color: 'var(--fg-4)', fontSize: 11.5, padding: '12px 0' }}>no session data yet</div>
          ) : (
            <div className="top-tbl">
              {top_sessions.map((s, i) => {
                const t = (s.input_tokens || 0) + (s.output_tokens || 0);
                const cost = estimateCost(s.input_tokens || 0, s.output_tokens || 0, s.model);
                return (
                  <div key={s.id || i} className="row">
                    <span className="rnk">#{i + 1}</span>
                    <span className="ref">{s.linear_issue_key || s.id?.slice(0, 8) || '—'}</span>
                    <span className="ti">{s.title || 'Untitled'}</span>
                    <span className="tok">{(t / 1000).toFixed(1)}k tok</span>
                    <span className="cost">${cost.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── workspace overlay ─────────────────────────────────────────────────────────
export default function WorkspacePanel({ initialTab, onClose, globalModel }) {
  const [tab, setTab] = useState(initialTab || 'memory');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabDefs = [
    { k: 'memory',    ic: '❐', label: 'memory' },
    { k: 'schedules', ic: '◷', label: 'schedules' },
    { k: 'stats',     ic: '▤', label: 'stats' },
  ];

  return (
    <div className="ws" role="dialog" aria-label="workspace">
      <header className="ws-head">
        {tabDefs.map(t => (
          <div key={t.k} className="wtab" data-on={tab === t.k ? '1' : '0'} onClick={() => setTab(t.k)}>
            <span className="wtab-i">{t.ic}</span>
            {t.label}
          </div>
        ))}
        <span className="right">
          <button className="btn x" title="close (esc)" onClick={onClose}>✕</button>
        </span>
      </header>
      <div className="ws-body">
        {tab === 'memory'    && <MemoryView />}
        {tab === 'schedules' && <SchedulesView />}
        {tab === 'stats'     && <StatsView globalModel={globalModel} />}
      </div>
    </div>
  );
}
