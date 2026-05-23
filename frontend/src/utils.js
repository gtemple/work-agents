// Gemini 3.5 Flash pricing — check ai.google.dev/pricing for updates
const PRICE_INPUT_PER_M = 0.10;   // $ per 1M input tokens
const PRICE_OUTPUT_PER_M = 0.40;  // $ per 1M output tokens

export function estimateCost(inputTokens, outputTokens) {
  return (inputTokens / 1e6) * PRICE_INPUT_PER_M + (outputTokens / 1e6) * PRICE_OUTPUT_PER_M;
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

export const TOOL_ICONS = {
  run_code:   '⚡',
  read_file:  '📄',
  write_file: '✏️',
  list_files: '📁',
  bash:       '💻',
  clone_repo: '📦',
  git_branch: '🌿',
  git_status: '📊',
  git_diff:   '🔍',
  git_commit: '💾',
  git_push:   '🚀',
  create_pr:  '🔀',
};

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
