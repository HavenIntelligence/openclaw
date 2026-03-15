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

export interface Annotation {
  id: string;
  timestamp: number;
  agentId?: string;
  type: "bottleneck" | "decision" | "dispatch" | "insight";
  title: string;
  description: string;
  placement?: "top" | "bottom";
}
