import { useState } from 'react';
import { stopProcess, restartProcess, deleteProcess } from '../api';

const STATUS_COLOR = { running: 'var(--ok)', stopped: 'var(--fg-4)', crashed: 'var(--err)' };

export default function ProcessesBar({ processes, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(null);

  if (!processes?.length) return null;

  const handleStop = async (id) => { await stopProcess(id); onRefresh(); };
  const handleRestart = async (id) => { await restartProcess(id); onRefresh(); };
  const handleDelete = async (id) => { await deleteProcess(id); setConfirming(null); onRefresh(); };

  return (
    <div className="proc-bar-wrap">
      <div className="proc-bar">
        <span className="proc-label">processes</span>
        <div className="proc-list">
          {processes.map(p => {
            const url = p.port ? `${p.scheme || 'http'}://${window.location.hostname}:${p.port}` : null;
            return (
              <div key={p.id} className={`proc-item${p.status !== 'running' ? ' dim' : ''}`}>
                <span className="proc-dot" style={{ background: STATUS_COLOR[p.status] || 'var(--fg-4)' }} />
                <span className="proc-name">{p.label}</span>
                {url && p.status === 'running' && (
                  <a className="proc-url" href={url} target="_blank" rel="noreferrer">:{p.port} →</a>
                )}
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
