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
