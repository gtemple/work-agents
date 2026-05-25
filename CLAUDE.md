# Work Agents — Project Context

Built entirely in one session. This file is the reference for any future Claude context.

---

## What this is

A personal AI agent manager. You run multiple Gemini 2.5 Flash agents simultaneously, each as an independent session. Agents can read/write files, run code, browse the web, clone GitHub repos, create PRs, manage memory, and spawn sub-agents. There's a React dashboard to monitor and interact with all of them.

Deployed on a MacBook Air (the live server). Developed in WSL2 on Windows. Code lives at `git@github.com:gtemple/work-agents.git`.

---

## Stack

- **Backend**: Django (Python), SQLite, SSE streaming via `StreamingHttpResponse`
- **Frontend**: React + Vite, react-router-dom, @phosphor-icons/react, react-markdown, highlight.js
- **AI**: Google Gemini 2.5 Flash via `google-genai` SDK (`genai.Client`)
- **Icons**: Phosphor (`@phosphor-icons/react`) — central exports in `frontend/src/components/Icons.jsx`

---

## Project layout

```
work-agents/
├── backend/
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py          # GEMINI_API_KEY, GITHUB_TOKEN, LINEAR_*, MEDIA_ROOT
│   │   └── urls.py              # /api/* → agent.urls
│   └── agent/
│       ├── models.py            # all DB models
│       ├── views.py             # all API endpoints
│       ├── urls.py              # URL routing
│       ├── agent_loop.py        # core Gemini loop (generator/SSE)
│       ├── tools.py             # tool declarations + dispatch
│       ├── approval.py          # threading.Event gate for gated tools
│       ├── repocache.py         # git --mirror cache + local clone
│       ├── suggestions.py       # action item generation (Gemini structured output)
│       ├── scheduler.py         # background scheduler (schedules + daily suggestions)
│       ├── linear.py            # Linear API calls
│       ├── github.py            # GitHub API helpers
│       ├── sandbox.py           # subprocess code execution
│       └── web.py               # web search + fetch
└── frontend/
    └── src/
        ├── App.jsx              # root: sessions state, event polling, routing
        ├── api.js               # all fetch calls
        ├── utils.js             # formatTokens, estimateCost, formatElapsed
        └── components/
            ├── Sidebar.jsx      # left nav: projects + work/personal sessions
            ├── AgentCards.jsx   # dashboard table with filters
            ├── Chat.jsx         # session chat view
            ├── ActivityFeed.jsx # right panel: live tool call stream
            ├── ProjectView.jsx  # project view: orchestrator chat + task panel
            ├── ActionItems.jsx  # "Ideas" panel on dashboard
            ├── MemoryPanel.jsx  # modal: Keys / About me / Repos tabs
            ├── SchedulePanel.jsx
            ├── StatsPanel.jsx
            ├── PlanCard.jsx     # plan approval UI
            ├── ApprovalGate.jsx # gated tool approval UI
            ├── AgentSteps.jsx   # collapsible tool call log
            ├── Message.jsx      # chat message bubble
            ├── Toast.jsx        # completion notifications
            ├── Icons.jsx        # central Phosphor exports + ToolIcon, CATEGORY_ICONS
            └── ...
```

---

## Models (backend/agent/models.py)

| Model | Purpose |
|-------|---------|
| `Session` | One agent conversation. Has `session_role` (standard/orchestrator/task), `project` FK, Linear fields, `pending_plan`, token counts |
| `Project` | Groups sessions. Has `orchestrator` (OneToOne → Session) and `tasks` (reverse FK from Session) |
| `Message` | Chat turns (role: user/assistant) |
| `AgentStep` | Sub-steps within a message (tool_call, tool_result) |
| `GlobalEvent` | Broadcast events from background agents, polled by frontend every 3s |
| `Memory` | Key-value persistent memory (agents read/write) |
| `RepoMemory` | Per-repo markdown knowledge base (architecture, conventions, gotchas) |
| `UserContext` | Singleton — what agents have learned about the user |
| `ActionItem` | Dashboard "Ideas" — status: active/queued/saved/dismissed |
| `TokenUsage` | Per-API-call token log. `session=None` for system calls (suggestions). Has `source` field |
| `Schedule` | Recurring agent tasks |

Migrations: 0001 through 0011.

---

