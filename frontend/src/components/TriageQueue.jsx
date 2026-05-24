const CONFIDENCE = {
  tech_debt: 0.75, pattern: 0.82, new_idea: 0.65,
  learning: 0.70, workflow: 0.78, maintenance: 0.72,
  repo_health: 0.85,
};

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
        const conf = CONFIDENCE[item.category] ?? 0.75;
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
              <span className="conf">
                <span>confidence</span>
                <span className="bar"><i style={{ width: `${Math.round(conf * 100)}%` }} /></span>
                <span>{Math.round(conf * 100)}%</span>
              </span>
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
