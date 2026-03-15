// ClawDock shared types for the UI layer.
// These mirror src/company/types.ts — keep in sync.

export type ClawDockRuntime = "openclaw" | "claude-code" | "gemini" | "codex" | "aider";

export type AgentStatus = "active" | "idle" | "crashed" | "starting" | "stopping" | "paused";

export interface ClawDockAgent {
  id: string;
  name: string;
  model: string;
  skills?: string[];
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

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  type: "task" | "result" | "query" | "notify";
  ts: number;
}

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

export type TaskStatus = "backlog" | "in_progress" | "review" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  assignedBy?: string;
  assignedAt?: number;
  reviewedBy?: string;
  reviewNote?: string;
  roundCount?: number;
  maxRounds?: number;
  project?: string;
  tags?: string[];
  dueAt?: number;
  tokensUsed?: number;
  blockedBy?: string[];
  createdAt: number;
  updatedAt: number;
}

export type SupervisionStrategy = "one-for-one" | "one-for-all" | "rest-for-one" | "singleton";

export interface TeamConfig {
  id: string;
  name: string;
  agents: string[];
  strategy: SupervisionStrategy;
  color?: string;
  description?: string;
  goal?: string;
  leaderId?: string;
}

export interface CompanyProfile {
  name: string;
  mission?: string;
  vision?: string;
  values?: string[];
  businessModel?: string;
  focusAreas?: string[];
  maxOrchestrationRounds?: number;
  updatedAt: number;
}