## API endpoints (all under /api/)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `sessions/` | List all sessions (includes `max_event_id` for frontend poll seeding) |
| POST | `sessions/new/` | Create session |
| GET/PATCH | `sessions/<id>/` | Get session with messages / update title or system_prompt |
| POST | `sessions/<id>/files/` | Upload files to session dir |
| GET | `sessions/<id>/stream/?prompt=` | SSE: run agent, stream events |
| POST | `sessions/<id>/approve/` | Approve/reject a gated action or plan |
| GET | `events/?after=<id>&session=<id>` | Poll global events |
| GET | `stats/` | Token totals, daily chart, top sessions |
| GET/POST | `projects/` | List / create projects |
| GET/PATCH | `projects/<id>/` | Get project with tasks / update |
| GET/PATCH | `context/user/` | UserContext read/write |
| GET | `context/repos/` | List all RepoMemory |
| GET/PATCH | `context/repos/<repo>/` | Repo memory read/write |
| GET/POST | `memory/` | Key-value memories |
| DELETE/POST | `memory/<key>/` | Delete / update a memory key |
| GET/POST | `schedules/` | List / create schedules |
| PATCH/DELETE | `schedules/<id>/` | Update / delete schedule |
| GET | `action-items/` | Active + saved action items |
| POST | `action-items/<id>/<action>/` | investigate / save / dismiss / refresh |
| POST | `linear/sync/` | Sync open Linear issues → sessions |
| POST | `webhooks/linear/` | Linear webhook handler |

---

## Agent loop (agent_loop.py)

Generator function `run(session, prompt)` yields SSE dicts. Event types:
- `tokens` — after every Gemini API call (persisted to DB mid-run)
- `tool_call` / `tool_result` — tool execution
- `plan_ready` — orchestrator submitted a plan (saved to `session.pending_plan`)
- `approval_required` — gated tool waiting for user
- `approval_granted` / `approval_rejected`
- `assistant_text` — final text response
- `done` — turn complete (saves Message + AgentSteps to DB)
- `error`

Token counting: snapshot `base_input/output_tokens` at run start, write absolute value (base + cumulative) to DB after every API call. Prevents double-counting if run blocks at approval gate.

**System prompts composed from:**
1. `BASE_SYSTEM_PROMPT` (always)
2. `ORCHESTRATOR_SYSTEM_PROMPT` (if `session_role == 'orchestrator'`)
3. `WORK_SYSTEM_PROMPT_PREFIX` + task type instructions (if `session.is_work`)
4. Repo knowledge base pre-injected if work session
5. GitHub identity
6. Session `system_prompt`
7. Available memory keys

---

## Tools (agent/tools.py)

`dispatch(tool_name, args, session_dir, github_token, session=None)`

| Tool | Notes |
|------|-------|
| `run_code` | python/javascript/bash via sandbox.execute() |
| `read_file`, `write_file`, `list_files` | session working dir |
| `bash` | subprocess in session dir |
| `clone_repo` | uses repocache (git --mirror + local clone for speed) |
| `git_branch`, `git_status`, `git_diff`, `git_commit` | standard git ops |
| `git_push` | GATED — requires user approval |
| `create_pr` | GATED |
| `post_pr_review` | GATED |
| `memory_write/read/list/delete` | Key-value Memory model |
| `read_user_context` / `update_user_context` | UserContext singleton |
| `read_repo_memory` / `update_repo_memory` | RepoMemory, uses `_upsert_section()` |
| `web_search` / `fetch_page` | web.py |
| `get_pr` / `get_pr_diff` | GitHub API |
| `submit_plan` | PLAN_TOOLS — saves to `session.pending_plan`, blocks on approval gate |
| `spawn_task` | Orchestrator only — creates task Session, starts background thread, fires `task_spawned` GlobalEvent |
| `list_project_tasks` | Orchestrator only — lists task sessions for this project |

**GATED_TOOLS** = `{git_push, create_pr, post_pr_review}` — blocked until user approves via `approve_action` endpoint.

**PLAN_TOOLS** = `{submit_plan}` — plan saved to DB before blocking, so frontend can discover it via polling even without SSE.

---

## Projects

A `Project` has one **orchestrator session** (role=`orchestrator`) that discusses and plans with the user. It can call `spawn_task(title, prompt)` to create **task sessions** (role=`task`) that run independently in background threads.

- Orchestrator never writes code directly — its system prompt tells it to plan and delegate
- Task sessions get full agent capabilities including the work system prompt
- `task_spawned` GlobalEvent triggers a sessions + projects refresh in the frontend
- ProjectView: orchestrator chat on left, 280px task list panel on right

