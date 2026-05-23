import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

export default function CodeBlock({ code, language }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ref.current) hljs.highlightElement(ref.current);
  }, [code]);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <button
        onClick={copy}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#ccc', borderRadius: 4, padding: '2px 8px',
          cursor: 'pointer', fontSize: 11,
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
      <pre style={{ margin: 0, borderRadius: 6, overflow: 'auto' }}>
        <code ref={ref} className={language ? `language-${language}` : ''}>
          {code}
        </code>
      </pre>
    </div>
  );
}
