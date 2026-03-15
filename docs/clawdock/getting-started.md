# ClawDock — Getting Started Guide

This guide walks you through setting up ClawDock from scratch: installing prerequisites, configuring your first agents, launching the system, and running your first multi-agent task.

---

## Prerequisites

| Requirement | Minimum version     | Check command        |
| ----------- | ------------------- | -------------------- |
| Node.js     | 22+                 | `node --version`     |
| pnpm        | 9+                  | `pnpm --version`     |
| OpenClaw    | latest (`2026.3.x`) | `openclaw --version` |

At least one agent runtime CLI must be installed:

| Runtime            | Binary     | Install                                 |
| ------------------ | ---------- | --------------------------------------- |
| openclaw (default) | `openclaw` | Already installed with the main package |
| claude-code        | `claude`   | `npm i -g @anthropic-ai/claude-code`    |
| gemini             | `gemini`   | `npm i -g @google/gemini-cli`           |
| codex              | `codex`    | `npm i -g @openai/codex`                |
| aider              | `aider`    | `pip install aider-chat`                |

---

## 1. Install OpenClaw

```bash
npm i -g openclaw@latest
```

Or if you are working from a local clone:

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
```

---

## 2. Run Onboarding (if first time)

```bash
openclaw onboard
```

This sets up your `~/.openclaw/config.yml` with API keys and default agent settings.

---

## 3. Configure Agents

ClawDock agents are defined in two places:

### a) Core agent list — `~/.openclaw/config.yml`

Add entries under `agents.list`. Each entry defines the agent's identity, model, and base capabilities:

```yaml
agents:
  list:
    - id: orchestrator
      name: Agent Orchestrator
      model: claude-sonnet-4-5

    - id: engineering
      name: Engineering Lead
      model: claude-sonnet-4-5

    - id: marketing
      name: Marketing Lead
      model: claude-sonnet-4-5

    - id: operations
      name: Operations Lead
      model: claude-haiku-4-5

    - id: finance
      name: Finance Lead
      model: claude-haiku-4-5
```

### b) ClawDock metadata — `~/.openclaw/clawdock/agents-meta.json`

This file enriches agents with ClawDock-specific fields (role, team, hierarchy, runtime, visual settings). You can edit it manually or use the web UI / CLI to create agents.

```json
{
  "orchestrator": {
    "role": "Orchestrator",
    "team": "orchestration",
    "emoji": "🎯",
    "color": "#6366f1",
    "runtime": "openclaw",
    "description": "Top-level orchestrator. Receives human instructions, plans, delegates to department agents, and synthesizes results.",
    "reportTo": null
  },
  "engineering": {
    "role": "Engineering",
    "team": "engineering",
    "emoji": "💻",
    "color": "#22c55e",
    "runtime": "openclaw",
    "description": "Manages software engineering tasks — code, tests, CI/CD, and infrastructure.",
    "reportTo": "orchestrator"
  },
  "marketing": {
    "role": "Marketing",
    "team": "marketing",
    "emoji": "📣",
    "color": "#f97316",
    "runtime": "openclaw",
    "description": "Handles content creation, SEO, social media, campaigns, and brand strategy.",
    "reportTo": "orchestrator"
  },
  "operations": {
    "role": "Operations",
    "team": "operations",
    "emoji": "⚙️",
    "color": "#60a5fa",
    "runtime": "openclaw",
    "description": "Manages day-to-day operations, project tracking, OKRs, and process optimization.",
    "reportTo": "orchestrator"
  },
  "finance": {
    "role": "Finance",
    "team": "finance",
    "emoji": "💰",
    "color": "#eab308",
    "runtime": "openclaw",
    "description": "Handles budgeting, cost analysis, financial reporting, and resource allocation.",
    "reportTo": "orchestrator"
  }
}
```

**Key fields:**

| Field         | Type           | Description                                                                    |
| ------------- | -------------- | ------------------------------------------------------------------------------ |
| `role`        | string         | Display role (shown in org chart, fleet table)                                 |
| `team`        | string         | Team grouping key                                                              |
| `emoji`       | string         | Avatar emoji for UI rendering                                                  |
| `color`       | string         | Hex color for charts and badges                                                |
| `runtime`     | string         | Which CLI runner to use: `openclaw`, `claude-code`, `gemini`, `codex`, `aider` |
| `reportTo`    | string or null | Parent agent ID for org chart hierarchy; `null` for top-level                  |
| `description` | string         | What the agent does (used in delegation planning prompts)                      |

> **Tip:** You can also create agents from the web UI (Fleet tab → "Create Agent") or the CLI (`openclaw clawdock agents create`). Both methods write to `agents-meta.json` automatically.

---

## 4. Start the Gateway

The gateway is the backend server that powers both the web UI and the CLI:

```bash
# Production mode
openclaw gateway run

