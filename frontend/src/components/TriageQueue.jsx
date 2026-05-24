export default function TriageQueue({ items, focus, setFocus, actions, onAction }) {
  if (!items?.length) {
    return (
      <div className="queue-empty">
        — inbox zero —<br />
        <span style={{ color: 'var(--fg-3)' }}>nothing to triage right now.</span>
      </div>
    );
  }

  return (
    <div className="queue">
      {items.map((item, i) => {
        const a = actions[item.id];
        return (
          <div key={item.id} className="queue-row"
            data-focus={focus === i ? '1' : '0'}
            data-saved={a === 'save' ? '1' : '0'}
            data-dismissed={a === 'dismiss' ? '1' : '0'}
            onMouseEnter={() => setFocus(i)}>
            <div className="qr-num">{String(i + 1).padStart(2, '0')}</div>
            <div className="qr-meta">
              <span className={`scope ${item.type}`}>
                <span className="d" /> {item.type}
              </span>
              <span className="src">{item.category || '—'}</span>
              <span className="ctx">{item.repo || ''}</span>
            </div>
            <div className="qr-body">
              <span className="title">{item.title}</span>
              <span className="desc">{item.description}</span>
            </div>
            <div className="qr-actions">
              <button className="qr-btn primary" onClick={() => onAction(item.id, 'investigate')}>
                <span className="k">i</span> investigate
              </button>
              <button className="qr-btn ok" onClick={() => onAction(item.id, 'save')}>
                <span className="k">s</span> save
              </button>
              <button className="qr-btn no" onClick={() => onAction(item.id, 'dismiss')}>
                <span className="k">n</span> no
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
