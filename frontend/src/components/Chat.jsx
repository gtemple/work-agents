import { useState, useEffect, useRef } from 'react';
import { createSession, getSession, streamAgent } from '../api';
import Message from './Message';
import AgentSteps from './AgentSteps';
import FileUpload from './FileUpload';

export default function Chat() {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const [liveText, setLiveText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    createSession().then(s => setSession(s));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveSteps, liveText]);

  function send() {
    if (!input.trim() || streaming || !session) return;
    const prompt = input.trim();
    setInput('');
    setStreaming(true);
    setLiveSteps([]);
    setLiveText('');

    setMessages(prev => [...prev, { role: 'user', content: prompt, steps: [] }]);

    streamAgent(session.id, prompt, (event) => {
      if (event.type === 'tool_call') {
        setLiveSteps(prev => [...prev, { step_type: 'tool_call', data: event.payload }]);
      } else if (event.type === 'tool_result') {
        setLiveSteps(prev => [...prev, { step_type: 'tool_result', data: event.payload }]);
      } else if (event.type === 'assistant_text') {
        setLiveText(event.payload.text);
      } else if (event.type === 'done') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: liveTextRef.current, steps: liveStepsRef.current },
        ]);
        setLiveSteps([]);
        setLiveText('');
        setStreaming(false);
      } else if (event.type === 'error') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error: ${event.payload.message}`, steps: [] },
        ]);
        setStreaming(false);
      }
    });
  }

  const liveStepsRef = useRef(liveSteps);
  const liveTextRef = useRef(liveText);
  useEffect(() => { liveStepsRef.current = liveSteps; }, [liveSteps]);
  useEffect(() => { liveTextRef.current = liveText; }, [liveText]);

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Gemini Agent</span>
        <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>
          gemini-2.5-flash
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 && !streaming && (
          <div style={{ color: '#475569', textAlign: 'center', marginTop: 80, fontSize: 14 }}>
            Send a coding task to get started
          </div>
        )}
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 16 }}>
            <AgentSteps steps={liveSteps} live={true} />
            {liveText && (
              <div style={{
                maxWidth: '80%', background: '#1e293b', borderRadius: '12px 12px 12px 2px',
                padding: '10px 14px', color: '#f1f5f9', fontSize: 14, lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {liveText}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 24px', borderTop: '1px solid #1e293b' }}>
        {session && <FileUpload sessionId={session.id} />}
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
              fontSize: 14, resize: 'none', outline: 'none',
              fontFamily: 'inherit',
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
