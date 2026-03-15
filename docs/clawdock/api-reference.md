# ClawDock — Gateway RPC API Reference

All ClawDock operations are exposed via the OpenClaw WebSocket gateway as `company.*` RPC methods. Clients call them using:

```typescript
const result = await client.request<T>("company.METHOD_NAME", params);
```

Error responses have shape `{ code: string; message: string }`.

---

## Agent Methods

### `company.agents.list`

Returns all known agents merged with their current runtime state.

**Params:** `{}`

**Response:** `ClawDockAgent[]`

Each element is a full `ClawDockAgent` (see [data-model.md](./data-model.md)):

- Config fields: `id`, `name`, `model`, `skills`, `toolCount`
- Meta fields: `role`, `team`, `emoji`, `color`, `description`, `runtime`, `reportTo`, `directReports`
- Runtime fields: `status`, `pid`, `startedAt`, `lastActiveAt`, `cpuPercent`, `memoryMb`, `tokensUsed`, `tasksCompleted`, `currentTask`

**Notes:**

- Agents defined only in `agents-meta.json` (no matching config entry) are included.
- Runtime fields default to `0` / `undefined` for agents with no running process.

---

### `company.agents.get`

Returns a single agent with runtime state.

**Params:** `{ id: string }`

**Response:** `ClawDockAgent`

**Errors:**

- `INVALID_REQUEST` — `id` missing
- `NOT_FOUND` — no agent with that ID

---

### `company.agents.update`

Updates the persisted `AgentMeta` for an agent. Only provided fields are updated.

**Params:**

| Field           | Type        | Description                         |
| --------------- | ----------- | ----------------------------------- |
| `id`            | `string`    | Required                            |
| `role`          | `string?`   | e.g. "CEO", "Researcher"            |
| `team`          | `string?`   | e.g. "executive", "devops"          |
| `emoji`         | `string?`   | e.g. "👑"                           |
| `color`         | `string?`   | Hex color e.g. "#ff5c5c"            |
| `description`   | `string?`   | Short description                   |
| `runtime`       | `string?`   | One of the `ClawDockRuntime` values |
| `reportTo`      | `string?`   | Parent agent ID                     |
| `directReports` | `string[]?` | Child agent IDs                     |

**Response:** `ClawDockAgent` (if agent exists in config) or `AgentMeta`

**Errors:** `INVALID_REQUEST` — `id` missing

---

### `company.agents.delete`

Removes the ClawDock metadata for an agent. Does not touch the core config.

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

**Errors:** `INVALID_REQUEST` — `id` missing

---

### `company.agents.start`

Dispatches a task to an agent, spawning its configured runner.

**Params:**

| Field  | Type      | Default                   | Description                 |
| ------ | --------- | ------------------------- | --------------------------- |
| `id`   | `string`  | —                         | Required                    |
| `task` | `string?` | `"Start and await tasks"` | Prompt passed to the runner |

**Response:** `{ ok: true, runId: string }`

**Errors:**

- `INVALID_REQUEST` — `id` missing
- `INTERNAL_ERROR` — runner failed to start (e.g. binary not on PATH)

---

### `company.agents.stop`

Sends SIGTERM to the agent's process (SIGKILL after 5 s timeout).

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

---

### `company.agents.restart`

Stops then optionally restarts the agent with a new prompt.

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

---

### `company.agents.pause`

Sends SIGSTOP to the agent's process, freezing it.

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

**Notes:** Only works on Unix systems. Has no effect if no process is running.

---

### `company.agents.resume`

Sends SIGCONT to the agent's process, resuming it.

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

---

### `company.agents.run`

Dispatches an arbitrary prompt to an agent (same as `start` but requires an explicit prompt).

**Params:**

| Field    | Type     | Description         |
| -------- | -------- | ------------------- |
| `id`     | `string` | Required            |
| `prompt` | `string` | Required; task text |

**Response:** `{ runId: string }`

**Errors:**

- `INVALID_REQUEST` — `id` or `prompt` missing
- `INTERNAL_ERROR` — runner spawn failed

---

### `company.agents.logs`

Fetches execution log entries for an agent from the in-memory ring buffer.

**Params:**

