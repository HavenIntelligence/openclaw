// ClawDock types — multi-agent company orchestration layer

// ── CLI runtimes supported as external agent runners ───────────────────────
export type ClawDockRuntime =
  | "openclaw" // native Pi agent (default)
  | "claude-code" // claude -p ... --output-format stream-json
  | "gemini" // gemini -p ... --output-format json
  | "codex" // codex exec ...
  | "aider"; // aider --message ... --yes

// ── Per-agent metadata stored in agents-meta.json ─────────────────────────
export interface AgentMeta {
  id: string;
  role: string; // "CEO", "Researcher", etc.
  team: string; // "executive", "content", "devops"
  emoji: string; // "👑"
  color: string; // "#ff5c5c"
  description: string;
  runtime: ClawDockRuntime;
  reportTo?: string; // parent agent id
  directReports?: string[]; // child agent ids
  /**
   * For `openclaw` runtime: the `--agent <id>` value passed to `openclaw agent --local`.
   * Defaults to "main" if unset.
   */
  agentCli?: string;
  /**
   * Optional system-prompt prefix injected as part of the task prompt.
   * Use this to give each ClawDock agent a distinct role/persona.
   */
  systemPrompt?: string;
}

// ── Live runtime state (in-memory, polled every 5 s) ──────────────────────
export type AgentStatus = "active" | "idle" | "crashed" | "starting" | "stopping" | "paused";

export interface AgentRuntimeState {
  agentId: string;
  status: AgentStatus;
  pid?: number;
  startedAt?: number; // ms timestamp
  lastActiveAt?: number;
  cpuPercent?: number;
  memoryMb?: number;
  tokensUsed: number;
  tasksCompleted: number;
  currentTask?: string;
  currentWorkspace?: string;
  logBuffer: LogEntry[]; // ring buffer, max 200
}

// ── Execution log entry ────────────────────────────────────────────────────
export type LogEntryType =
  | "tool_call"
  | "output"
  | "thinking"
  | "human"
  | "error"
  | "system"
  | "message_out"
  | "message_in";

export interface LogEntry {
  id: string;
  agentId: string;
  runId: string;
  type: LogEntryType;
  content: string;
  ts: number;
  durationMs?: number;
  tokensUsed?: number;
}

// ── Inter-agent message ────────────────────────────────────────────────────
export interface AgentMessage {
  id: string;
  from: string; // agentId
  to: string; // agentId
  content: string;
  type: "task" | "result" | "query" | "notify";
  ts: number;
}

// ── Rich agent view (meta + config + runtime) ──────────────────────────────
export interface ClawDockAgent {
  // from AgentConfig
  id: string;
  name: string;
  model: string;
  skills?: string[];
  // from AgentMeta
  role: string;
  team: string;
  emoji: string;
  color: string;
  description: string;
  runtime: ClawDockRuntime;
  reportTo?: string;
  directReports: string[];
  toolCount: number;
  cronCount: number;
  // from AgentRuntimeState
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

// ── Fleet snapshot ────────────────────────────────────────────────────────
export interface FleetMetric {
  agentId: string;
  status: AgentStatus;
  cpuPercent: number;
  memoryMb: number;
  tokensUsed: number;
  tasksCompleted: number;
  uptimePct: number;
  lastActiveAt?: number;
}

export interface FleetSnapshot {
  agents: FleetMetric[];
  totalRunning: number;
  totalIdle: number;
  totalCrashed: number;
  totalTasks: number;
  ts: number;
}

// ── Task (Kanban) ─────────────────────────────────────────────────────────
export type TaskStatus = "backlog" | "in_progress" | "review" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Agent who is executing the task (same as assignee; stored explicitly for queries). */
  agentId?: string;
  assignee?: string; // agentId — who is executing the task
  assignedBy?: string; // agentId — who created/delegated the task
  assignedAt?: number; // timestamp when assigned
  /** When execution of this task started (ms). Set when status becomes in_progress. */
  startTime?: number;
  /** When execution of this task ended (ms). Set when status becomes done. */
  endTime?: number;
  /** Session key for the run (e.g. agent:main, agent:ceo). */
  sessionId?: string;
  reviewedBy?: string; // agentId — who reviews (defaults to assignedBy)
  reviewNote?: string; // reviewer comment on review/done
  roundCount?: number; // how many review cycles this task has been through
  maxRounds?: number; // max allowed review rounds (default 3)
  /** Groups all tasks spawned from a single user message/orchestration run. */
  missionId?: string;
  project?: string;
  tags?: string[];
  dueAt?: number;
  tokensUsed?: number;
  blockedBy?: string[]; // task ids
  createdAt: number;
  updatedAt: number;
}

// ── Team ──────────────────────────────────────────────────────────────────
export type SupervisionStrategy =
  | "one-for-one" // one crashes → only that restarts
  | "one-for-all" // one crashes → whole team restarts
  | "rest-for-one" // one crashes → downstream restarts
  | "singleton"; // single agent, restart-in-place

export interface TeamConfig {
  id: string;
  name: string;
  agents: string[]; // agentIds
  strategy: SupervisionStrategy;
  color?: string;
  description?: string;
  goal?: string; // team objective/OKR
  leaderId?: string; // agentId of team leader
}

// ── Company Profile ───────────────────────────────────────────────────────
export interface CompanyProfile {
  name: string;
  mission?: string;
  vision?: string;
  values?: string[];
  businessModel?: string;
  focusAreas?: string[];
  /** Max orchestration rounds before forcing final synthesis (default 5). */
  maxOrchestrationRounds?: number;
  /** Per-agent timeout in ms (default 120000). */
  agentTimeoutMs?: number;
  updatedAt: number;
}