---

## Frontend state (App.jsx)

- `sessions` — array of session objects (augmented with live state: status, liveSteps, liveText, color, etc.)
- `projects` — array of project objects from `/api/projects/`
- `feed` — last 60 tool call events for ActivityFeed
- `toasts` — completion notifications

**Event polling**: every 3s via `getEvents(lastEventIdRef.current)`. On app load, `lastEventIdRef` is seeded from `max_event_id` in the `list_sessions` response — prevents replaying historical events from crashed runs (which caused stale timers).

**SSE (active sessions)**: `streamAgent()` opens an EventSource for real-time streaming during an active send. Background agents use the polling loop instead.

**Routing**: `/` → dashboard, `/session/:id` → SessionView (Chat), `/project/:id` → ProjectView

---

## Key patterns / gotchas

- **Repo clone cache**: `repocache.py` keeps a `git --mirror` at `MEDIA_ROOT/cache/<slug>` and does `git clone --local` (hard-links) for each session → subsequent clones are near-instant
- **Stale timer bug**: was caused by event poll starting from ID 0 on every load, replaying old `tool_call` events. Fixed by seeding `lastEventIdRef` from `max_event_id` on mount
- **eventsLoadedUpTo**: dedup guard on each session — GlobalEvent IDs ≤ this value are skipped during backfill
- **Token double-counting**: snapshot base tokens at run start, write base+cumulative as absolute value after each Gemini call
- **Suggestion tokens**: logged to `TokenUsage(session=None, source='suggestions')` — counted in Stats panel total/daily chart but not in sidebar session sum
- **Circular FK**: `Session.project` → `Project` and `Project.orchestrator` → `Session`. Migration 0010 creates Project first (without orchestrator FK), adds Session fields, then adds orchestrator FK

---

## Deployment

- **Dev (WSL2)**: `cd backend && source venv/bin/activate && python manage.py runserver` + `cd frontend && npm run dev`
- **Mac (live)**: Django on `0.0.0.0:8000`, Vite built to `frontend/dist/`, served as static from Django. SSH alias: `mac` (192.168.2.18, user: giordanotemple). Venv at `backend/.venv/`.
- **GitHub**: `git@github.com:gtemple/work-agents.git`
- **Deploy flow** (Claude does this):
  1. `git add -A && git commit -m "..." && git push` from WSL2
  2. `ssh mac 'cd work-agents && git pull'`
  3. `ssh mac 'cd work-agents/backend && source .venv/bin/activate && python manage.py migrate'`
  4. `ssh mac 'export PATH="$PATH:/opt/homebrew/bin" && cd work-agents/frontend && npm run build'`
  5. `ssh mac 'kill <django_pid>'` then restart: `ssh mac 'cd work-agents/backend && source .venv/bin/activate && nohup python manage.py runserver 0.0.0.0:8000 > /tmp/django.log 2>&1 &'`
  6. Find Django PID: `ssh mac 'ps aux | grep manage | grep -v grep'`

---

## Linear integration

- Sync via `/api/linear/sync/` — fetches open issues, creates sessions (is_work=True), stagger-starts planning threads 8s apart
- Webhook at `/api/webhooks/linear/` for real-time issue updates
- Settings: `LINEAR_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `LINEAR_TEAM_ID` in `.env`
- Planning prompt: agent reads repo memory → clones repo → explores → calls `submit_plan`

---

## Action items (Ideas panel)

- 8 active slots: 4 work + 4 personal
- Queue of ~8 items promoted as slots free up
- Generated by `suggestions.py` using Gemini structured JSON output with `response_schema`
- Dismissed titles excluded from future suggestions
- "Investigate" creates a new session pre-filled with the item title/description, refreshes sessions state before navigating (to avoid blank page)
- Daily refresh runs from `scheduler.py`

---

## Memory panel tabs

- **Keys**: key-value `Memory` store — agents and user can read/write
- **About me**: `UserContext` singleton — what agents learn about the user over time
- **Repos**: `RepoMemory` per repo — architecture notes, conventions, gotchas discovered by agents

---

## Future ideas

- **Mobile app (PWA)**: Add a `manifest.json` + service worker to the frontend. Chrome on Android will offer "Add to Home Screen" → launches as a full-screen app with its own icon. No native code or APK needed. Works as-is since the Mac is reachable at `192.168.2.18:8000` on the local network.
