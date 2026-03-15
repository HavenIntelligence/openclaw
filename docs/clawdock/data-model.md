# ClawDock — Data Model Reference

All types are defined in two mirrored files:

- **Backend:** `src/company/types.ts`
- **Frontend:** `ui/src/ui/company-types.ts`

Keep these files in sync when modifying types.

---

## `ClawDockRuntime`

```typescript
type ClawDockRuntime =
  | "openclaw" // native OpenClaw Pi agent (default)
  | "claude-code" // Claude Code CLI: claude -p
  | "gemini" // Google Gemini CLI: gemini -p
  | "codex" // OpenAI Codex CLI: codex --full-auto
  | "aider"; // Aider: aider --message --yes
```

---

## `AgentMeta`

Persisted to `~/.openclaw/clawdock/agents-meta.json`.

```typescript
interface AgentMeta {
  id: string;
  role: string; // Display title: "CEO", "Researcher", "DevOps Engineer"
  team: string; // Group name: "executive", "content", "devops"
  emoji: string; // "👑", "🤖", "💻"
  color: string; // Hex: "#ff5c5c"
  description: string; // One-line description
  runtime: ClawDockRuntime;
  reportTo?: string; // Parent agent ID (for org chart hierarchy)
  directReports?: string[]; // Child agent IDs

  // openclaw-specific
  agentCli?: string; // --agent <value> (defaults to "main")
  systemPrompt?: string; // Role/persona prefix injected before tasks
}
```

**Storage format** (`agents-meta.json`):

```json
{
  "ai-director": {
    "id": "ai-director",
    "role": "CEO / Director",
    "team": "executive",
    "emoji": "👑",
    "color": "#ff5c5c",
    "description": "Top-level orchestrator for all AI ops.",
    "runtime": "openclaw",
    "directReports": ["ops-prime", "content-director"]
  },
  "ops-prime": {
    "id": "ops-prime",
    "role": "COO",
    "team": "executive",
    "emoji": "🏢",
    "color": "#60a5fa",
    "description": "Manages day-to-day operations.",
    "runtime": "claude-code",
    "reportTo": "ai-director"
  }
}
```

---

## `AgentStatus`

```typescript
type AgentStatus = "active" | "idle" | "crashed" | "starting" | "stopping" | "paused";
```

| Value      | Meaning                                |
| ---------- | -------------------------------------- |
| `active`   | Running a task                         |
| `idle`     | Available, no current task             |
| `crashed`  | Process exited with non-zero code      |
| `starting` | Process being spawned (brief)          |
| `stopping` | SIGTERM sent, waiting for exit         |
| `paused`   | SIGSTOP sent; process frozen in memory |

---

## `AgentRuntimeState`

In-memory only; not persisted. Held in `ProcessManager.states`.

```typescript
interface AgentRuntimeState {
  agentId: string;
  status: AgentStatus;
  pid?: number; // OS process ID
  startedAt?: number; // Unix ms when first activated
  lastActiveAt?: number; // Unix ms of last status change to active/idle
  cpuPercent?: number; // Updated by FleetMonitor from `ps`
  memoryMb?: number; // RSS in MB from `ps`
  tokensUsed: number; // Cumulative tokens across all runs
  tasksCompleted: number; // Count of completed runTask() calls
  currentTask?: string; // Prompt text of current task (truncated)
  logBuffer: LogEntry[]; // Ring buffer, max 200 entries
}
```

---

## `ClawDockAgent`

Merged view returned by `company.agents.list` and `company.agents.get`. Combines config fields, `AgentMeta`, and `AgentRuntimeState`.

```typescript
interface ClawDockAgent {
  // From OpenClaw agent config (agents.list entry)
  id: string;
  name: string; // Display name from config
  model: string; // Primary model string
  skills?: string[]; // Installed skills
  toolCount: number; // Estimated from config.tools sections

  // From AgentMeta
  role: string;
  team: string;
  emoji: string;
  color: string;
  description: string;
  runtime: ClawDockRuntime;
  reportTo?: string;
  directReports: string[]; // Always present (empty array if none)
  cronCount: number; // Reserved (always 0 currently)

  // From AgentRuntimeState
  status: AgentStatus;
  pid?: number;
  startedAt?: number;
  lastActiveAt?: number;
  cpuPercent?: number;
  memoryMb?: number;
  tokensUsed: number;
  tasksCompleted: number;
  currentTask?: string;
}
```

---

## `LogEntryType`

