# ClawDock — Architecture Overview

## System Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser (Lit web components)                                       │
│                                                                     │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Overview  │  │  Office  │  │ OrgChart │  │  Fleet / Teams … │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│        └─────────────┴─────────────┴─────────────────┘            │
│                          │ props                                    │
│              ┌───────────▼──────────────┐                          │
│              │  AppViewState (Lit @state)│                          │
│              │  companyAgents           │                          │
│              │  companyAgentLogs (Map)  │                          │
│              │  companyMessages         │                          │
│              │  companyFleetSnapshot    │                          │
│              │  companyTasks / Teams    │                          │
│              └───────────┬──────────────┘                          │
│                          │ RPC + WS events                         │
│              ┌───────────▼──────────────┐                          │
│              │  GatewayBrowserClient    │  (WebSocket)             │
│              └──────────────────────────┘                          │
└────────────────────────────┬───────────────────────────────────────┘
                             │ ws://localhost:GATEWAY_PORT
┌────────────────────────────▼───────────────────────────────────────┐
│  Gateway (Node.js, server.impl.ts)                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  companyHandlers  (server-methods/company.ts)               │   │
│  │  company.*  RPC namespace                                   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │  CompanyService  (company/company-service.ts)               │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │   │
│  │  │ AgentRegistry│  │ ProcessManager │  │  FleetMonitor  │  │   │
│  │  └──────────────┘  └───────┬────────┘  └────────────────┘  │   │
│  │  ┌──────────────┐          │           ┌────────────────┐  │   │
│  │  │   LogStore   │  ┌───────▼────────┐  │  MessageBus    │  │   │
│  │  └──────────────┘  │  CliAgentRunner│  └────────────────┘  │   │
│  │  ┌──────────────┐  │  (per runtime) │  ┌────────────────┐  │   │
│  │  │  TaskStore   │  └───────┬────────┘  │  ProfileStore  │  │   │
│  │  └──────────────┘          │           └────────────────┘  │   │
│  │  ┌──────────────┐          │           ┌────────────────┐  │   │
│  │  │   TeamStore  │   spawn  │           │  (future: DB)  │  │   │
│  │  └──────────────┘          ▼           └────────────────┘  │   │
│  └─────────────────────── child process ──────────────────────┘   │
│                                                                     │
│  External CLI processes:                                            │
│  openclaw agent --local  /  claude -p  /  gemini -p  /  codex  /  aider  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Gateway as the single control plane

All ClawDock operations go through the existing OpenClaw WebSocket gateway. No new server is introduced. The `company.*` RPC namespace is registered alongside all other gateway methods.

### 2. `CompanyService` is a singleton, initialized async at gateway startup

`initCompanyService(broadcast)` is called once in `server.impl.ts` as a best-effort fire-and-forget (does not block gateway startup). If initialization fails, the gateway continues running without the company feature.

### 3. Agent state is in-memory; metadata is persisted to JSON

- **Runtime state** (`AgentRuntimeState`): held in `ProcessManager.states` — a Map in RAM. Lost on restart (intentional: ephemeral process state).
- **Agent metadata** (`AgentMeta`): persisted to `~/.openclaw/clawdock/agents-meta.json` via `AgentRegistry.persistMeta()`. Survives restarts.
- **Agent config**: lives in the user's main OpenClaw config (`agents.list`). ClawDock reads this read-only via `loadConfig()`.

### 4. One process per agent, one task at a time

`ProcessManager` enforces a single concurrent `ChildProcess` per agent ID. Calling `runTask()` while a process is already running replaces the tracked `ChildProcess` reference (the old one continues; only the status tracking is reset). This is a known simplification — proper queuing will come later.

### 5. Log streaming via stdout line parsing

Each runner spawns a child process with `stdio: ['ignore', 'pipe', 'pipe']`. The `ProcessManager` attaches a `readline` interface to `stdout` and calls the runner's `parseOutput(line)` to convert raw CLI output into typed `LogEntry` objects. These are appended to `LogStore` and broadcast to all WebSocket clients via `company.agent.log`.

### 6. Real-time updates via WebSocket broadcasts

The gateway's existing `broadcast(event, payload)` mechanism is used for all real-time updates. Clients receive incremental diffs (single log entries, status changes) rather than polling for full snapshots.

