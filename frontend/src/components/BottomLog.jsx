import { useState, useEffect, useRef } from 'react';

function useClock() {
  const fmt = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 1000); return () => clearInterval(id); }, []);
  return t;
}

export default function BottomLog({ lines, height, setHeight, onClear }) {
  const [activeTab, setActiveTab] = useState('activity');
  const bodyRef = useRef(null);
  const clock = useClock();

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines.length]);

  const toolCount = lines.filter(l => l.lvl === 'tool').length;
  const errCount  = lines.filter(l => l.lvl === 'warn' || l.lvl === 'err').length;

  const filtered = activeTab === 'tools'  ? lines.filter(l => l.lvl === 'tool')
                 : activeTab === 'errors' ? lines.filter(l => l.lvl === 'warn' || l.lvl === 'err')
                 : lines;

  const lvlGlyph = lvl => lvl === 'tool' ? '◆' : lvl === 'warn' ? '!' : lvl === 'err' ? '×' : '○';

  return (
    <section className="log" style={{ height }}>
      <div className="log-head">
        {[['activity', 'activity', lines.length], ['tools', 'tool calls', toolCount], ['errors', 'errors', errCount]].map(([k, label, n]) => (
          <div key={k} className="ttab" data-on={activeTab === k ? '1' : '0'} onClick={() => setActiveTab(k)}>
            {label} <span className="n">{n}</span>
          </div>
        ))}
        <div className="right">
          <span className="live"><span className="d" /> live</span>
          <button title="clear" onClick={onClear}>clear</button>
          <button title="collapse" onClick={() => setHeight(28)}>−</button>
          <button title="expand" onClick={() => setHeight(220)}>+</button>
        </div>
      </div>
      {height > 28 && (
        <div className="log-body" ref={bodyRef}>
          {filtered.map((l, i) => (
            <div key={i} className="log-line">
              <span className="t">{l.t}</span>
              <span className={`lvl ${l.lvl}`}>{lvlGlyph(l.lvl)}</span>
              <span className="agent">{l.agent}</span>
              <span className="msg">{l.msg}</span>
            </div>
          ))}
          <div className="log-line">
            <span className="t">{clock}</span>
            <span className="lvl info">›</span>
            <span className="agent">—</span>
            <span className="msg"><span className="log-cursor" /></span>
          </div>
        </div>
      )}
    </section>
  );
}
