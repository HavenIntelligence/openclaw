# ClawDock — Backend Modules Reference

All backend files live under `src/company/`. They are loaded by the OpenClaw gateway at startup.

---

## `company-service.ts` — Top-level Facade

**Class:** `CompanyService`

The single entry point for all ClawDock operations. Wires all sub-services together and is accessed via the module-level singleton `getCompanyService()`.

### Properties

| Property         | Type                 | Description                             |
| ---------------- | -------------------- | --------------------------------------- |
| `registry`       | `AgentRegistry`      | Reads agent config + persisted metadata |
| `processManager` | `ProcessManager`     | Spawns and tracks agent processes       |
| `fleetMonitor`   | `FleetMonitor`       | Polls CPU/mem, emits fleet snapshots    |
| `logStore`       | `LogStore`           | In-memory ring-buffer logs per agent    |
| `taskStore`      | `TaskStore`          | Kanban task CRUD + JSON persistence     |
| `teamStore`      | `TeamStore`          | Team config CRUD + JSON persistence     |
| `profileStore`   | `ProfileStore`       | Company profile JSON persistence        |
| `messageBus`     | `MessageBus`         | Inter-agent message routing + history   |
| `broadcast`      | `GatewayBroadcastFn` | Sends WebSocket events to all clients   |

### Static Factory

```typescript
static async create(broadcast: GatewayBroadcastFn): Promise<CompanyService>
```

Creates the instance, initializes `clawdock/` directory under `~/.openclaw/`, loads all persisted data, starts `FleetMonitor`, and wires `MessageBus → broadcast`.

### Lifecycle

```typescript
// Called at gateway startup (server.impl.ts)
void initCompanyService(broadcast).catch((err) => log.warn(...));

// Called at gateway shutdown
await svc.shutdown();  // stops FleetMonitor interval
```

### File Locations (persisted data)

All paths are under `resolveConfigDir()` (typically `~/.openclaw/`):

| File                        | Contents                              |
| --------------------------- | ------------------------------------- |
| `clawdock/agents-meta.json` | `AgentMeta` records keyed by agent ID |
| `clawdock/tasks.json`       | Array of `Task` objects               |
| `clawdock/teams.json`       | Array of `TeamConfig` objects         |
| `clawdock/profile.json`     | `CompanyProfile` object               |

---

## `types.ts` — Core Type Definitions

See [data-model.md](./data-model.md) for the full type reference. Key types:

- `ClawDockRuntime` — `"openclaw" | "claude-code" | "gemini" | "codex" | "aider"`
- `AgentMeta` — persisted per-agent metadata (role, team, emoji, color, runtime, reporting)
- `AgentRuntimeState` — in-memory process state (pid, status, tokens, log buffer)
- `ClawDockAgent` — merged view: config + meta + runtime state
- `LogEntry` — a single execution log entry with type discriminant
- `AgentMessage` — inter-agent or human→company message
- `FleetSnapshot` — point-in-time fleet metrics summary
- `Task` — Kanban task with status, priority, assignee
- `TeamConfig` — group of agents with supervision strategy
- `CompanyProfile` — company name, mission, values

---

## `registry.ts` — AgentRegistry

Merges the user's OpenClaw agent config (`agents.list`) with ClawDock-specific metadata to produce `ClawDockAgent` objects.

### Constructor

```typescript
new AgentRegistry(clawdockDir: string)
```

### Methods

| Method                    | Returns                 | Description                                   |
| ------------------------- | ----------------------- | --------------------------------------------- |
| `load()`                  | `Promise<void>`         | Reads `agents-meta.json`; called once at init |
| `getAgents()`             | `ClawDockAgent[]`       | All agents: config entries merged with meta   |
| `getAgent(id)`            | `ClawDockAgent \| null` | Single agent by ID                            |
| `getMeta(id)`             | `AgentMeta \| null`     | Raw metadata only                             |
| `upsertMeta(id, partial)` | `Promise<AgentMeta>`    | Merge-update + persist                        |
| `deleteMeta(id)`          | `Promise<void>`         | Remove + persist                              |

