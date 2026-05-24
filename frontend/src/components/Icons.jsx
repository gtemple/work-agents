/**
 * Central icon exports — all Phosphor, no emojis.
 * Import ToolIcon for tool-call icons, everything else directly.
 */
import {
  Lightning, FileText, PencilSimple, FolderOpen, Terminal,
  Package, GitBranch, GitCommit, ArrowCircleUp, GitMerge,
  Wrench, ArrowsClockwise, CaretDown, MagnifyingGlass,
  Lightbulb, BookOpen, Heartbeat, Broom, Warning,
  ClipboardText, Robot, Play, Funnel,
} from '@phosphor-icons/react';

const TOOL_ICON_MAP = {
  run_code:            Lightning,
  read_file:           FileText,
  write_file:          PencilSimple,
  list_files:          FolderOpen,
  bash:                Terminal,
  clone_repo:          Package,
  git_branch:          GitBranch,
  git_status:          GitCommit,
  git_diff:            GitCommit,
  git_commit:          GitCommit,
  git_push:            ArrowCircleUp,
  create_pr:           GitMerge,
  memory_write:        PencilSimple,
  memory_read:         FileText,
  memory_list:         FolderOpen,
  read_repo_memory:    FileText,
  update_repo_memory:  PencilSimple,
  read_user_context:   FileText,
  update_user_context: PencilSimple,
  web_search:          MagnifyingGlass,
  fetch_page:          FolderOpen,
  submit_plan:         ClipboardText,
};

export function ToolIcon({ tool, size = 13, color, weight = 'regular' }) {
  const Icon = TOOL_ICON_MAP[tool] ?? Wrench;
  return <Icon size={size} color={color} weight={weight} />;
}

export const CATEGORY_ICONS = {
  repo_health: Heartbeat,
  tech_debt:   Broom,
  new_idea:    Lightbulb,
  learning:    BookOpen,
  maintenance: Wrench,
  workflow:    Lightning,
  pattern:     MagnifyingGlass,
};

export {
  ArrowsClockwise, CaretDown, Warning, ClipboardText,
  Robot, Wrench, Lightning, FolderOpen,
};