```typescript
type LogEntryType =
  | "tool_call" // Agent invoked a tool
  | "output" // Agent produced text output
  | "thinking" // Internal reasoning (claude-code extended thinking)
  | "human" // Human message dispatched to agent
  | "error" // Error from stderr or runner
  | "system" // Gateway-level event (dispatch, status change)
  | "message_out" // (reserved) Outgoing inter-agent message
  | "message_in"; // (reserved) Incoming inter-agent message
```

---

## `LogEntry`

```typescript
interface LogEntry {
  id: string; // "log_<timestamp>_<random6>"
  agentId: string;
  runId: string; // "run_<timestamp>_<random6>"
  type: LogEntryType;
  content: string;
  ts: number; // Unix ms
  durationMs?: number; // For tool calls: execution time
  tokensUsed?: number; // For result entries: output tokens
}
```

---

## `AgentMessage`

```typescript
interface AgentMessage {
  id: string; // "msg_<timestamp>_<random6>"
  from: string; // agentId or "human"
  to: string; // agentId or "company"
  content: string;
  type: "task" | "result" | "query" | "notify";
  ts: number; // Unix ms
}
```

| `type`   | Usage                         |
| -------- | ----------------------------- |
| `task`   | Human → company task dispatch |
| `result` | Agent → human final answer    |
| `query`  | Agent → agent question        |
| `notify` | Agent → agent notification    |

---

## `FleetMetric`

Per-agent snapshot within a `FleetSnapshot`.

```typescript
interface FleetMetric {
  agentId: string;
  status: AgentStatus;
  cpuPercent: number; // % CPU (from ps), 0 if no process
  memoryMb: number; // RSS MB (from ps), 0 if no process
  tokensUsed: number;
  tasksCompleted: number;
  uptimePct: number; // 0–100 (time active / time since startedAt)
  lastActiveAt?: number;
}
```

---

## `FleetSnapshot`

```typescript
interface FleetSnapshot {
  agents: FleetMetric[];
  totalRunning: number; // active + starting
  totalIdle: number; // idle + paused
  totalCrashed: number; // crashed
  totalTasks: number; // sum of all tasksCompleted
  ts: number; // Unix ms of snapshot
}
```

---

## `TaskStatus` and `TaskPriority`

```typescript
type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type TaskPriority = "critical" | "high" | "medium" | "low";
```

---

## `Task`

```typescript
interface Task {
  id: string; // "task_<timestamp>_<random6>"
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string; // agentId
  project?: string; // free-form project name
  tags?: string[];
  dueAt?: number; // Unix ms
  tokensUsed?: number; // populated when an agent completes the task
  blockedBy?: string[]; // task IDs this task depends on
  createdAt: number;
  updatedAt: number;
}
```

---

## `SupervisionStrategy`

```typescript
type SupervisionStrategy =
  | "one-for-one" // Only crashed agent restarts
  | "one-for-all" // Whole team restarts on any crash
  | "rest-for-one" // Crashed + all downstream agents restart
  | "singleton"; // Single agent, restart in-place
```

---

## `TeamConfig`

```typescript
interface TeamConfig {
  id: string; // "team_<timestamp>_<random6>"
  name: string;
  agents: string[]; // agentIds in this team
  strategy: SupervisionStrategy;
  color?: string; // display color
  description?: string;
}
```

---

## `CompanyProfile`

```typescript
interface CompanyProfile {
  name: string;
  mission?: string;
  vision?: string;
  values?: string[];
  businessModel?: string;
  focusAreas?: string[];
  updatedAt: number; // Unix ms
}
```

---

## Orchestration Types

### `OrchestrationPhase`

```typescript
type OrchestrationPhase =
  | "planning"
  | "delegating"
  | "synthesizing"
  | "executing"
  | "complete"
  | "failed";
```

### `OrchestrationResult`

Returned by `Orchestrator.execute()` and the `company.orchestrate.run` RPC.

```typescript
interface OrchestrationResult {
  agentId: string; // the agent that produced this result
  content: string; // final output text (synthesized or direct)
  tokensUsed: number; // total tokens across this agent + all subtasks
  subtasks: OrchestrationResult[]; // recursive subordinate results (empty for leaf)
  phase: "leaf" | "orchestrated"; // whether delegation occurred
  durationMs: number; // wall-clock time for this subtree
}
```

### `TaskResult`

Returned by `ProcessManager.runTaskAwait()` — the awaitable counterpart to `runTask()`.

```typescript
interface TaskResult {
  runId: string;
  content: string; // final output text from the agent
  tokensUsed: number;
  exitCode: number; // 0 = success
}
```
