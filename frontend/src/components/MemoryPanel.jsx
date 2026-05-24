import { useState, useEffect } from 'react';
import {
  listMemories, writeMemory, deleteMemory,
  getUserContext, updateUserContext,
  listRepoMemories, updateRepoMemory,
} from '../api';

const TABS = ['Keys', 'About me', 'Repos'];

function EditableText({ value, onSave, rows = 8, placeholder }) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); setDirty(false); }, [value]);

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setDirty(false);
    setSaving(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value); setDirty(true); }}
        rows={rows}
        placeholder={placeholder}
        style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
          color: '#f1f5f9', padding: '8px 12px', fontSize: 13,
          outline: 'none', resize: 'vertical', fontFamily: 'ui-monospace, monospace',
          lineHeight: 1.6,
        }}
      />
      {dirty && (
        <button onClick={handleSave} disabled={saving} style={{
          alignSelf: 'flex-end',
          background: '#1d4ed8', border: 'none', borderRadius: 6,
          color: '#fff', padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}

function KeysTab({ memories, setMemories }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  async function save() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    const mem = await writeMemory(newKey.trim(), newValue.trim());
    setMemories(prev => [mem, ...prev.filter(m => m.key !== mem.key)]);
    setNewKey(''); setNewValue('');
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
    <>
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {memories.length === 0 && (
          <div style={{ padding: '32px 20px', color: '#334155', textAlign: 'center', fontSize: 13 }}>
            No entries yet. Agents write here automatically, or add one above.
          </div>
        )}
        {memories.map(m => (
          <div key={m.key} style={{ padding: '12px 20px', borderBottom: '1px solid #0d1829' }}>
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
              <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.value}</div>
            )}
            <div style={{ fontSize: 10, color: '#1e293b', marginTop: 4 }}>
              {new Date(m.updated_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AboutMeTab() {
  const [content, setContent] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    getUserContext().then(d => { setContent(d.content ?? ''); setUpdatedAt(d.updated_at); });
  }, []);

  async function handleSave(val) {
    await updateUserContext(val);
    setContent(val);
  }

  if (content === null) return (
    <div style={{ padding: '32px 20px', color: '#475569', textAlign: 'center' }}>Loading…</div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        This is what agents have learned about you — your working style, preferences, and decisions.
        Agents read and update this automatically. You can edit it directly.
      </p>
      <EditableText
        value={content}
        onSave={handleSave}
        rows={18}
        placeholder="Nothing stored yet. Agents will fill this in as they learn about you."
      />
      {updatedAt && (
        <div style={{ fontSize: 10, color: '#334155', marginTop: 8 }}>
          Last updated {new Date(updatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function ReposTab() {
  const [repos, setRepos] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    listRepoMemories().then(d => {
      const list = d.repos ?? [];
      setRepos(list);
      if (list.length) setSelected(list[0].repo);
    });
  }, []);

  async function handleSave(repo, val) {
    await updateRepoMemory(repo, val);
    setRepos(prev => prev.map(r => r.repo === repo ? { ...r, content: val } : r));
  }

  if (repos === null) return (
    <div style={{ padding: '32px 20px', color: '#475569', textAlign: 'center' }}>Loading…</div>
  );

  if (repos.length === 0) return (
    <div style={{ padding: '32px 20px', color: '#334155', textAlign: 'center', fontSize: 13 }}>
      No repo knowledge yet. Agents populate this when working on a repository.
    </div>
  );

  const current = repos.find(r => r.repo === selected);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Repo list */}
      <div style={{
        width: 180, flexShrink: 0, borderRight: '1px solid #1e293b',
        overflowY: 'auto',
      }}>
        {repos.map(r => (
          <button
            key={r.repo}
            onClick={() => setSelected(r.repo)}
            style={{
              width: '100%', textAlign: 'left',
              background: selected === r.repo ? '#1e293b' : 'transparent',
              border: 'none', borderLeft: selected === r.repo ? '2px solid #3b82f6' : '2px solid transparent',
              padding: '10px 12px', cursor: 'pointer',
              color: selected === r.repo ? '#f1f5f9' : '#64748b',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.repo.split('/').pop()}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.repo}
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      {current && (
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
          <div style={{ fontSize: 10, color: '#334155', marginBottom: 10 }}>
            Last updated {new Date(current.updated_at).toLocaleString()}
          </div>
          <EditableText
            key={current.repo}
            value={current.content}
            onSave={(val) => handleSave(current.repo, val)}
            rows={18}
            placeholder="No knowledge stored for this repo yet."
          />
        </div>
      )}
    </div>
  );
}

export default function MemoryPanel({ onClose }) {
  const [tab, setTab] = useState('Keys');
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    listMemories().then(d => setMemories(d.memories || []));
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#00000099', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
        width: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px #000',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px 0', borderBottom: '1px solid #1e293b', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Memory</span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#475569',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
            }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
                color: tab === t ? '#f1f5f9' : '#475569',
                padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 500 : 400,
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {tab === 'Keys'     && <KeysTab memories={memories} setMemories={setMemories} />}
          {tab === 'About me' && <AboutMeTab />}
          {tab === 'Repos'    && <ReposTab />}
        </div>
      </div>
    </div>
  );
}
