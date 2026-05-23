import { useState, useEffect, useRef } from 'react';

export default function SessionPrompt({ value, onChange }) {
  const [open, setOpen] = useState(!!value);
  const [draft, setDraft] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);

  // sync when session switches
  useEffect(() => {
    setDraft(value || '');
    setOpen(!!value);
  }, [value]);

  function handleChange(e) {
    const v = e.target.value;
    setDraft(v);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 700);
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', padding: '2px 0',
          cursor: 'pointer', color: open ? '#94a3b8' : '#475569',
          fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? '▼' : '▶'}</span>
        Session context
        {value && !open && (
          <span style={{ color: '#334155', marginLeft: 4 }}>• set</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 6 }}>
          <textarea
            value={draft}
            onChange={handleChange}
            placeholder={`Tell the agent about this session's context, e.g.:\n"Django 4.2 app, PostgreSQL, use black + pytest. Never modify migrations directly."`}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0a1628', border: '1px solid #1e293b',
              borderRadius: 6, color: '#94a3b8', padding: '8px 10px',
              fontSize: 12, resize: 'vertical', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
          <div style={{ fontSize: 10, color: '#334155', textAlign: 'right', marginTop: 2 }}>
            {saved ? <span style={{ color: '#4ade80' }}>saved</span> : 'auto-saves'}
          </div>
        </div>
      )}
    </div>
  );
}
