import { useState, useEffect, useRef } from 'react';
import { createNote, updateNote as apiUpdateNote, deleteNote as apiDeleteNote } from '../api';

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function NoteListRow({ note, onClick }) {
  const preview = note.body
    .replace(/^#+\s*/gm, '')
    .replace(/[\*_`>-]/g, '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 2)
    .join(' · ') || '—';
  return (
    <div className="nd-note" onClick={onClick}>
      <div className="row-1">
        {note.pinned && <span className="pin">★</span>}
        <span className="title">{note.title || <span style={{ color: 'var(--fg-4)' }}>untitled</span>}</span>
        {note.ref && <span className="ref">{note.ref}</span>}
      </div>
      <div className="preview">{preview}</div>
      <div className="meta">
        <span>updated {note.updatedAt.slice(5, 10)}</span>
        <span className="dot">·</span>
        <span>{note.body.split('\n').length} lines</span>
      </div>
    </div>
  );
}

export function NotesDrawer({
  notes, setNotes, sessions, view, setView,
  selectedId, setSelectedId, onAskAgent, onClose,
}) {
  const [query, setQuery] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);

  const currentNote = notes.find((n) => n.id === selectedId);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (view === 'edit') { setView('list'); setSelectedId(null); }
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onClose, setView, setSelectedId]);

  useEffect(() => {
    if (view !== 'edit' || !currentNote) return;
    if (!currentNote.title) titleRef.current?.focus();
    else bodyRef.current?.focus();
  }, [view, selectedId]);

  // Debounced full-note sync — fires 400ms after the last change to any field.
  // Using the full note avoids losing fields when rapidly switching between inputs.
  const syncTimerRef = useRef(null);
  useEffect(() => {
    if (view !== 'edit' || !currentNote || !selectedId) return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      apiUpdateNote(selectedId, {
        title: currentNote.title,
        body: currentNote.body,
        ref: currentNote.ref,
        pinned: currentNote.pinned,
      });
    }, 400);
    return () => clearTimeout(syncTimerRef.current);
  }, [currentNote?.title, currentNote?.body, currentNote?.ref, currentNote?.pinned, selectedId]);

  const newNote = async (ref) => {
    const note = await createNote({ title: '', body: '', ref: ref || null, pinned: false });
    setNotes((all) => [{ ...note }, ...all]);
    setSelectedId(String(note.id));
    setView('edit');
  };

  const updateNote = (patch) => {
    setNotes((all) => all.map((n) => n.id === selectedId
      ? { ...n, ...patch, updatedAt: nowStamp() } : n));
    setSavedFlash(true);
    clearTimeout(updateNote._t);
    updateNote._t = setTimeout(() => setSavedFlash(false), 800);
  };

  const deleteNote = () => {
    apiDeleteNote(selectedId);
    setNotes((all) => all.filter((n) => n.id !== selectedId));
    setSelectedId(null);
    setView('list');
  };

  const togglePin = () => {
    if (!currentNote) return;
    const pinned = !currentNote.pinned;
    setNotes((all) => all.map((n) => n.id === selectedId
      ? { ...n, pinned, updatedAt: nowStamp() } : n));
    apiUpdateNote(selectedId, { pinned });
  };

  const filtered = notes.filter((n) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return n.title.toLowerCase().includes(q)
        || n.body.toLowerCase().includes(q)
        || (n.ref || '').toLowerCase().includes(q);
  });
  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  return (
    <aside className="notes-drawer" role="dialog" aria-label="notes">
      <header className="nd-head">
        {view === 'edit' ? (
          <>
            <span className="label">edit note</span>
            <span className="count">·</span>
            <span className="count">{currentNote?.ref || 'untagged'}</span>
          </>
        ) : (
          <>
            <span className="label">notes</span>
            <span className="count">{notes.length}</span>
          </>
        )}
        <span className="right">
          {view === 'list' && (
            <button className="primary" onClick={() => newNote()}>+ new</button>
          )}
          <button className="x" title="close (esc)" onClick={onClose}>✕</button>
        </span>
      </header>

      <div className="nd-body">
        {view === 'list' ? (
          <>
            <div className="nd-search">
              <input
                placeholder="search notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="nd-list">
              {filtered.length === 0 && (
                <div className="nd-empty">
                  <div className="lbl">no notes</div>
                  {query ? 'no match for that query.' : 'press + new to start one.'}
                </div>
              )}
              {pinned.length > 0 && (
                <>
                  <div className="nd-section-h">pinned</div>
                  {pinned.map((n) => (
                    <NoteListRow key={n.id} note={n}
                      onClick={() => { setSelectedId(n.id); setView('edit'); }} />
                  ))}
                </>
              )}
              {pinned.length > 0 && rest.length > 0 && (
                <div className="nd-section-h">all</div>
              )}
              {rest.map((n) => (
                <NoteListRow key={n.id} note={n}
                  onClick={() => { setSelectedId(n.id); setView('edit'); }} />
              ))}
            </div>
          </>
        ) : currentNote ? (
          <div className="nd-edit">
            <div className="nd-edit-head">
              <button className="back" onClick={() => { setView('list'); setSelectedId(null); }}>← all</button>
              <span style={{ flex: 1 }} />
              <button className="pin-btn" data-on={currentNote.pinned ? '1' : '0'}
                onClick={togglePin} title="pin">
                {currentNote.pinned ? '★ pinned' : '☆ pin'}
              </button>
              <button className="ask-btn" onClick={() => onAskAgent(currentNote)}>→ agent</button>
              <button className="del" onClick={deleteNote} title="delete">✕</button>
            </div>
            <input
              ref={titleRef}
              className="title-input"
              placeholder="note title…"
              value={currentNote.title}
              onChange={(e) => updateNote({ title: e.target.value })} />
            <div className="ref-row">
              <span className="lbl">linked to</span>
              <select
                value={currentNote.ref || ''}
                onChange={(e) => updateNote({ ref: e.target.value || null })}>
                <option value="">— untagged —</option>
                {sessions.filter((s) => s.linear_issue_key).map((s) => (
                  <option key={s.id} value={s.linear_issue_key}>
                    {s.linear_issue_key} · {(s.title || '').slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              ref={bodyRef}
              className="body-input"
              placeholder="write your note in markdown…"
              spellCheck={false}
              value={currentNote.body}
              onChange={(e) => updateNote({ body: e.target.value })} />
            <div className="nd-edit-foot">
              <span>{currentNote.body.split('\n').length} lines · {currentNote.body.length} chars</span>
              {savedFlash && <span className="saved">● saved</span>}
              <span style={{ marginLeft: 'auto' }}>updated {currentNote.updatedAt}</span>
            </div>
          </div>
        ) : (
          <div className="nd-empty">
            <div className="lbl">note deleted</div>
            <button className="back" onClick={() => setView('list')}>← back to list</button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function SessionNotes({ sessionRef, notes, onOpenNote, onNewForSession }) {
  const [open, setOpen] = useState(true);
  const linked = notes.filter((n) => n.ref === sessionRef);

  if (!sessionRef) return null;

  return (
    <div className="session-notes">
      <div className="sn-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="lbl">notes</span>
        {linked.length > 0 && <span className="n">{linked.length}</span>}
        <span className="right">
          <button onClick={(e) => { e.stopPropagation(); onNewForSession(); }}>+ add</button>
        </span>
      </div>
      {open && linked.length > 0 && (
        <div className="sn-body">
          {linked.map((n) => (
            <div key={n.id} className="sn-note" onClick={() => onOpenNote(n.id)}>
              {n.pinned && <span className="pin">★</span>}
              <span className="ti">{n.title || 'untitled'}</span>
              <span className="prev">{n.body.split('\n')[0].replace(/^#+\s*/, '')}</span>
              <span className="when">{n.updatedAt.slice(5, 10)}</span>
            </div>
          ))}
        </div>
      )}
      {open && linked.length === 0 && (
        <div style={{ padding: '10px 12px', color: 'var(--fg-4)',
          fontSize: 11, borderTop: '1px solid var(--line)' }}>
          no notes linked to {sessionRef} yet · use <b style={{ color: 'var(--fg-3)' }}>+ add</b> to drop context for the agent
        </div>
      )}
    </div>
  );
}
