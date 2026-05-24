// Gemini pricing per 1M tokens — see ai.google.dev/pricing
const PRICING = {
  'gemini-2.5-flash-lite': { input: 0.10,  output: 0.40 },
  'gemini-2.5-flash':      { input: 0.30,  output: 2.50 },
  'gemini-3.5-flash':      { input: 1.50,  output: 9.00 },
};
const DEFAULT_PRICING = { input: 0.30, output: 2.50 };

export function estimateCost(inputTokens, outputTokens, model) {
  const p = PRICING[model] || DEFAULT_PRICING;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

export function formatCost(dollars) {
  if (dollars < 0.001) return '<$0.001';
  if (dollars < 0.01)  return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(3)}`;
}

export function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatElapsed(startedAt, now) {
  if (!startedAt) return '';
  const s = Math.floor((now - startedAt) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function timeAgo(ts, now) {
  const s = Math.floor((now - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}


export function argsSummary(tool, args = {}) {
  if (args.code)     return `${args.language || ''} · ${args.code.slice(0, 50)}`.trim();
  if (args.command)  return args.command.slice(0, 60);
  if (args.repo)     return args.repo;
  if (args.name)     return args.name;
  if (args.message)  return `"${args.message.slice(0, 50)}"`;
  if (args.filename) return args.filename;
  if (args.title)    return args.title;
  return '';
}
