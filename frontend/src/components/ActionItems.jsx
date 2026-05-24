import { useState, useEffect, useCallback } from 'react';
import { listActionItems, actionItemAct } from '../api';
import { CATEGORY_ICONS, Wrench, ArrowsClockwise, CaretDown } from './Icons';

const TYPE_COLOR = {
  work:     '#3b82f6',
  personal: '#a78bfa',
};

function ItemCard({ item, onAct, navigating }) {
  const IconComponent = CATEGORY_ICONS[item.category] || Wrench;
  const color = TYPE_COLOR[item.type] || '#475569';

  return (
    <div style={{
      background: '#0d1829',
      border: `1px solid ${color}22`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = `${color}55`}
      onMouseLeave={e => e.currentTarget.style.borderColor = `${color}22`}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
        <IconComponent size={15} color={color} weight="duotone" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>
            {item.title}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
            {item.description}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
        <button
          onClick={() => onAct(item.id, 'investigate')}
          disabled={navigating}
          style={{
            flex: 1, background: `${color}18`, border: `1px solid ${color}44`,
            borderRadius: 6, color, padding: '5px 0',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            opacity: navigating ? 0.6 : 1,
          }}>
          {navigating ? 'Opening…' : 'Investigate'}
        </button>
        <button
          onClick={() => onAct(item.id, 'save')}
          style={{
            background: 'transparent', border: '1px solid #1e293b',
            borderRadius: 6, color: '#475569', padding: '5px 8px',
            cursor: 'pointer', fontSize: 11,
          }}>
          Save
        </button>
        <button
          onClick={() => onAct(item.id, 'dismiss')}
          style={{
            background: 'transparent', border: '1px solid #1e293b',
            borderRadius: 6, color: '#334155', padding: '5px 8px',
            cursor: 'pointer', fontSize: 11,
          }}>
          No
        </button>
      </div>
    </div>
  );
}

function SavedItem({ item, onAct, navigating }) {
  const IconComponent = CATEGORY_ICONS[item.category] || Wrench;
  const color = TYPE_COLOR[item.type] || '#475569';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 8,
      background: '#0d1829', border: '1px solid #1e293b',
    }}>
      <IconComponent size={13} color={color} weight="duotone" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
      </div>
      <button
        onClick={() => onAct(item.id, 'investigate')}
        disabled={navigating}
        style={{
          background: `${color}18`, border: `1px solid ${color}33`,
          borderRadius: 5, color, padding: '3px 8px',
          cursor: 'pointer', fontSize: 10, flexShrink: 0,
          opacity: navigating ? 0.6 : 1,
        }}>
        Investigate
      </button>
    </div>
  );
}

export default function ActionItems({ onNavigate }) {
  const [active, setActive] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [navigatingId, setNavigatingId] = useState(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { active: a, saved: s } = await listActionItems();
      setActive(a ?? []);
      setSaved(s ?? []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAct(id, action) {
    if (action === 'investigate') {
      setNavigatingId(id);
      try {
        const data = await actionItemAct(id, action);
        if (data.session_id) {
          onNavigate(data.session_id);
        }
      } finally {
        setNavigatingId(null);
      }
    } else {
      setActive(prev => prev.filter(i => i.id !== id));
      setSaved(prev => action === 'save'
        ? [active.find(i => i.id === id), ...prev].filter(Boolean)
        : prev
      );
      actionItemAct(id, action).then(load);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await actionItemAct(0, 'refresh');
    await load();
    setRefreshing(false);
  }

  const work     = active.filter(i => i.type === 'work');
  const personal = active.filter(i => i.type === 'personal');
  const hasItems = active.length > 0 || saved.length > 0;

  if (loading) return null;

  return (
    <div style={{ padding: '0 24px 0', marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 14 }}>
        <button onClick={() => setCollapsed(c => !c)} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <CaretDown size={11} color="#334155" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Ideas
          </span>
          {active.length > 0 && (
            <span style={{ fontSize: 9, color: '#334155', background: '#1e293b', borderRadius: 10, padding: '1px 6px' }}>
              {active.length}
            </span>
          )}
        </button>

        {!collapsed && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
            {saved.length > 0 && (
              <button onClick={() => setSavedOpen(o => !o)} style={{
                background: 'none', border: '1px solid #1e293b', borderRadius: 5,
                color: '#475569', padding: '3px 8px', cursor: 'pointer', fontSize: 10,
              }}>
                Saved ({saved.length})
              </button>
            )}
            <button onClick={handleRefresh} disabled={refreshing} style={{
              background: 'none', border: '1px solid #1e293b', borderRadius: 5,
              color: '#334155', padding: '3px 8px', cursor: 'pointer', fontSize: 10,
              opacity: refreshing ? 0.5 : 1,
            }}>
              {refreshing ? 'Generating…' : <><ArrowsClockwise size={10} style={{ marginRight: 4 }} />Refresh</>}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {!hasItems && (
            <div style={{ color: '#334155', fontSize: 12, padding: '8px 0' }}>
              No ideas yet — hit Refresh to generate suggestions.
            </div>
          )}

          {/* Work row */}
          {work.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Work</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {work.map(item => (
                  <ItemCard key={item.id} item={item} onAct={handleAct} navigating={navigatingId === item.id} />
                ))}
              </div>
            </div>
          )}

          {/* Personal row */}
          {personal.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Personal</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {personal.map(item => (
                  <ItemCard key={item.id} item={item} onAct={handleAct} navigating={navigatingId === item.id} />
                ))}
              </div>
            </div>
          )}

          {/* Saved panel */}
          {savedOpen && saved.length > 0 && (
            <div style={{
              marginTop: 12, padding: 12,
              background: '#0a1628', border: '1px solid #1e293b', borderRadius: 8,
            }}>
              <div style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Saved for later</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {saved.map(item => (
                  <SavedItem key={item.id} item={item} onAct={handleAct} navigating={navigatingId === item.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
