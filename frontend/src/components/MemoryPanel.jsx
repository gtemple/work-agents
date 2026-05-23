import { useState, useEffect } from 'react';
import { listMemories, writeMemory, deleteMemory } from '../api';

export default function MemoryPanel({ onClose }) {
  const [memories, setMemories] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    listMemories().then(d => setMemories(d.memories || []));
  }, []);

  async function save() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    const mem = await writeMemory(newKey.trim(), newValue.trim());
    setMemories(prev => {
      const without = prev.filter(m => m.key !== mem.key);
      return [mem, ...without];
    });
    setNewKey('');
    setNewValue('');
    setSaving(false);
  }

  async function saveEdit(key) {
    const mem = await writeMemory(key, editValue);
    setMemories(prev => prev.map(m => m.key === key ? mem : m));
    setEditingKey(null);
  }

  async function remove(key) {
    await deleteMemory(key);
    setMemories(prev => prev.filter(m => m.key !== key));
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#00000099', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
        width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px #000',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Memory</span>
            <span style={{ fontSize: 12, color: '#475569', marginLeft: 10 }}>
              {memories.length} entries · persists across all sessions
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
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder='Key (e.g. "auth-approach")'
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder="Value…"
              rows={2}
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13,
                outline: 'none', resize: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={save} disabled={saving || !newKey.trim() || !newValue.trim()} style={{
              background: '#1d4ed8', border: 'none', borderRadius: 6,
              color: '#fff', padding: '0 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              opacity: (!newKey.trim() || !newValue.trim()) ? 0.4 : 1,
            }}>
              {saving ? '…' : 'Add'}
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {memories.length === 0 && (
            <div style={{ padding: '32px 20px', color: '#334155', textAlign: 'center', fontSize: 13 }}>
              No memories yet. Agents will write here automatically, or add one above.
            </div>
          )}
          {memories.map(m => (
            <div key={m.key} style={{
              padding: '12px 20px', borderBottom: '1px solid #0d1829',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#7dd3fc', flex: 1 }}>{m.key}</span>
                <button onClick={() => { setEditingKey(m.key); setEditValue(m.value); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12 }}>
                  edit
                </button>
                <button onClick={() => remove(m.key)}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12 }}>
                  delete
                </button>
              </div>
              {editingKey === m.key ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={3}
                    style={{
                      flex: 1, background: '#1e293b', border: '1px solid #334155',
                      borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 12,
                      outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={() => saveEdit(m.key)} style={{
                      background: '#1d4ed8', border: 'none', borderRadius: 5,
                      color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                    }}>Save</button>
                    <button onClick={() => setEditingKey(null)} style={{
                      background: 'none', border: '1px solid #334155', borderRadius: 5,
                      color: '#64748b', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {m.value}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#1e293b', marginTop: 4 }}>
                {new Date(m.updated_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
