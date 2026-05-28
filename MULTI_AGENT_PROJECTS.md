# Multi-Agent Project Execution

## What this is

A way to tackle goals that are too large or too parallel for a single agent session. You describe a goal to an **orchestrator** agent; it breaks the work into subtasks and spawns independent **task agents** that run concurrently. You watch a live task tree showing what's running, done, or errored. When all tasks finish, the orchestrator is automatically resumed to synthesise results.

---

## What already exists

Surprisingly a lot of the backend infrastructure is already in place:

| Thing | Where | State |
|---|---|---|
| `Project` model (title, description, orchestrator FK, tasks FK) | `models.py` | ✓ done |
| `Session.session_role` field (standard / orchestrator / task) | `models.py` | ✓ done |
| `Session.project` FK | `models.py` | ✓ done |
| `POST /api/projects/` — creates project + orchestrator session atomically | `views.py` | ✓ done |
| `spawn_task` tool — orchestrator calls this; spins task in a background thread | `tools.py` | ✓ done |
| `list_project_tasks` tool — orchestrator can check message count per task | `tools.py` | ✓ done |
| `task_spawned` GlobalEvent — frontend refreshes session list on this | `tools.py` | ✓ done |
| `ORCHESTRATOR_SYSTEM_PROMPT` — tells orchestrator to plan, delegate, not write code | `agent_loop.py` | ✓ done |
| Orchestrator system prompt injected automatically based on `session_role` | `agent_loop.py` | ✓ done |

What's completely missing is the **UI** and two small backend pieces needed for a usable loop.

---

## The gaps

### 1. No UI to create or view projects

The API endpoint exists but nothing in the frontend reaches it. Task sessions appear in the left rail mixed in with regular sessions — no grouping, no hierarchy, no way to know they belong to a project.

### 2. Task status is opaque

`list_project_tasks` returns only message count. The orchestrator (and you) have no structured way to know if a task is still running, completed successfully, or errored. The `GlobalEvent` stream has done/error events but they're not surfaced per-task in any project context.

### 3. Orchestrator doesn't know when tasks finish

When the last task fires its `done` event, nothing tells the orchestrator. The orchestrator is a suspended session — it ran, spawned tasks, and stopped. Someone has to kick it again to synthesise. Right now that someone is you, manually.

### 4. Tasks can't write a structured result back

When a task finishes, its output lives in its message history. The orchestrator would have to call a hypothetical `read_task_result(task_id)` to get the summary. Currently `list_project_tasks` just gives message count — the orchestrator has no way to actually read what a task produced.

---

## Implementation plan

### Phase 1 — Task status + result reporting (backend, ~1 day)

