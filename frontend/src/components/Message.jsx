import ReactMarkdown from 'react-markdown';
import CodeBlock from './CodeBlock';
import AgentSteps from './AgentSteps';

export default function Message({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
    }}>
      {!isUser && msg.steps?.length > 0 && (
        <AgentSteps steps={msg.steps} live={false} />
      )}
      <div style={{
        maxWidth: '80%',
        background: isUser ? '#1d4ed8' : '#1e293b',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '10px 14px',
        color: '#f1f5f9',
        fontSize: 14,
        lineHeight: 1.6,
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const lang = /language-(\w+)/.exec(className || '')?.[1] || '';
                return inline
                  ? <code style={{ background: '#0f172a', padding: '1px 5px', borderRadius: 3 }} {...props}>{children}</code>
                  : <CodeBlock code={String(children).trimEnd()} language={lang} />;
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
