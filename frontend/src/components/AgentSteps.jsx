import CodeBlock from './CodeBlock';

function ToolCall({ data }) {
  const args = data.args || {};
  return (
    <div style={{ marginBottom: 8 }}>
      <strong style={{ color: '#7dd3fc' }}>⚙ {data.tool}</strong>
      {args.code && <CodeBlock code={args.code} language={args.language || 'bash'} />}
      {args.command && <CodeBlock code={args.command} language="bash" />}
      {args.content && <CodeBlock code={args.content} language="text" />}
      {args.filename && !args.content && (
        <span style={{ color: '#94a3b8', fontSize: 12 }}> {args.filename}</span>
      )}
    </div>
  );
}

function ToolResult({ data }) {
  const result = data.result || '';
  return (
    <div style={{ marginBottom: 8 }}>
      <strong style={{ color: '#86efac' }}>↩ {data.tool} result</strong>
      <CodeBlock code={result.slice(0, 1000)} language="text" />
    </div>
  );
}

export default function AgentSteps({ steps, live }) {
  if (!steps.length && !live) return null;

  return (
    <details open={live} style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
        {live ? '⟳ agent working…' : `${steps.length} steps`}
      </summary>
      <div style={{
        background: '#0f172a', borderRadius: 6, padding: '10px 14px',
        borderLeft: '3px solid #334155',
      }}>
        {steps.map((step, i) =>
          <div key={i} style={{ animation: live ? 'stepIn 0.18s ease-out' : 'none' }}>
            {step.step_type === 'tool_call'
              ? <ToolCall data={step.data} />
              : <ToolResult data={step.data} />}
          </div>
        )}
      </div>
      <style>{`
        @keyframes stepIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </details>
  );
}