| Field     | Type      | Default | Description                                 |
| --------- | --------- | ------- | ------------------------------------------- |
| `id`      | `string`  | —       | Required                                    |
| `limit`   | `number?` | 100     | Max entries to return                       |
| `sinceTs` | `number?` | —       | Only entries after this Unix timestamp (ms) |

**Response:** `LogEntry[]`

**Errors:** `INVALID_REQUEST` — `id` missing

---

## Fleet Methods

### `company.fleet.snapshot`

Returns the latest fleet metrics snapshot from `FleetMonitor`.

**Params:** `{}`

**Response:** `FleetSnapshot`

```typescript
{
  agents: FleetMetric[];   // per-agent CPU, mem, tokens, uptime
  totalRunning: number;
  totalIdle: number;
  totalCrashed: number;
  totalTasks: number;
  ts: number;              // Unix timestamp (ms) of the snapshot
}
```

**Notes:** Returns an empty snapshot with `ts: Date.now()` before the first FleetMonitor poll (at most 5 s after startup).

---

## Profile Methods

### `company.profile.get`

Returns the company profile.

**Params:** `{}`

**Response:** `CompanyProfile`

---

### `company.profile.set`

Updates the company profile. Only provided fields are updated.

**Params:**

| Field           | Type        | Description                |
| --------------- | ----------- | -------------------------- |
| `name`          | `string?`   | Company name               |
| `mission`       | `string?`   | Mission statement          |
| `vision`        | `string?`   | Vision statement           |
| `values`        | `string[]?` | Company values             |
| `businessModel` | `string?`   | Business model description |
| `focusAreas`    | `string[]?` | Key focus areas            |

**Response:** `CompanyProfile` (updated)

---

## Team Methods

### `company.teams.list`

**Params:** `{}`

**Response:** `TeamConfig[]`

---

### `company.teams.create`

**Params:**

| Field         | Type                  | Default         | Description      |
| ------------- | --------------------- | --------------- | ---------------- |
| `name`        | `string`              | `"New Team"`    | Team name        |
| `agents`      | `string[]`            | `[]`            | Agent IDs        |
| `strategy`    | `SupervisionStrategy` | `"one-for-one"` | Restart strategy |
| `color`       | `string?`             | —               | Display color    |
| `description` | `string?`             | —               | Description      |

**Response:** `TeamConfig`

**Side effect:** Broadcasts `company.team.updated` to all WS clients.

---

### `company.teams.update`

**Params:** `{ id: string, ...partial fields }`

**Response:** `TeamConfig`

**Errors:** `NOT_FOUND` — team not found

**Side effect:** Broadcasts `company.team.updated`.

---

### `company.teams.delete`

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

---

## Task Methods

### `company.tasks.list`

**Params:**

| Field      | Type          | Description                                                |
| ---------- | ------------- | ---------------------------------------------------------- |
| `status`   | `TaskStatus?` | Filter: `"backlog"`, `"in_progress"`, `"review"`, `"done"` |
| `assignee` | `string?`     | Filter by agent ID                                         |
| `project`  | `string?`     | Filter by project name                                     |

**Response:** `Task[]`

---

### `company.tasks.create`

**Params:**

| Field         | Type           | Default      | Description                                 |
| ------------- | -------------- | ------------ | ------------------------------------------- |
| `title`       | `string`       | `"New Task"` | Task title                                  |
| `description` | `string?`      | —            | Details                                     |
| `status`      | `TaskStatus`   | `"backlog"`  | Initial status                              |
| `priority`    | `TaskPriority` | `"medium"`   | `"critical"`, `"high"`, `"medium"`, `"low"` |
| `assignee`    | `string?`      | —            | Agent ID                                    |
| `project`     | `string?`      | —            | Project name                                |
| `tags`        | `string[]?`    | —            | Labels                                      |
| `dueAt`       | `number?`      | —            | Unix timestamp (ms)                         |

**Response:** `Task`

**Side effect:** Broadcasts `company.task.updated`.

---

### `company.tasks.update`

**Params:** `{ id: string, ...partial fields (same as create) }`

**Response:** `Task`

**Errors:** `NOT_FOUND`

**Side effect:** Broadcasts `company.task.updated`.

---

### `company.tasks.delete`

