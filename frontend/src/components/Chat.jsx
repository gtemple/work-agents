import { useState, useEffect, useRef } from 'react';
import Message from './Message';
import AgentSteps from './AgentSteps';
import FileUpload from './FileUpload';
import SessionPrompt from './SessionPrompt';
import ApprovalGate from './ApprovalGate';
import { formatElapsed, estimateCost, formatCost, formatTokens } from '../utils';

const TEMPLATES = [
  {
    label: 'Fix bug',
    text: `I'm seeing this bug:\n\n[describe the bug]\n\nSteps to reproduce:\n1. \n\nExpected: \nActual: `,
  },
  {
    label: 'Add tests',
    text: `Add comprehensive tests for [describe what]. Use the existing test framework. Cover edge cases and error conditions.`,
  },
  {
    label: 'Review',
    text: `Review the code in [file or directory] and:\n1. Identify bugs or issues\n2. Suggest improvements\n3. Check for security concerns\n4. Verify it follows the repo's conventions`,
  },
  {
    label: 'Refactor',
    text: `Refactor [describe what] to [goal]. Keep behaviour identical. Improve [readability / performance / structure].`,
  },
  {
    label: 'Create PR',
    text: `[Describe the feature or fix]. Create a new branch, make the changes, commit with a clear message, and open a PR against main with a full description of what changed and why.`,
  },
  {
    label: 'Review PR',
    text: `Review PR #[number] in [owner/repo].\n\nRead the diff, check for bugs, code quality issues, security concerns, and missing tests. Then post a thorough review comment on GitHub.`,
  },
];

export default function Chat({ session, onSend, onSaveSystemPrompt, onApprove, onReject, now }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const streaming = session.status === 'running';
  const elapsed = streaming ? formatElapsed(session.startedAt, now) : null;
  const totalTokens = (session.inputTokens || 0) + (session.outputTokens || 0);
  const cost = totalTokens > 0 ? estimateCost(session.inputTokens || 0, session.outputTokens || 0) : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.liveSteps, session.liveText]);

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
      {/* Header */}
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
          {cost !== null && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}
              title={`${formatTokens(session.inputTokens)}in / ${formatTokens(session.outputTokens)}out`}>
              {formatTokens(totalTokens)} tok · {formatCost(cost)}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#475569' }}>gemini-3.5-flash</span>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>

      {/* Messages */}
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
            {session.pendingApproval && (
              <ApprovalGate approval={session.pendingApproval} onApprove={onApprove} onReject={onReject} />
            )}
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

      {/* Input area */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <SessionPrompt value={session.system_prompt} onChange={onSaveSystemPrompt} />
        <FileUpload sessionId={session.id} />

        {/* Template buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setInput(t.text)}
              disabled={streaming}
              style={{
                background: 'transparent', border: '1px solid #1e293b',
                borderRadius: 5, color: '#475569', padding: '3px 9px',
                cursor: streaming ? 'not-allowed' : 'pointer', fontSize: 11,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

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