### 7. Frontend state in `AppViewState`

All company-related state is stored in the main `AppViewState` (a Lit `@state` controller). Views receive data as props; they do not own state. The `app-gateway.ts` event handler patches `AppViewState` on every incoming broadcast, triggering reactive re-renders.

## Data Flow — Sending a Message

```
User types message in "Talk to Company" panel
         │
         ▼
onSendMessage(content)          [app-render.ts]
         │
         ▼
sendMessageToCompany(state, content)   [controllers/company.ts]
  → client.request("company.message.send", { content })
         │
         ▼
companyHandlers["company.message.send"]   [server-methods/company.ts]
  1. svc.messageBus.send("human", "company", content, "task")
  2. Find director agent (role contains "director" || id = "ai-director" || first agent)
  3. svc.broadcast("company.agent.status", { status: "active" })
  4. svc.logStore.append(system entry)
  5. svc.broadcast("company.agent.log", entry)
  6. svc.processManager.runTask(director.id, content)
  7. respond(true, { ok, runId, msgId })
         │
         ▼ (async, streaming)
ProcessManager.runTask()
  → spawns CLI child process
  → readline on stdout → parseOutput() → LogStore.append()
  → broadcast("company.agent.log", entry) per output line
         │
         ▼ (back on frontend)
app-gateway.ts handleGatewayEvent("company.agent.log")
  → patches host.companyAgentLogs Map
  → triggers Lit re-render
         │
         ▼
loadCompanyMessages(state)   [called after sendMessageToCompany in app-render.ts]
  → refreshes host.companyMessages from server
  → re-renders "Talk to Company" chat log
```

## Data Flow — Fleet Metrics Poll

```
FleetMonitor (setInterval 5 s)
  → ps -p <pids> -o pid=,pcpu=,rss=
  → builds FleetSnapshot
  → broadcast("company.fleet.metrics", snapshot)
         │
         ▼
app-gateway.ts handleGatewayEvent("company.fleet.metrics")
  → host.companyFleetSnapshot = payload
  → Lit re-render → CompanyFleet view updates
```

## Directory Layout

```
src/
  company/
    company-service.ts      ← CompanyService singleton + factory
    types.ts                ← All ClawDock TypeScript types (backend)
    registry.ts             ← AgentRegistry (config + meta merge)
    process-manager.ts      ← Spawn/stop/pause/resume agents
    fleet-monitor.ts        ← CPU/mem polling, FleetSnapshot
    log-store.ts            ← Per-agent in-memory log ring buffer
    message-bus.ts          ← Inter-agent message routing
    task-store.ts           ← Task CRUD + persistence
    team-store.ts           ← Team CRUD + persistence
    profile-store.ts        ← Company profile persistence
    runners/
      base.ts               ← CliAgentRunner interface + utilities
      openclaw-runner.ts    ← openclaw agent --local
      claude-code-runner.ts ← claude -p --output-format stream-json
      gemini-runner.ts      ← gemini -p
      codex-runner.ts       ← codex --full-auto
      aider-runner.ts       ← aider --message --yes

  cli/
    company-cli.ts          ← `openclaw company` CLI sub-commands

  gateway/
    server-methods/
      company.ts            ← company.* RPC handler map
    server.impl.ts          ← calls initCompanyService() at startup

ui/src/ui/
  company-types.ts          ← Mirrored frontend types
  controllers/
    company.ts              ← loadXxx / actionXxx async functions
  views/
    company-overview.ts     ← Dashboard / profile / message feed
    company-office.ts       ← Animated live office canvas
    company-org-chart.ts    ← SVG org chart with layout engine
    company-fleet.ts        ← Agent status table + controls
    company-teams.ts        ← Team management
    company-tasks.ts        ← Kanban board
    company-monitor.ts      ← Timeline / activity monitor
  app-gateway.ts            ← WebSocket event handlers (patches AppViewState)
  app-render.ts             ← Renders all company views with props + callbacks
  app-settings.ts           ← Triggers loadCompanyAll when navigating to company tabs
  app-view-state.ts         ← AppViewState type includes company state fields

docs/
  clawdock/                 ← This documentation
```
