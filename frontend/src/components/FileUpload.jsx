import { useState, useRef } from 'react';
import { uploadFiles } from '../api';

export default function FileUpload({ sessionId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  const inputRef = useRef(null);

  async function handleFiles(files) {
    if (!files.length) return;
    setUploading(true);
    const res = await uploadFiles(sessionId, Array.from(files));
    const names = res.uploaded || [];
    setUploaded(prev => [...new Set([...prev, ...names])]);
    onUploaded?.(names);
    setUploading(false);
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current.click()}
        style={{
          border: '1px dashed #334155',
          borderRadius: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          color: '#64748b',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        {uploading ? 'uploading…' : 'drop files or click to upload context'}
      </div>
      <input ref={inputRef} type="file" multiple hidden onChange={e => handleFiles(e.target.files)} />
      {uploaded.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {uploaded.map(f => (
            <span key={f} style={{
              background: '#1e293b', color: '#94a3b8', borderRadius: 4,
              padding: '2px 7px', fontSize: 11,
            }}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