**Add `task_status` field to Session** (`queued | running | done | error`). Update it at the right moments:
- Set `running` when `spawn_task` fires the background thread
- Set `done` / `error` in the thread's finally block (currently it just silently finishes)
- Include status in the session list API response (it's already in `makeSessionState` on the frontend)

**Add a `report_result` tool** for task agents:
```python
{
  'name': 'report_result',
  'description': 'Write a concise summary of what this task accomplished back to the project. Call this as your final step.',
  'parameters': {
    'summary': str,   # 2-5 sentences: what was done, key decisions, anything the orchestrator needs to know
    'status': str,    # 'done' | 'blocked'
    'artifacts': list # optional: ['branch: feat/auth-v2', 'PR: #142']
  }
}
```

Store the result on the `Session` model as a `result_summary` JSONField. The orchestrator can then call `list_project_tasks` and get back rich summaries, not just message counts.

**Auto-resume the orchestrator when all tasks finish.** In the `spawn_task` thread's finally block, after marking the task done, check: are all sibling task sessions in a terminal state (done or error)? If yes, kick off an orchestrator run:

```python
def _maybe_resume_orchestrator(project):
    tasks = project.tasks.exclude(session_role='orchestrator')
    if tasks.filter(task_status='running').exists():
        return  # still in progress
    summaries = "\n\n".join(
        f"**{t.title}** ({t.task_status}): {t.result_summary or 'no summary'}"
        for t in tasks
    )
    prompt = f"All tasks have finished. Here are the results:\n\n{summaries}\n\nSynthesise the outcomes and let the user know what was accomplished and what (if anything) needs their attention."
    threading.Thread(target=lambda: _run_orchestrator(project.orchestrator, prompt), daemon=True).start()
```

This keeps the loop closed without any user intervention.

---

### Phase 2 — Project UI (frontend, ~2 days)

**Project creation flow.** A "new project" entry in the left rail footer (alongside memory / schedules / stats buttons). Clicking it opens a small modal: title field, description textarea, "create" button. Hits `POST /api/projects/`, gets back the project + orchestrator session ID, then opens the project view.

**Project view.** A full-screen overlay (same z-index layer as WorkspacePanel) with a two-panel layout:

```
┌─────────────────────────────────────────────────────────┐
│  project: auth system refactor          ✕ close         │
├──────────────────┬──────────────────────────────────────┤
│  TASKS           │                                       │
│  ─────────       │   orchestrator chat                   │
│  ● running       │                                       │
│    analyze auth  │   (full ChatView, reads from          │
│  ✓ done          │    orchestrator session)              │
│    write tests   │                                       │
│  ✗ error         │                                       │
│    update routes │                                       │
│                  │                                       │
│  [+ spawn task]  │                                       │
├──────────────────┴──────────────────────────────────────┤
│  task detail (slides up when task row is clicked)       │
│  [task chat / result summary / token count]             │
└─────────────────────────────────────────────────────────┘
```

The left panel is the task tree. Each row shows:
- Status dot (running amber pulse / done green / error red)
- Task title
- Token count + cost
- `result_summary` if present (1-line preview)

Clicking a task row slides up a detail panel at the bottom (or replaces the right panel — TBD) showing that task's ChatView. Clicking the orchestrator row returns to orchestrator chat.

The orchestrator chat is the primary view. The task tree is the context panel.

**Left rail integration.** Projects get a collapsible section in the left rail above work/personal sessions. Each project entry shows: project title, task count, status indicator (all done / N running / error). Clicking a project opens the project view. Task sessions themselves are hidden from the flat work/personal lists — they're only accessible via the project view.

---

### Phase 3 — Task dependencies (optional, later)

Skip for v1. All tasks spawn in parallel. The orchestrator prompt already instructs it to design independent tasks. If dependency ordering becomes necessary:

- Add `depends_on = ArrayField` or a `TaskDependency` join table to Session
- `spawn_task` accepts an optional `depends_on: [session_id]` arg
- The dispatch function queues the task instead of immediately threading it
- A small scheduler checks for unblocked tasks after each task completes

This is probably overkill for personal use — if tasks truly depend on each other, the orchestrator can just spawn them sequentially (spawn task A, wait for done event, spawn task B).

---

## Key design decisions

**Why not make the orchestrator run continuously?**

The orchestrator is a normal session. It runs, issues `spawn_task` calls, and stops. This is correct — it doesn't need to poll. The auto-resume mechanism (phase 1) kicks it again when tasks finish. This keeps the event loop clean and avoids a long-running thread that could stall.

**Why a full-screen view for projects rather than extending the existing chat overlay?**

The existing `ChatView` is a single-session view. A project involves N+1 sessions simultaneously. Trying to squeeze this into the existing chat overlay would mean hiding the task tree or making the layout awkward. A dedicated full-screen view gives room for both panels and sets the right expectation: this is a different mode of working.

**Why `report_result` as a tool instead of just reading the last message?**

The orchestrator context window is finite. If each task produced 20 messages of tool calls and reasoning, feeding all of that back to the orchestrator would be expensive and noisy. A structured 5-sentence summary per task is cheaper, more reliable, and what the orchestrator actually needs. The orchestrator prompt already tells agents to be self-contained — `report_result` completes that contract.

**What about tasks that need human approval mid-run (gated tools like git_push)?**

Task agents go through the same approval flow as regular sessions — the approval UI in ChatView will surface for any task session that hits a gated tool. The task tree should visually indicate `needs_input` so it's obvious one of the background tasks is waiting. This reuses the existing `pendingApproval` state, no new mechanism needed.

---

## What not to build yet

- **Cross-task shared filesystem** — tasks each have their own session working dir. Sharing files between tasks requires explicit orchestrator coordination (pass output as context in the next task's prompt). This is fine for v1; a shared project workspace dir can come later.
- **Task retry** — if a task errors, the user can open its chat, diagnose, and re-run manually. Auto-retry adds complexity for an edge case.
- **Persistent project state across orchestrator turns** — the orchestrator's conversation history already contains its own prior turns. No extra state management needed.
- **Multi-user projects** — single-user only. The whole app is single-user.

---

## Files to touch

| File | Change |
|---|---|
| `backend/agent/models.py` | Add `task_status`, `result_summary` to Session |
| `backend/agent/migrations/` | New migration |
| `backend/agent/tools.py` | Add `report_result` tool; update `spawn_task` to set task_status, call `_maybe_resume_orchestrator` |
| `backend/agent/views.py` | Include `task_status` in session list response; add digest endpoint for project task results |
| `frontend/src/App.jsx` | Add project state, project view toggle, left rail project section |
| `frontend/src/components/ProjectView.jsx` | New — two-panel project view component |
| `frontend/src/components/LeftRail.jsx` | Add projects section |
| `frontend/src/api.js` | Add `listProjects`, `createProject` |
| `frontend/src/index.css` | Project view layout styles |

Existing files that don't need to change: `agent_loop.py`, `ChatView.jsx` (reused as-is inside ProjectView), `approval.py`, `scheduler.py`.

---

## Rough build order

1. `task_status` field + migration (15 min)
2. `report_result` tool (30 min)
3. Auto-resume orchestrator on task completion (1 hr — needs careful threading)
4. `ProjectView.jsx` with hardcoded/mock data to nail the layout (2 hr)
5. Wire up real data + left rail projects section (2 hr)
6. Project creation modal (1 hr)
7. Task `needs_input` indicator in task tree (30 min)
8. Testing end-to-end with a real project (1 hr)

Total estimate: ~8 hours of focused work.
