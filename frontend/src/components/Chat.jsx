import { useState, useEffect, useRef } from 'react';
import Message from './Message';
import AgentSteps from './AgentSteps';
import FileUpload from './FileUpload';
import { formatElapsed } from '../utils';

export default function Chat({ session, onSend, now }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const streaming = session.status === 'running';
  const elapsed = streaming ? formatElapsed(session.startedAt, now) : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.liveSteps, session.liveText]);

  // reset input when switching sessions
  useEffect(() => { setInput(''); }, [session.id]);

  function send() {
    if (!input.trim() || streaming) return;
    onSend(input.trim());
    setInput('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: session.color || '#475569',
          boxShadow: streaming ? `0 0 0 2px ${session.color}44` : 'none',
          animation: streaming ? 'pulse 1.2s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
          {session.title || 'New agent'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {streaming && elapsed && (
            <span style={{ fontSize: 11, color: session.color, fontVariantNumeric: 'tabular-nums' }}>
              {session.stepCount > 0 ? `${session.stepCount} steps · ` : ''}{elapsed}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#334155' }}>gemini-2.5-flash</span>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {session.messages.length === 0 && !streaming && (
          <div style={{ color: '#475569', textAlign: 'center', marginTop: 80, fontSize: 14 }}>
            Send a coding task to get started
          </div>
        )}
        {session.messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 16 }}>
            <AgentSteps steps={session.liveSteps} live={true} />
            {session.liveText && (
              <div style={{
                maxWidth: '80%', background: '#1e293b', borderRadius: '12px 12px 12px 2px',
                padding: '10px 14px', color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {session.liveText}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 24px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <FileUpload sessionId={session.id} />
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a coding task… (Enter to send, Shift+Enter for newline)"
            disabled={streaming}
            rows={3}
            style={{
              flex: 1, background: '#1e293b', border: '1px solid #334155',
              borderRadius: 8, color: '#f1f5f9', padding: '10px 12px',
              fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            style={{
              background: streaming ? '#334155' : '#1d4ed8',
              border: 'none', borderRadius: 8, color: '#fff',
              padding: '0 20px', cursor: streaming ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 500,
            }}
          >
            {streaming ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