### Merge Logic

1. Iterate `config.agents.list` — each entry produces a `ClawDockAgent` with config fields (id, name, model, skills, tools) merged with persisted `AgentMeta`. Missing meta fields get defaults (`role: "Agent"`, `team: "general"`, `emoji: "🤖"`, deterministic color from ID hash).
2. Iterate `metaById` — agents that exist in meta but not in config are included as "standalone ClawDock agents" (meta-only, no config entry).

### Default Colors

Eight palette colors are used, selected by `abs(hash(id)) % 8`:
`#3b82f6`, `#8b5cf6`, `#10b981`, `#f59e0b`, `#ef4444`, `#06b6d4`, `#ec4899`, `#84cc16`

---

## `process-manager.ts` — ProcessManager

Spawns CLI child processes for agent tasks and tracks their runtime state.

### Constructor

```typescript
new ProcessManager(
  registry: AgentRegistry,
  logStore: LogStore,
  broadcast: GatewayBroadcastFn,
  runnerList: CliAgentRunner[],
)
```

Runners are registered by `runner.name` key.

### State Model

Each agent has an `AgentRuntimeState` entry:

```typescript
interface AgentRuntimeState {
  agentId: string;
  status: AgentStatus; // "active" | "idle" | "crashed" | "starting" | "stopping" | "paused"
  pid?: number;
  startedAt?: number;
  lastActiveAt?: number;
  cpuPercent?: number;
  memoryMb?: number;
  tokensUsed: number;
  tasksCompleted: number;
  currentTask?: string;
  logBuffer: LogEntry[]; // ring buffer, max 200
}
```

### Methods

| Method                       | Returns               | Description                                        |
| ---------------------------- | --------------------- | -------------------------------------------------- |
| `getState(id)`               | `AgentRuntimeState`   | Current state, or default idle state               |
| `getAllStates()`             | `AgentRuntimeState[]` | All agents including those with only default state |
| `runTask(id, prompt, opts?)` | `Promise<string>`     | Spawn task, returns `runId`                        |
| `stop(id)`                   | `Promise<void>`       | SIGTERM → wait 5 s → SIGKILL                       |
| `restart(id, prompt?)`       | `Promise<void>`       | stop + optional runTask                            |
| `pause(id)`                  | `void`                | SIGSTOP to child process                           |
| `resume(id)`                 | `void`                | SIGCONT to child process                           |

### `runTask` Flow

1. Look up `AgentMeta.runtime` → select `CliAgentRunner`.
2. Set status to `"active"`, broadcast `company.agent.status`.
3. Call `runner.runTask(id, prompt, mergedOpts)` → `ChildProcess`.
4. For `openclaw` runtime: use `createOpenClawLineParser()` (stateful accumulator for multi-line JSON). For all others: use `runner.parseOutput(line)`.
5. Stream `stdout` via `readline`, convert each line to `ParsedOutput`:
   - `{ type: "log", entry }` → `LogStore.append()` + `broadcast("company.agent.log")`
   - `{ type: "result", content }` → update `tokensUsed`, `tasksCompleted`, emit final output log entry
6. Stream `stderr` → error log entries + broadcast.
7. On `exit(code)`: status → `"idle"` (code 0) or `"crashed"` (non-zero), broadcast `company.agent.status`.

### Broadcast Events Emitted

- `company.agent.status` — on every status change
- `company.agent.log` — on every stdout/stderr line

---

## `fleet-monitor.ts` — FleetMonitor

Polls CPU and memory for all tracked agent processes every 5 seconds.

### Methods

| Method          | Description                            |
| --------------- | -------------------------------------- |
| `start()`       | Starts `setInterval(poll, 5000)`       |
| `stop()`        | Clears interval                        |
| `getSnapshot()` | Returns last `FleetSnapshot` or `null` |

### Poll Logic

