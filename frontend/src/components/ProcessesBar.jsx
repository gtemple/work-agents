import { stopProcess } from '../api';

const STATUS_COLOR = { running: 'var(--ok)', stopped: 'var(--fg-4)', crashed: 'var(--err)' };

export default function ProcessesBar({ processes, onRefresh }) {
  if (!processes?.length) return null;

  const handleStop = async (id) => {
    await stopProcess(id);
    onRefresh();
  };

  return (
    <div className="proc-bar">
      <span className="proc-label">processes</span>
      <div className="proc-list">
        {processes.map(p => {
          const url = p.port ? `http://${window.location.hostname}:${p.port}` : null;
          return (
            <div key={p.id} className={`proc-item${p.status !== 'running' ? ' dim' : ''}`}>
              <span className="proc-dot" style={{ background: STATUS_COLOR[p.status] || 'var(--fg-4)' }} />
              <span className="proc-name">{p.label}</span>
              {url && p.status === 'running' && (
                <a className="proc-url" href={url} target="_blank" rel="noreferrer">
                  :{p.port} →
                </a>
              )}
              {p.status === 'running' && (
                <button className="proc-stop" onClick={() => handleStop(p.id)} title="stop">⊠</button>
              )}
              {p.status !== 'running' && (
                <span className="proc-status">{p.status}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