# Development mode (auto-rebuilds on code changes)
pnpm dev gateway --force
```

Default port: `18789`. The gateway will:

1. Build TypeScript if needed
2. Bind to `ws://127.0.0.1:18789`
3. Initialize `CompanyService` (loads agent registry, task store, team store, profile)
4. Start the `FleetMonitor` (polls agent process CPU/memory)
5. Serve the web UI at `http://127.0.0.1:18789`

### Common flags

| Flag            | Description                                               |
| --------------- | --------------------------------------------------------- |
| `--force`       | Start even if another gateway is running on the same port |
| `--port <n>`    | Use a different port (default `18789`)                    |
| `--bind <mode>` | `loopback` (default) or `all`                             |

### Verify it's running

```bash
# Check port binding
lsof -i :18789

# Check gateway logs
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```

---

## 5. Open the Web UI

### Option A: Built-in control UI

Open `http://localhost:18789` in your browser. Navigate to the **Company** section using the sidebar.

### Option B: Vite dev server (for development)

If you are developing the frontend:

```bash
cd ui
pnpm dev
```

This starts a Vite HMR server at `http://localhost:5173` which proxies API calls to the gateway.

---

## 6. Web UI Navigation

The Company section has the following views:

| View            | Path                 | Description                                                                                        |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| **Overview**    | `/company`           | Company profile, agent status summary, teams, tasks, chats                                         |
| **Live Office** | `/company/office`    | Animated agent workspace with real-time execution log, flying messages, and "Talk to Company" chat |
| **Org Chart**   | `/company/org-chart` | Hierarchical tree visualization of agent reporting structure                                       |
| **Fleet**       | `/company/fleet`     | Agent management table — create, start, stop, view status                                          |
| **Teams**       | `/company/teams`     | Team cards with supervision strategies and member lists                                            |
| **Tasks**       | `/company/tasks`     | Kanban board for task tracking (auto-updated by orchestration)                                     |

---

## 7. Send Your First Task

### From the Web UI

1. Go to **Live Office**
2. In the **Talk to Company** panel, type a message:
   ```
   Create a quarterly roadmap for Q2 2026
   ```
3. The Agent Orchestrator receives the message and:
   - **Plans** — asks itself which department agents should handle subtasks
   - **Delegates** — dispatches subtasks to Engineering, Marketing, Operations, Finance
   - **Synthesizes** — collects results and produces a final response
4. Watch the execution in real time:
   - **Left panel**: Animated office with agent thought bubbles and flying messages
   - **Right panel → Log**: Step-by-step execution log with delegation phases
   - **Right panel → Outputs**: Formatted markdown results from each agent

### From the CLI

```bash
# Send a message to the company (dispatches to Orchestrator)
openclaw clawdock message send "Create a quarterly roadmap for Q2 2026"

# Or directly orchestrate with a specific agent
openclaw clawdock orchestrate run orchestrator "Create a quarterly roadmap for Q2 2026"
```

### From the CLI — individual agent tasks

```bash
# Start a task on a specific agent
openclaw clawdock agents start engineering --task "Set up CI/CD pipeline for the new microservice"

# Check agent logs
openclaw clawdock logs tail engineering

# View all running processes
openclaw clawdock fleet snapshot
```

---

## 8. Task Lifecycle

When you send a message through "Talk to Company":

```
Human message
    │
    ▼
┌─────────────────────┐
│  Agent Orchestrator  │  ← receives message
│  Phase: planning     │  ← plans delegation
└─────────┬───────────┘
          │ delegates subtasks
    ┌─────┼──────┬──────────┐
    ▼     ▼      ▼          ▼
  Eng   Mktg   Ops       Finance
  (run)  (run)  (run)     (run)
    │     │      │          │
    └─────┼──────┴──────────┘
          │ results collected
          ▼
┌─────────────────────┐
│  Agent Orchestrator  │
│  Phase: synthesizing │  ← merges results
│  Phase: complete     │  ← broadcasts final answer
└─────────────────────┘
```

