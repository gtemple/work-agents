import { useState, useEffect, useRef } from 'react';
import { stopProcess, restartProcess, deleteProcess } from '../api';

function Terminal({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="2" />
      <polyline points="4,6 7,9 4,12" />
      <line x1="8" y1="12" x2="12" y2="12" />
    </svg>
  );
}

const STATUS_COLOR = { running: 'var(--ok)', stopped: 'var(--fg-4)', crashed: 'var(--err)' };

function ProcessLogs({ process, onClose }) {
  const [lines, setLines] = useState([]);
  const [done, setDone] = useState(false);
  const bottomRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    setLines([]);
    setDone(false);
    const es = new EventSource(`/api/processes/${process.id}/logs/`);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) { setDone(true); es.close(); return; }
      if (data.line !== undefined) setLines(prev => [...prev, data.line]);
    };
    es.onerror = () => { setDone(true); es.close(); };
    return () => es.close();
  }, [process.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="proc-logs-wrap">
      <div className="proc-logs-header">
        <Terminal size={11} color="var(--fg-3)" />
        <span className="proc-logs-label">{process.label}</span>
        {done && <span className="proc-logs-done">exited</span>}
        <button className="proc-logs-close" onClick={onClose}>✕</button>
      </div>
      <div className="proc-logs-body">
        {lines.length === 0 && !done && <span className="proc-logs-empty">waiting for output…</span>}
        {lines.map((l, i) => <div key={i} className="proc-log-line">{l || ' '}</div>)}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function ProcessesBar({ processes, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [logsFor, setLogsFor] = useState(null);

  if (!processes?.length) return null;

  const handleStop = async (id) => { await stopProcess(id); onRefresh(); };
  const handleRestart = async (id) => { await restartProcess(id); onRefresh(); };
  const handleDelete = async (id) => { await deleteProcess(id); setConfirming(null); onRefresh(); };
  const toggleLogs = (p) => setLogsFor(prev => prev?.id === p.id ? null : p);

  return (
    <div className="proc-bar-wrap">
      <div className="proc-bar">
        <span className="proc-label">processes</span>
        <div className="proc-list">
          {processes.map(p => {
            const url = p.port ? `${p.scheme || 'http'}://${window.location.hostname}:${p.port}` : null;
            const logsActive = logsFor?.id === p.id;
            return (
              <div key={p.id} className={`proc-item${p.status !== 'running' ? ' dim' : ''}`}>
                <span className="proc-dot" style={{ background: STATUS_COLOR[p.status] || 'var(--fg-4)' }} />
                <span className="proc-name">{p.label}</span>
                {url && p.status === 'running' && (
                  <a className="proc-url" href={url} target="_blank" rel="noreferrer">:{p.port} →</a>
                )}
                <button
                  className="proc-logs-btn"
                  onClick={() => toggleLogs(p)}
                  title="logs"
                  style={{ color: logsActive ? 'var(--ok)' : undefined }}
                >
                  <Terminal size={11} />
                </button>
                {p.status === 'running' ? (
                  <button className="proc-stop" onClick={() => handleStop(p.id)} title="stop">■</button>
                ) : (
                  <button className="proc-restart" onClick={() => handleRestart(p.id)} title="restart">↺</button>
                )}
              </div>
            );
          })}
        </div>
        <button className="proc-expand" onClick={() => setExpanded(e => !e)} title={expanded ? 'collapse' : 'details'}>
          {expanded ? '▴' : '▾'}
        </button>
      </div>

      {logsFor && <ProcessLogs process={logsFor} onClose={() => setLogsFor(null)} />}

      {expanded && (
        <div className="proc-detail">
          <table className="proc-table">
            <thead>
              <tr>
                <th></th>
                <th>label</th>
                <th>command</th>
                <th>port</th>
                <th>started</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {processes.map(p => {
                const url = p.port ? `${p.scheme || 'http'}://${window.location.hostname}:${p.port}` : null;
                return (
                  <tr key={p.id} className={p.status !== 'running' ? 'dim' : ''}>
                    <td>
                      <span className="proc-dot" style={{ background: STATUS_COLOR[p.status] || 'var(--fg-4)', display: 'inline-block' }} />
                      <span className="proc-status-text">{p.status}</span>
                    </td>
                    <td className="proc-d-name">{p.label}</td>
                    <td className="proc-d-cmd">{p.command}</td>
                    <td>
                      {url ? (
                        <a className="proc-url" href={url} target="_blank" rel="noreferrer">:{p.port} →</a>
                      ) : p.port ? `${p.port}` : '—'}
                    </td>
                    <td className="proc-d-when">{p.started_at ? new Date(p.started_at).toLocaleString() : '—'}</td>
                    <td className="proc-d-actions">
                      <button
                        className="proc-logs-btn"
                        onClick={() => toggleLogs(p)}
                        title="logs"
                        style={{ color: logsFor?.id === p.id ? 'var(--ok)' : undefined }}
                      >
                        <Terminal size={11} />
                      </button>
                      {p.status === 'running'
                        ? <button className="proc-stop" onClick={() => handleStop(p.id)} title="stop">■</button>
                        : <button className="proc-restart" onClick={() => handleRestart(p.id)} title="restart">↺</button>
                      }
                      {confirming === p.id ? (
                        <>
                          <button className="proc-del-confirm" onClick={() => handleDelete(p.id)}>delete</button>
                          <button className="proc-del-cancel" onClick={() => setConfirming(null)}>cancel</button>
                        </>
                      ) : (
                        <button className="proc-del" onClick={() => setConfirming(p.id)} title="delete">⊠</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
