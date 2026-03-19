export type AgentStatus = "running" | "paused" | "waiting" | "archived" | "error";
export type EventType =
  | "spawn"
  | "start"
  | "pause"
  | "resume"
  | "split"
  | "merge"
  | "backtrack"
  | "archive"
  | "error"
  | "handoff";

export interface Agent {
  id: string;
  name: string;
  role: string;
  parentId?: string;
  domain: string;
  skills: string[];
  lifecycle: "persistent" | "ephemeral" | "contract";
  workspace?: string;
}

export interface LifecycleEvent {
  id: string;
  agentId: string;
  timestamp: number;
  type: EventType;
  targetId?: string;
  details?: string;
}

export interface Annotation {
  id: string;
  timestamp: number;
  agentId?: string;
  type: "bottleneck" | "decision" | "dispatch" | "insight";
  title: string;
  description: string;
  placement?: "top" | "bottom";
}

// ── UI-derived types (computed by derivation.ts, not from backend) ───────

export interface ActivityWindow {
  id: string;
  agentId: string;
  startTime: number;
  endTime: number | null;
}

export interface LineageEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: "split" | "merge" | "backtrack" | "handoff";
  timestamp: number;
}

export interface AgentSnapshot extends Agent {
  currentStatus: AgentStatus;
  lastEvent?: LifecycleEvent;
}

// ── Backend data types ──────────────────────────────────────────────────

export interface AgentCapability {
  subject: string;
  value: number; // 0–100
}

export interface ToolUsageEntry {
  name: string;
  icon: string;
  count: number;
}

export interface SystemMetricPoint {
  time: string;
  cpu: number;
  memory: number;
  context: number;
}

export interface ArtifactEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  additions?: number;
  deletions?: number;
  additionUnit?: string;
}

export interface TaskEntry {
  id: string;
  label: string;
  /** Full untruncated text (only set when label was truncated). */
  fullLabel?: string;
  completed: boolean;
}

export interface PlatformEntry {
  name: string;
  icon: string;
  iconColor: string;
}

export interface ServiceAccessEntry {
  name: string;
  description: string;
  icon: string;
  iconColor: string;
  enabled: boolean;
}

export interface FileAccessEntry {
  path: string;
  isFolder: boolean;
  indent: number;
  access: "rw" | "readonly" | "none";
}

export interface ToolPermission {
  name: string;
  icon: string;
  level: "allowed" | "ask" | "denied";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentId?: string;
  agentName?: string;
  /** Seconds offset from session/mission start (for timeline-synced playback). */
  ts?: number;
}

/** Per-agent config/capability data. */
export interface AgentRuntimeConfig {
  capabilities: AgentCapability[];
  serviceAccess: ServiceAccessEntry[];
  fileAccess: FileAccessEntry[];
  toolPermissions: ToolPermission[];
}

/** Per-agent runtime telemetry (aggregated across all activity windows). */
export interface AgentTelemetry {
  platforms: PlatformEntry[];
  summary: string;
  tasks: TaskEntry[];
  artifacts: ArtifactEntry[];
  toolUsage: ToolUsageEntry[];
  systemMetrics: SystemMetricPoint[];
}

/** Summary of a mission for dropdown selection. */
export interface MissionSummary {
  missionId: string;
  title: string;
  startTime: number;
  endTime: number | null;
  agentCount: number;
  taskCount: number;
}

/** A task session spans multiple agents working on one task. */
export interface TaskSessionData {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime: number | null;
  /** Absolute epoch ms when the session started (for Live/Completed detection). */
  globalStartMs?: number;

  agents: Agent[];
  events: LifecycleEvent[];
  annotations: Annotation[];

  agentConfigs: Record<string, AgentRuntimeConfig>;
  agentTelemetry: Record<string, AgentTelemetry>;

  metrics: {
    avgLatency: string;
    totalTokens: number;
    bottleneckCount: number;
  };

  chatMessages: ChatMessage[];
}