1. Collect all PIDs from `ProcessManager.getAllStates()`.
2. Run `ps -p <pids> -o pid=,pcpu=,rss=` to get CPU% and RSS.
3. Build `FleetMetric` for each agent (merges ps output with state).
4. Compute uptime %: active time / total time since `startedAt`. Crashed agents use `lastActiveAt` as uptime end.
5. Broadcast `company.fleet.metrics` with `{ dropIfSlow: true }` — dropped if the gateway output queue is full.

---

## `log-store.ts` — LogStore

In-memory ring buffer of `LogEntry` objects per agent. Max 200 entries per agent (oldest trimmed on overflow).

### Methods

| Method                | Returns      | Description                                              |
| --------------------- | ------------ | -------------------------------------------------------- |
| `append(partial)`     | `LogEntry`   | Add entry, auto-generate `id`, default `ts = Date.now()` |
| `get(agentId, opts?)` | `LogEntry[]` | Fetch with optional `limit` and `sinceTs` filter         |
| `clear(agentId)`      | `void`       | Wipe agent's buffer                                      |

---

## `message-bus.ts` — MessageBus

In-memory pub/sub for inter-agent messages. Maintains a history ring buffer (max 500 messages).

### Methods

| Method                           | Returns          | Description                       |
| -------------------------------- | ---------------- | --------------------------------- |
| `onMessage(handler)`             | `() => void`     | Subscribe; returns unsubscribe fn |
| `send(from, to, content, type?)` | `AgentMessage`   | Publish + record in history       |
| `getHistory(opts?)`              | `AgentMessage[]` | Filtered history (from/to/limit)  |

On construction, `CompanyService` wires: `messageBus.onMessage(msg => broadcast("company.agent.message", { msg }))`.

---

## `task-store.ts` — TaskStore

Kanban task CRUD. Persists to `clawdock/tasks.json`.

### Methods

| Method                    | Returns                 | Description                                |
| ------------------------- | ----------------------- | ------------------------------------------ |
| `load()`                  | `Promise<void>`         | Load from JSON on startup                  |
| `list(filters?)`          | `Task[]`                | Filter by status, assignee, project        |
| `create(params)`          | `Promise<Task>`         | Auto-assign `id`, `createdAt`, `updatedAt` |
| `update(id, partial)`     | `Promise<Task \| null>` | Merge-update + persist                     |
| `delete(id)`              | `Promise<void>`         | Remove + persist                           |
| `assign(taskId, agentId)` | `Promise<Task \| null>` | Set assignee + persist                     |

---

## `team-store.ts` — TeamStore

Team configuration CRUD. Persists to `clawdock/teams.json`.

### Methods

| Method                | Returns                       | Description               |
| --------------------- | ----------------------------- | ------------------------- |
| `load()`              | `Promise<void>`               | Load from JSON on startup |
| `list()`              | `TeamConfig[]`                | All teams                 |
| `create(params)`      | `Promise<TeamConfig>`         | Auto-assign `id`          |
| `update(id, partial)` | `Promise<TeamConfig \| null>` | Merge-update + persist    |
| `delete(id)`          | `Promise<void>`               | Remove + persist          |

### Supervision Strategies

| Strategy       | Behavior                                            |
| -------------- | --------------------------------------------------- |
| `one-for-one`  | Only the crashed agent is restarted                 |
| `one-for-all`  | All agents in the team restart when one crashes     |
| `rest-for-one` | The crashed agent and all downstream agents restart |
| `singleton`    | Single agent; restart in-place                      |

> **Note:** Strategy is stored but not yet enforced automatically. Supervision restart logic is planned for a future milestone.

---

## `profile-store.ts` — ProfileStore

Company profile JSON persistence. Single JSON object.

### Methods

| Method         | Returns                   | Description                            |
| -------------- | ------------------------- | -------------------------------------- |
| `load()`       | `Promise<void>`           | Load on startup                        |
| `get()`        | `CompanyProfile`          | Current profile (default if never set) |
| `set(partial)` | `Promise<CompanyProfile>` | Merge-update + persist                 |

Default profile: `{ name: "My Company", updatedAt: 0 }`.
