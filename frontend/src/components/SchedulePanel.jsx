import { useState, useEffect } from 'react';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule } from '../api';

const INTERVALS = [
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Every day' },
  { value: 10080, label: 'Every week' },
];

function timeUntil(iso) {
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'due now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

export default function SchedulePanel({ onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [interval, setInterval] = useState(1440);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSchedules().then(d => setSchedules(d.schedules || []));
  }, []);

  async function save() {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    const s = await createSchedule({ name: name.trim(), prompt: prompt.trim(), interval_minutes: interval });
    setSchedules(prev => [...prev, s]);
    setName(''); setPrompt(''); setInterval(1440);
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
    <div style={{
      position: 'fixed', inset: 0, background: '#00000099', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
        width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px #000',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Schedules</span>
            <span style={{ fontSize: 12, color: '#475569', marginLeft: 10 }}>
              {schedules.length} scheduled · run automatically
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Add new */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #0d1829' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='Name (e.g. "Daily PR review")'
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, outline: 'none',
              }}
            />
            <select
              value={interval}
              onChange={e => setInterval(Number(e.target.value))}
              style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                color: '#94a3b8', padding: '6px 10px', fontSize: 13, outline: 'none',
              }}
            >
              {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Prompt to run on schedule…"
              rows={2}
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13,
                outline: 'none', resize: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={save} disabled={saving || !name.trim() || !prompt.trim()} style={{
              background: '#1d4ed8', border: 'none', borderRadius: 6,
              color: '#fff', padding: '0 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              opacity: (!name.trim() || !prompt.trim()) ? 0.4 : 1,
            }}>
              {saving ? '…' : 'Add'}
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {schedules.length === 0 && (
            <div style={{ padding: '32px 20px', color: '#334155', textAlign: 'center', fontSize: 13 }}>
              No schedules yet. Add one above to run agents automatically.
            </div>
          )}
          {schedules.map(s => (
            <div key={s.id} style={{
              padding: '12px 20px', borderBottom: '1px solid #0d1829',
              opacity: s.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#7dd3fc', flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: '#475569' }}>
                  {INTERVALS.find(i => i.value === s.interval_minutes)?.label}
                </span>
                <button onClick={() => toggle(s)} style={{
                  background: s.enabled ? '#16a34a22' : '#33415522',
                  border: `1px solid ${s.enabled ? '#16a34a55' : '#33415555'}`,
                  borderRadius: 4, color: s.enabled ? '#4ade80' : '#475569',
                  padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                }}>
                  {s.enabled ? 'on' : 'off'}
                </button>
                <button onClick={() => remove(s.id)} style={{
                  background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12,
                }}>delete</button>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 4 }}>
                {s.prompt}
              </div>
              <div style={{ fontSize: 10, color: '#1e293b' }}>
                {s.last_run ? `Last run ${new Date(s.last_run).toLocaleString()} · ` : ''}
                Next: {timeUntil(s.next_run)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