**Params:** `{ id: string }`

**Response:** `{ ok: true }`

---

### `company.tasks.assign`

Shorthand to set the `assignee` on a task.

**Params:** `{ taskId: string, agentId: string }`

**Response:** `Task`

**Errors:**

- `INVALID_REQUEST` — missing fields
- `NOT_FOUND` — task not found

**Side effect:** Broadcasts `company.task.updated`.

---

## Orchestration Methods

### `company.orchestrate.run`

Runs a task with automatic delegation through the org hierarchy. The target agent plans subtasks, delegates them to subordinates recursively, then synthesizes the results.

**Params:**

| Field      | Type      | Default | Description                    |
| ---------- | --------- | ------- | ------------------------------ |
| `id`       | `string`  | —       | Required; agent to orchestrate |
| `prompt`   | `string`  | —       | Required; task text            |
| `maxDepth` | `number?` | 3       | Max recursive delegation depth |

**Response:** `OrchestrationResult`

```typescript
{
  agentId: string;        // the orchestrating agent
  content: string;        // synthesized final output
  tokensUsed: number;     // total tokens across all agents
  subtasks: OrchestrationResult[]; // recursive subordinate results
  phase: "leaf" | "orchestrated";
  durationMs: number;
}
```

**Flow:**

1. Resolves direct reports via `registry.getDirectReports(id)`.
2. If leaf agent (no reports) or max depth reached: executes task directly via `processManager.runTaskAwait()`.
3. **Plan phase**: Asks the agent to produce a JSON delegation plan listing subtasks for each subordinate.
4. **Delegate phase**: Dispatches subtasks in parallel; each subordinate recursively orchestrates if it has its own reports.
5. **Synthesize phase**: Collects all subordinate outputs and asks the agent to produce a unified response.

**Broadcast events emitted:**

- `company.orchestration.phase` — at each phase transition (planning, delegating, synthesizing, complete)
- `company.agent.status` — for each agent as it becomes active/idle
- `company.agent.log` — execution logs, delegation system logs
- `company.agent.message` — inter-agent task/result messages via MessageBus

**Errors:**

- `INVALID_REQUEST` — `id` or `prompt` missing
- `INTERNAL_ERROR` — orchestration failed (timeout, runner error, etc.)

---

## Messaging Methods

### `company.message.send`

Sends a message from a human to the company. Routes to the AI Director (or first available agent). If the director has subordinates, automatically orchestrates; otherwise runs directly.

**Params:**

| Field     | Type     | Description            |
| --------- | -------- | ---------------------- |
| `content` | `string` | Required; message text |

**Response:** `{ ok: true, orchestrating?: boolean, runId?: string, msgId: string }`

- `msgId` — ID of the recorded `AgentMessage`
- `orchestrating` — `true` if the director has subordinates and orchestration was launched (fire-and-forget; progress is broadcast via WS events)
- `runId` — ID of the spawned task run (present only for leaf directors)

**Flow:**

1. Records the message in `MessageBus` (from: `"human"`, to: `"company"`, type: `"task"`).
2. Finds director: agent whose `role` contains `"director"`, or `id === "ai-director"`, or the first agent.
3. Broadcasts `company.agent.status` (director → active).
4. Appends a `system` log entry and broadcasts `company.agent.log`.
5. **If director has subordinates**: launches `orchestrator.execute(director.id, content)` in the background and responds immediately with `{ ok: true, orchestrating: true }`. Progress is streamed via real-time WS events.
6. **If director is a leaf**: calls `processManager.runTask(director.id, content)` and responds with `{ ok: true, runId }`.
7. On runner error: broadcasts `company.agent.status` (idle) + error log entry, responds with `INTERNAL_ERROR`.
8. If no agents configured: still responds `{ ok: true, msgId }`.

**Errors:**

- `INVALID_REQUEST` — empty `content`
- `INTERNAL_ERROR` — director runner failed to start

---

### `company.messages.list`

Returns the message history from `MessageBus`.

**Params:**

| Field   | Type      | Default | Description                |
| ------- | --------- | ------- | -------------------------- |
| `limit` | `number?` | 100     | Max messages (most recent) |

**Response:** `AgentMessage[]`
