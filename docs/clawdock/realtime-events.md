# ClawDock — Real-time WebSocket Events

The gateway broadcasts real-time events to all connected WebSocket clients whenever agent state changes. The frontend's `app-gateway.ts` handles every `company.*` event and patches `AppViewState` to trigger reactive Lit re-renders.

## Event Handling in the Frontend

Events arrive via `handleGatewayEvent(host, evt)` in `ui/src/ui/app-gateway.ts`. The `host` is the main `OpenClawApp` Lit element with `AppViewState`.

---

## Event Catalog

### `company.agent.status`

Fired every time an agent's runtime status changes.

**Payload:**

```typescript
{
  agentId: string;
  status: AgentStatus; // "active" | "idle" | "crashed" | "starting" | "stopping" | "paused"
  updatedAt: number; // Unix timestamp (ms)
}
```

**Emitted by:** `ProcessManager.setStatus()` on every state transition, and manually by `company.message.send` when routing to director.

**Frontend handler:**

```typescript
// app-gateway.ts
const idx = host.companyAgents.findIndex((a) => a.id === agentId);
if (idx >= 0) {
  const updated = { ...host.companyAgents[idx], status };
  host.companyAgents = [
    ...host.companyAgents.slice(0, idx),
    updated,
    ...host.companyAgents.slice(idx + 1),
  ];
}
```

Creates a new array reference to trigger Lit `@state()` re-render.

---

### `company.agent.log`

Fired for every log entry produced by a running agent (stdout line, stderr line, or synthetic system/error entry).

**Payload:**

```typescript
{
  agentId: string;
  runId: string;
  entry: LogEntry;
}
```

**`LogEntry` shape:**

```typescript
{
  id: string;           // "log_<timestamp>_<random>"
  agentId: string;
  runId: string;
  type: LogEntryType;   // see below
  content: string;
  ts: number;           // Unix timestamp (ms)
  durationMs?: number;
  tokensUsed?: number;
}
```

**`LogEntryType` values:**

| Value           | Source                 | Description                                      |
| --------------- | ---------------------- | ------------------------------------------------ |
| `"output"`      | Agent stdout           | Standard agent output / response text            |
| `"tool_call"`   | Agent stdout           | A tool invocation (name + args)                  |
| `"thinking"`    | Agent stdout           | Internal reasoning (claude-code thinking blocks) |
| `"human"`       | `company.message.send` | Human message dispatched to agent                |
| `"error"`       | Agent stderr           | Error output                                     |
| `"system"`      | Gateway                | Gateway-level events (dispatch, start, stop)     |
| `"message_out"` | MessageBus             | Outgoing inter-agent message                     |
| `"message_in"`  | MessageBus             | Incoming inter-agent message                     |

**Emitted by:** `ProcessManager.runTask()` (stdout/stderr line handler), `company.message.send` (dispatch log).

**Frontend handler:**

```typescript
// app-gateway.ts
if (!host.companyAgentLogs.has(agentId)) {
  host.companyAgentLogs.set(agentId, []);
}
const buf = host.companyAgentLogs.get(agentId)!;
buf.push(entry);
if (buf.length > 200) buf.shift();
host.companyAgentLogs = new Map(host.companyAgentLogs); // new ref → re-render
```

---

### `company.fleet.metrics`

Fired every 5 seconds by `FleetMonitor` with fresh CPU/memory data.

**Payload:** `FleetSnapshot`

```typescript
{
  agents: FleetMetric[];  // array of per-agent metrics
  totalRunning: number;
  totalIdle: number;
  totalCrashed: number;
  totalTasks: number;
  ts: number;
}
```

**`FleetMetric` shape:**

```typescript
{
  agentId: string;
  status: AgentStatus;
  cpuPercent: number;    // from ps -o pcpu
  memoryMb: number;      // from ps -o rss / 1024
  tokensUsed: number;
  tasksCompleted: number;
  uptimePct: number;     // 0–100
  lastActiveAt?: number;
}
```

**Broadcast options:** `{ dropIfSlow: true }` — this event is dropped if the WebSocket output queue is backed up. The frontend will receive the next poll instead.

**Frontend handler:**

```typescript
host.companyFleetSnapshot = evt.payload as FleetSnapshot;
```

---

### `company.task.updated`

Fired when a task is created, updated, or assigned.

**Payload:**

```typescript
{
  task: Task;
}
```

**Emitted by:** `company.tasks.create`, `company.tasks.update`, `company.tasks.assign`.

**Frontend handler:** Upserts the task in `host.companyTasks` (immutable array replacement).

---

### `company.team.updated`

Fired when a team is created or updated.

**Payload:**

```typescript
{
  team: TeamConfig;
}
```

**Emitted by:** `company.teams.create`, `company.teams.update`.

**Frontend handler:** Upserts the team in `host.companyTeams`.

---

### `company.agent.message`

Fired when a message is recorded on the `MessageBus` (human→company or inter-agent).

**Payload:**

```typescript
{
  msg: AgentMessage;
}
```

**`AgentMessage` shape:**

```typescript
{
  id: string; // "msg_<timestamp>_<random>"
  from: string; // agentId or "human"
  to: string; // agentId or "company"
  content: string;
  type: "task" | "result" | "query" | "notify";
  ts: number;
}
```

**Frontend handler:**

```typescript
host.companyMessages = [...host.companyMessages.slice(-499), msg];
```

Keeps the last 500 messages; appends the new one.

---

## Initial Data Load on Connect

When the WebSocket connects (or reconnects), `app-gateway.ts` calls:

```typescript
void loadCompanyAll(host);
```

This calls all loaders in parallel, then loads agent logs:

```typescript
async function loadCompanyAll(state): Promise<void> {
  await Promise.all([
    loadCompanyAgents(state),
    loadCompanyFleet(state),
    loadCompanyTasks(state),
    loadCompanyTeams(state),
    loadCompanyProfile(state),
    loadCompanyMessages(state),
  ]);
  await loadAllAgentLogs(state); // sequential per-agent log fetch
}
```

## Tab Navigation Load

When the user navigates to any company tab, `app-settings.ts` also triggers `loadCompanyAll`:

```typescript
if (
  host.tab === "companyOverview" ||
  host.tab === "companyFleet" ||
  host.tab === "companyTeams" ||
  host.tab === "companyOrgChart" ||
  host.tab === "companyOffice" ||
  host.tab === "companyTasks"
) {
  await loadCompanyAll(host);
}
```