A corresponding **Task** is automatically created in the Kanban board:

- Status `in_progress` when orchestration starts
- Status `done` when orchestration completes
- Status `backlog` if orchestration fails

---

## 9. Persisted Data

All ClawDock data is stored under `~/.openclaw/clawdock/`:

| File               | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `agents-meta.json` | Agent metadata (role, team, emoji, color, runtime, hierarchy) |
| `tasks.json`       | Kanban task board data                                        |
| `teams.json`       | Team configurations and supervision strategies                |
| `profile.json`     | Company profile (name, mission, vision, values)               |
| `logs/`            | Agent execution logs (NDJSON, one file per agent)             |

These files are created automatically on first gateway startup.

---

## 10. Using Different Runtimes

Each agent can use a different CLI runtime. Set the `runtime` field in `agents-meta.json` or via the web UI create form:

```json
{
  "engineering": {
    "runtime": "claude-code",
    "role": "Engineering",
    ...
  },
  "marketing": {
    "runtime": "gemini",
    "role": "Marketing",
    ...
  }
}
```

Verify runtime availability:

```bash
# Check which runtimes are installed
which openclaw claude gemini codex aider
```

See [runners.md](./runners.md) for detailed documentation on each runtime's command format, output parsing, and configuration options.

---

## 11. Team Configuration

Teams group agents with a supervision strategy that controls restart behavior:

```bash
# Create a team via CLI
openclaw clawdock teams create --name engineering --agents engineering --strategy one-for-one
```

Or via the web UI Teams tab → "Create First Team".

### Supervision strategies

| Strategy       | Behavior                                          |
| -------------- | ------------------------------------------------- |
| `one-for-one`  | One agent crashes → only that agent restarts      |
| `one-for-all`  | One agent crashes → entire team restarts          |
| `rest-for-one` | One agent crashes → all downstream agents restart |
| `singleton`    | Single agent, auto-restarted on failure           |

---

## 12. Company Profile

Edit your company profile from the web UI (Overview → Profile tab → Edit) or directly in `~/.openclaw/clawdock/profile.json`:

```json
{
  "name": "Acme AI Corp",
  "mission": "Build the future with AI agents.",
  "vision": "Every company powered by intelligent agent fleets.",
  "businessModel": "B2B SaaS with tiered subscriptions.",
  "focusAreas": ["Product launch", "Seed fundraise"],
  "values": ["Speed", "Quality", "Transparency"]
}
```

---

## Troubleshooting

### Gateway won't start

```bash
# Check if another process is using the port
lsof -i :18789

# Force start (kills existing)
openclaw gateway run --force
```

### Agents not appearing in the UI

1. Verify `~/.openclaw/config.yml` has entries under `agents.list`
2. Check `~/.openclaw/clawdock/agents-meta.json` exists and is valid JSON
3. Restart the gateway to reload config

### Agent task fails immediately

```bash
# Check if the runtime binary is available
which openclaw  # or claude, gemini, codex, aider

# Check agent logs for error details
openclaw clawdock logs tail <agent-id>
```

### "No agents configured" in the UI

Create agents via:

- **Web UI**: Fleet tab → "Create First Agent" button
- **CLI**: `openclaw clawdock agents create --name "My Agent" --role Engineer --runtime openclaw`
- **Manual**: Add entries to `~/.openclaw/config.yml` and `~/.openclaw/clawdock/agents-meta.json`

### WebSocket connection failed

The frontend connects to `ws://localhost:18789`. Ensure:

1. The gateway is running (`lsof -i :18789`)
2. No firewall is blocking the port
3. If using the Vite dev server, it proxies to the gateway automatically

---

## Next Steps

- Read [architecture.md](./architecture.md) for the full system diagram
- See [api-reference.md](./api-reference.md) for all RPC methods
- Check [realtime-events.md](./realtime-events.md) for WebSocket event formats
- Review [runners.md](./runners.md) for agent runtime details
- Explore [cli.md](./cli.md) for all CLI commands
