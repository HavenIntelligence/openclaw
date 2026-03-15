import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { getAvatarUrlForAgent } from "../company-avatars.ts";
import type { ClawDockAgent, LogEntry as RealLogEntry } from "../company-types.ts";
import { formatExecutionLogContent, toSanitizedMarkdownHtml } from "../markdown.ts";

// ── Types ──────────────────────────────────────────────────────────────────
type AgentStatus = "thinking" | "working" | "idle" | "crashed" | "messaging";

type OfficeAgent = {
  id: string;
  name: string;
  emoji: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  status: AgentStatus;
  activity: string;
  thoughtBubble: string;
  thoughtTimer: number;
  color: string;
  deskX: number;
  deskY: number;
  messageTo: string | null;
  team: string;
  role?: string;
};

type FlyingMessage = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  emoji: string;
  label: string;
};

// Floating output bubble that appears above an agent on canvas
type CanvasBubble = {
  id: string;
  agentId: string;
  text: string;
  timer: number; // countdown frames until it fades
  color: string;
};

// ── Execution log entry ────────────────────────────────────────────────────
type LogEntry = {
  id: string;
  ts: string;
  /** Numeric timestamp for stable sort (newest last). */
  tsNum?: number;
  agent: string;
  /** Display name (e.g. "orchestrator" for id "ceo"). */
  agentDisplayName?: string;
  agentEmoji: string;
  type: "tool_call" | "output" | "thinking" | "human" | "error" | "system";
  content: string;
  tokens?: number;
  duration?: number;
};

// ── (Project type removed — projects UI stripped) ───────────────────────────

// ── Layout constants ──────────────────────────────────────────────────────
const TILE = 80;

// Team color palette — assigns stable colors per team name
const TEAM_PALETTE = [
  { bg: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.25)" },
  { bg: "rgba(34,197,94,0.07)", border: "rgba(34,197,94,0.25)" },
  { bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.25)" },
  { bg: "rgba(96,165,250,0.07)", border: "rgba(96,165,250,0.25)" },
  { bg: "rgba(234,179,8,0.07)", border: "rgba(234,179,8,0.25)" },
  { bg: "rgba(236,72,153,0.07)", border: "rgba(236,72,153,0.25)" },
  { bg: "rgba(132,204,22,0.07)", border: "rgba(132,204,22,0.25)" },
  { bg: "rgba(6,182,212,0.07)", border: "rgba(6,182,212,0.25)" },
];

type DynamicZone = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  border: string;
};
/** Compute floor zones and desk positions from real agent data, grouped by team. */
function computeLayout(agents: ClawDockAgent[]): {
  zones: DynamicZone[];
  desks: Map<string, { x: number; y: number }>;
  cols: number;
  rows: number;
} {
  if (agents.length === 0) {
    return { zones: [], desks: new Map(), cols: 6, rows: 4 };
  }

  // Group agents by team
  const teamMap = new Map<string, ClawDockAgent[]>();
  for (const a of agents) {
    const team = a.team || "general";
    if (!teamMap.has(team)) {
      teamMap.set(team, []);
    }
    teamMap.get(team)!.push(a);
  }

  // Find the director/orchestrator — place in a top row
  const director = agents.find(
    (a) =>
      a.role?.toLowerCase().includes("director") ||
      a.role?.toLowerCase().includes("ceo") ||
      a.role?.toLowerCase().includes("orchestrator") ||
      a.id === "ai-director" ||
      a.id === "orchestrator" ||
      a.id === "ceo",
  );
  const directorTeam = director?.team || "";

  const teamNames = [...teamMap.keys()].toSorted((a, b) => {
    // Director's team first
    if (a === directorTeam) {
      return -1;
    }
    if (b === directorTeam) {
      return 1;
    }
    return a.localeCompare(b);
  });

  const zones: DynamicZone[] = [];
  const desks = new Map<string, { x: number; y: number }>();

  // Layout: director row at top (row 0-1), team columns below (row 2+)
  // Each team gets a column; agents in a team are stacked vertically within that column.
  const ZONE_W = 3; // tiles per team column
  const nonDirTeams = director ? teamNames.filter((t) => t !== directorTeam) : teamNames;
  const dirTeamAgents = director
    ? (teamMap.get(directorTeam) ?? []).filter((a) => a.id !== director.id)
    : [];

  // Director zone spans the top
  const totalTeamCols = Math.max(nonDirTeams.length + (dirTeamAgents.length > 0 ? 1 : 0), 1);
  const totalW = totalTeamCols * ZONE_W;

  // Offset director down by 1 row so thought bubbles have room above
  const dirTopY = 1;

  if (director) {
    const dirX = Math.floor(totalW / 2);
    desks.set(director.id, { x: dirX, y: dirTopY });
    zones.push({
      x: Math.max(0, dirX - 2),
      y: dirTopY,
      w: Math.min(5, totalW),
      h: 2,
      label: directorTeam || "Executive",
      color: TEAM_PALETTE[0].bg,
      border: TEAM_PALETTE[0].border,
    });
  }

  // Team columns below director zone
  const teamStartY = director ? dirTopY + 2 : 0;
  let colIdx = 0;

  // If director's team has other members, show them as a column too
  if (dirTeamAgents.length > 0) {
    const palIdx = 0;
    const maxAgentsInTeam = dirTeamAgents.length;
    zones.push({
      x: colIdx * ZONE_W,
      y: teamStartY,
      w: ZONE_W,
      h: Math.max(2, maxAgentsInTeam + 1),
      label: directorTeam || "Executive",
      color: TEAM_PALETTE[palIdx % TEAM_PALETTE.length].bg,
      border: TEAM_PALETTE[palIdx % TEAM_PALETTE.length].border,
    });
    for (let i = 0; i < dirTeamAgents.length; i++) {
      desks.set(dirTeamAgents[i].id, { x: colIdx * ZONE_W + 1, y: teamStartY + i + 1 });
    }
    colIdx++;
  }

  for (let t = 0; t < nonDirTeams.length; t++) {
    const teamName = nonDirTeams[t];
    const teamAgents = teamMap.get(teamName) ?? [];
    const palIdx = (t + 1) % TEAM_PALETTE.length;
    const maxAgentsInTeam = teamAgents.length;
    zones.push({
      x: colIdx * ZONE_W,
      y: teamStartY,
      w: ZONE_W,
      h: Math.max(2, maxAgentsInTeam + 1),
      label: teamName,
      color: TEAM_PALETTE[palIdx].bg,
      border: TEAM_PALETTE[palIdx].border,
    });
    for (let i = 0; i < teamAgents.length; i++) {
      desks.set(teamAgents[i].id, { x: colIdx * ZONE_W + 1, y: teamStartY + i + 1 });
    }
    colIdx++;
  }

  const maxZoneBottom = zones.reduce((m, z) => Math.max(m, z.y + z.h), 0);
  return {
    zones,
    desks,
    cols: Math.max(totalW, 6),
    rows: Math.max(maxZoneBottom + 2, 6),
  };
}

// ── Cached layout (recomputed when agents change) ────────────────────────
let _cachedLayout: ReturnType<typeof computeLayout> = {
  zones: [],
  desks: new Map(),
  cols: 6,
  rows: 4,
};
let _cachedAgentIds = "";

// ── Demo execution log ────────────────────────────────────────────────────
let _execLog: LogEntry[] = [];

let _logIdCounter = 0;

// ── (Projects removed — UI stripped) ────────────────────────────────────────

// ── Human input state ──────────────────────────────────────────────────────
let _humanInput = "";
let _rightTab: "log" | "output" = "log";
let _logAgentFilter: string = "all";
let _expandedOutputIds: Set<string> = new Set();
let _panelWidth = 380; // px — right panel width, draggable
let _isDragging = false;
let _lastVisibleLogId = "";

// ── Callbacks from props (module-level to be accessible in renderFn) ────────
let _onSendMessage: ((content: string) => void) | undefined;
let _onStopAgent: ((agentId: string) => void) | undefined;
let _onPauseAll: (() => void | Promise<void>) | undefined;
let _onResumeAll: (() => void | Promise<void>) | undefined;
let _onStopAll: (() => void | Promise<void>) | undefined;
let _runningCount = 0;
let _pausedCount = 0;

/** Sends a message to the company: records an optimistic log entry and sets director to thinking. */
function _sendToCompany(msg: string) {
  // Add optimistic entry to _execLog so it shows up immediately in the log panel.
  addLog("human", "👤", "human", `[You → Orchestrator] ${msg}`);
  // Mark the orchestrator/director agent as thinking in the animation.
  const directorAgent =
    _agents.find((a) => a.role === "Orchestrator" || a.id === "orchestrator") ?? _agents[0];
  if (directorAgent) {
    directorAgent.activity = "Reading your message…";
    directorAgent.status = "thinking";
    directorAgent.thoughtBubble = msg.slice(0, 48) + (msg.length > 48 ? "…" : "");
    directorAgent.thoughtTimer = 240;
  }
  // Fire the real backend RPC.
  if (_onSendMessage) {
    _onSendMessage(msg);
  }
  _rightTab = "log";
  _scrollLogToBottom();
}

function _scrollLogToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById("cd-exec-log");
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function stripAnsi(text: string): string {
  /* eslint-disable no-control-regex -- stripping ANSI escape sequences requires matching ESC */
  return text.replace(/\x1b\]8;;.*?\x1b\\|\x1b\]8;;\x1b\\/g, "").replace(/\x1b\[[0-9;]*m/g, "");
}

function stripLogContent(content: string): string {
  return stripAnsi(content).replaceAll("\r", "");
}

function normalizeLogContent(content: string): string {
  return stripLogContent(content).trim();
}

function isNoiseLogEntry(entry: LogEntry): boolean {
  const content = normalizeLogContent(entry.content);
  if (!content) {
    return true;
  }
  if (entry.type === "system" && content.startsWith("[Human → Orchestrator]")) {
    return true;
  }
  return (
    /^\[(?:tools|warn|info|plugins|model-selection|model-fallback\/decision)\]/.test(content) ||
    content.startsWith("[agent/embedded] embedded run agent end:") ||
    content.startsWith("[agent/embedded] embedded run failover decision:")
  );
}

function dedupeDisplayLog(entries: LogEntry[]): LogEntry[] {
  const deduped: LogEntry[] = [];
  for (const entry of entries) {
    const displayContent = stripLogContent(entry.content);
    const normalized = displayContent.trim();
    if (!normalized) {
      continue;
    }
    const nextEntry = { ...entry, content: displayContent };
    const prev = deduped.at(-1);
    if (
      prev &&
      prev.agent === nextEntry.agent &&
      prev.type === nextEntry.type &&
      prev.content.trim() === nextEntry.content.trim() &&
      Math.abs((nextEntry.tsNum ?? 0) - (prev.tsNum ?? 0)) <= 5_000
    ) {
      deduped[deduped.length - 1] = nextEntry;
      continue;
    }
    deduped.push(nextEntry);
  }
  return deduped;
}

// ── Animation state ────────────────────────────────────────────────────────
// Starts empty — populated from real agent data via props. Falls back to INITIAL_AGENTS only in
// dev/demo mode when no backend agents are present.
let _agents: OfficeAgent[] = [];
let _agentsSeededFromBackend = false;
let _messages: FlyingMessage[] = [];
let _canvasBubbles: CanvasBubble[] = [];
let _activeEdges: { from: string; to: string; timer: number }[] = [];
let _bubbleIdCounter = 0;
let _tick = 0;
let _msgIdCounter = 0;
let _animFrame: number | null = null;
let _hostUpdate: (() => void) | null = null;
let _simulationStarted = false;

function addLog(
  agent: string,
  emoji: string,
  type: LogEntry["type"],
  content: string,
  tokens?: number,
) {
  const now = new Date();
  const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  _execLog.push({
    id: `l-${_logIdCounter++}`,
    ts,
    tsNum: now.getTime(),
    agent,
    agentEmoji: emoji,
    type,
    content,
    tokens,
  });
  if (_execLog.length > 80) {
    _execLog = _execLog.slice(-60);
  }
  _scrollLogToBottom();
  // Spawn canvas bubble for output and thinking entries
  if (type === "output" || type === "thinking" || type === "tool_call") {
    const shortText = content.length > 60 ? content.slice(0, 57) + "…" : content;
    const color = type === "output" ? "var(--ok)" : type === "tool_call" ? "#a78bfa" : "#60a5fa";
    // Remove existing bubble for same agent before adding new one (prevents overlap)
    _canvasBubbles = _canvasBubbles.filter((b) => b.agentId !== agent);
    _canvasBubbles.push({
      id: `bubble-${_bubbleIdCounter++}`,
      agentId: agent,
      text: shortText,
      timer: 200,
      color,
    });
    if (_canvasBubbles.length > 3) {
      _canvasBubbles = _canvasBubbles.slice(-3);
    }
  }
}

function _spawnMessage(fromId: string, toId: string, emoji: string, label: string) {
  const from = _agents.find((a) => a.id === fromId);
  const to = _agents.find((a) => a.id === toId);
  if (!from || !to) {
    return;
  }
  _messages.push({
    id: `msg-${_msgIdCounter++}`,
    fromX: from.x * TILE + TILE / 2,
    fromY: from.y * TILE + TILE / 2,
    toX: to.x * TILE + TILE / 2,
    toY: to.y * TILE + TILE / 2,
    progress: 0,
    emoji,
    label,
  });
}

function simulationStep() {
  _tick++;

  // Advance flying messages
  for (const msg of _messages) {
    msg.progress += 0.015;
  }
  _messages = _messages.filter((m) => m.progress < 1.0);

  // Tick canvas bubbles
  for (const b of _canvasBubbles) {
    b.timer--;
  }
  _canvasBubbles = _canvasBubbles.filter((b) => b.timer > 0);

  // Tick active edges
  for (const e of _activeEdges) {
    e.timer--;
  }
  _activeEdges = _activeEdges.filter((e) => e.timer > 0);

  // Agents stay fixed at their desks — no random movement.
  for (const agent of _agents) {
    // Decay thought bubbles
    if (agent.thoughtTimer > 0) {
      agent.thoughtTimer--;
      if (agent.thoughtTimer === 0) {
        agent.thoughtBubble = "";
      }
    }
    // Snap to desk position (no wandering)
    agent.x = agent.deskX;
    agent.y = agent.deskY;
    agent.targetX = agent.deskX;
    agent.targetY = agent.deskY;

    // Reset messaging status after a brief period
    if (agent.status === "messaging" && _tick % 60 === 0) {
      agent.status = "working";
    }
  }

  _hostUpdate?.();
}

function startSimulation(update: () => void) {
  if (_simulationStarted) {
    _hostUpdate = update;
    return;
  }
  _simulationStarted = true;
  _hostUpdate = update;
  const loop = () => {
    simulationStep();
    _animFrame = requestAnimationFrame(loop);
  };
  _animFrame = requestAnimationFrame(loop);
}

// (Floor zones and desk items are now computed dynamically by computeLayout())

// ── Log type helpers ───────────────────────────────────────────────────────
function logTypeClass(type: LogEntry["type"]) {
  const map: Record<string, string> = {
    tool_call: "cd-log--tool",
    output: "cd-log--output",
    thinking: "cd-log--thinking",
    human: "cd-log--human",
    error: "cd-log--error",
    system: "cd-log--system",
  };
  return map[type] ?? "";
}

function logTypeIcon(type: LogEntry["type"], content?: string) {
  // Special icon for delegation-related system entries
  if (type === "system" && content) {
    if (content.includes("[TASK_ASSIGNED]")) {
      return "📌";
    }
    if (content.includes("[TASK_DONE]")) {
      return "✅";
    }
    if (content.includes("[TASK_FAILED]")) {
      return "💥";
    }
    if (content.includes("Delegated to")) {
      return "📋";
    }
    if (content.includes("Planning")) {
      return "🧠";
    }
    if (content.includes("Synthesizing")) {
      return "🔄";
    }
    if (content.includes("Verifying") || content.includes("Verifier")) {
      return "✅";
    }
    if (content.includes("Round ")) {
      return "🔁";
    }
    if (content.includes("→")) {
      return "➡️";
    }
  }
  const map: Record<string, string> = {
    tool_call: "⚙️",
    output: "📤",
    thinking: "💭",
    human: "👤",
    error: "❌",
    system: "🔔",
  };
  return map[type] ?? "•";
}

// ── Main render ────────────────────────────────────────────────────────────
export type CompanyOfficeProps = {
  requestUpdate?: () => void;
  agents?: ClawDockAgent[];
  logs?: Map<string, RealLogEntry[]>;
  messages?: import("../company-types.js").AgentMessage[];
  /** Number of agents currently active or starting (for fleet controls). */
  runningCount?: number;
  /** Number of agents currently paused (for fleet controls). */
  pausedCount?: number;
  onSendMessage?: (content: string) => void;
  onStopAgent?: (agentId: string) => void;
  onPauseAll?: () => void | Promise<void>;
  onResumeAll?: () => void | Promise<void>;
  onStopAll?: () => void | Promise<void>;
};

export function renderCompanyOffice(props: CompanyOfficeProps) {
  if (props.requestUpdate) {
    startSimulation(props.requestUpdate);
  }
  _onSendMessage = props.onSendMessage;
  _onStopAgent = props.onStopAgent;
  _onPauseAll = props.onPauseAll;
  _onResumeAll = props.onResumeAll;
  _onStopAll = props.onStopAll;
  _runningCount = props.runningCount ?? 0;
  _pausedCount = props.pausedCount ?? 0;

  // Rebuild agent list from real backend data on first seed or when the list changes.
  if (props.agents && props.agents.length > 0) {
    // Recompute layout when agent list changes
    const agentIdKey = props.agents
      .map((a) => a.id)
      .toSorted()
      .join(",");
    if (agentIdKey !== _cachedAgentIds) {
      _cachedLayout = computeLayout(props.agents);
      _cachedAgentIds = agentIdKey;
    }

    const statusMap: Record<string, OfficeAgent["status"]> = {
      active: "working",
      idle: "idle",
      crashed: "crashed",
      starting: "thinking",
      stopping: "idle",
      paused: "idle",
    };

    for (let i = 0; i < props.agents.length; i++) {
      const realAgent = props.agents[i];
      const existing = _agents.find((a) => a.id === realAgent.id);
      if (existing) {
        existing.status = statusMap[realAgent.status] ?? "idle";
        existing.name = realAgent.name || existing.name;
        existing.emoji = realAgent.emoji || existing.emoji;
        existing.color = realAgent.color || existing.color;
        existing.team = realAgent.team || existing.team;
        existing.role = realAgent.role || existing.role;
        if (realAgent.currentTask && existing.status === "working") {
          existing.activity = realAgent.currentTask.slice(0, 40);
        }
        // Update desk position if layout changed
        const desk = _cachedLayout.desks.get(realAgent.id);
        if (desk && (existing.deskX !== desk.x || existing.deskY !== desk.y)) {
          existing.deskX = desk.x;
          existing.deskY = desk.y;
          existing.x = desk.x;
          existing.y = desk.y;
        }
      } else {
        // Compute desk from dynamic layout
        const desk = _cachedLayout.desks.get(realAgent.id) ?? { x: 1 + i * 3, y: 2 };
        _agents.push({
          id: realAgent.id,
          name: realAgent.name || realAgent.id,
          emoji: realAgent.emoji || "🤖",
          color: realAgent.color || "#60a5fa",
          team: realAgent.team || "general",
          role: realAgent.role || "",
          status: statusMap[realAgent.status] ?? "idle",
          activity: realAgent.currentTask?.slice(0, 40) || "",
          thoughtBubble: "",
          thoughtTimer: 0,
          messageTo: null,
          x: desk.x,
          y: desk.y,
          targetX: desk.x,
          targetY: desk.y,
          deskX: desk.x,
          deskY: desk.y,
        });
        _agentsSeededFromBackend = true;
      }
    }
    // Remove agents that no longer exist in backend.
    const backendIds = new Set(props.agents.map((a) => a.id));
    _agents = _agents.filter((a) => backendIds.has(a.id));
  }

  // Ingest real-time logs into animation: recent log entries trigger thought bubbles and canvas bubbles
  if (props.logs && props.logs.size > 0) {
    const recentCutoff = Date.now() - 30_000; // last 30 seconds
    for (const [agentId, entries] of props.logs) {
      const agent = _agents.find((a) => a.id === agentId);
      if (!agent) {
        continue;
      }
      const recent = entries.filter((e) => e.ts > recentCutoff);
      if (recent.length > 0) {
        const latest = recent[recent.length - 1];
        // Update agent activity and status based on task lifecycle events
        for (const e of recent) {
          if (e.type === "system" && e.content.includes("[TASK_ASSIGNED]")) {
            const taskDesc = e.content.replace(/\[TASK_ASSIGNED\]\s*\S+\s*picked up:\s*/, "");
            agent.activity = taskDesc.slice(0, 40);
            agent.status = "working";
          } else if (e.type === "system" && e.content.includes("[TASK_DONE]")) {
            agent.activity = "";
            agent.status = "idle";
          } else if (e.type === "system" && e.content.includes("[TASK_FAILED]")) {
            agent.activity = "";
            agent.status = "crashed";
          }
        }
        // Show latest log as thought bubble if agent doesn't already have one
        if (agent.thoughtTimer <= 0) {
          const text = latest.content.slice(0, 60);
          if (text.length > 5) {
            agent.thoughtBubble = text + (latest.content.length > 60 ? "…" : "");
            agent.thoughtTimer = 200;
          }
        }
        // Create canvas bubbles for output/system entries not already bubbled
        for (const e of recent) {
          const bubbleExists = _canvasBubbles.some((b) => b.id === `be-${e.id}`);
          if (
            !bubbleExists &&
            (e.type === "output" || e.type === "system" || e.type === "thinking")
          ) {
            const shortText = e.content.length > 60 ? e.content.slice(0, 57) + "…" : e.content;
            const color =
              e.type === "output" ? "var(--ok)" : e.type === "system" ? "#60a5fa" : "#a78bfa";
            _canvasBubbles.push({
              id: `be-${e.id}`,
              agentId: e.agentId,
              text: shortText,
              timer: 300,
              color,
            });
            if (_canvasBubbles.length > 8) {
              _canvasBubbles = _canvasBubbles.slice(-8);
            }
          }
        }
      }
    }
  }

  // Inter-agent messages trigger flying message animations
  if (props.messages && props.messages.length > 0) {
    const recentCutoff = Date.now() - 15_000;
    for (const msg of props.messages) {
      if (msg.ts < recentCutoff) {
        continue;
      }
      const alreadyAnimated = _messages.some((m) => m.id === `am-${msg.id}`);
      if (alreadyAnimated) {
        continue;
      }
      const fromAgent = _agents.find((a) => a.id === msg.from);
      const toAgent = _agents.find((a) => a.id === msg.to);
      if (fromAgent && toAgent) {
        const emojiMap: Record<string, string> = {
          task: "📋",
          result: "📤",
          query: "❓",
          notify: "💬",
        };
        _messages.push({
          id: `am-${msg.id}`,
          fromX: fromAgent.x * TILE + TILE / 2,
          fromY: fromAgent.y * TILE + TILE / 2,
          toX: toAgent.x * TILE + TILE / 2,
          toY: toAgent.y * TILE + TILE / 2,
          progress: 0,
          emoji: emojiMap[msg.type] ?? "💬",
          label: msg.content.slice(0, 30) + (msg.content.length > 30 ? "…" : ""),
        });
        // Add active edge between agents
        if (!_activeEdges.some((e) => e.from === msg.from && e.to === msg.to)) {
          _activeEdges.push({ from: msg.from, to: msg.to, timer: 120 });
        }
        // Animate sender as messaging
        if (fromAgent.status !== "crashed") {
          fromAgent.status = "messaging";
          fromAgent.activity = `→ ${toAgent.name}`;
        }
      }
    }
  }

  // Display name: show "orchestrator" for agent id "ceo" so UI is consistent.
  const agentDisplayName = (id: string, name?: string) =>
    id === "ceo" ? "orchestrator" : name || id;

  // Build the display log from real backend logs + any local human-input entries in _execLog.
  // Logs are per-agent on the backend; we merge all agents' logs and sort by time so every
  // agent's returns (orchestrator and subordinates) appear in one chronological stream.
  const typeMap: Record<string, LogEntry["type"]> = {
    message_in: "system",
    message_out: "output",
  };
  const backendEntries: LogEntry[] = [];
  if (props.logs && props.logs.size > 0) {
    for (const entries of props.logs.values()) {
      for (const e of entries) {
        const agent = props.agents?.find((a) => a.id === e.agentId);
        backendEntries.push({
          id: e.id,
          ts: new Date(e.ts).toTimeString().slice(0, 8),
          tsNum: e.ts,
          agent: e.agentId,
          agentDisplayName: agentDisplayName(e.agentId, agent?.name),
          agentEmoji: agent?.emoji ?? "🤖",
          type: e.type in typeMap ? typeMap[e.type] : (e.type as LogEntry["type"]),
          content: e.content,
          tokens: e.tokensUsed,
          duration: e.durationMs,
        });
      }
    }
  }
  // _execLog holds only optimistic/human-action entries (not duplicated by backend).
  const backendIds = new Set(backendEntries.map((e) => e.id));
  const humanEntries = _execLog.filter((e) => !backendIds.has(e.id));
  // Sort by timestamp so order is chronological and final output appears at the bottom.
  const combined = [...backendEntries, ...humanEntries].toSorted(
    (a, b) => (a.tsNum ?? 0) - (b.tsNum ?? 0),
  );
  const displayLog = dedupeDisplayLog(combined).slice(-80);

  const { zones, cols: layoutCols, rows: layoutRows } = _cachedLayout;
  const W = layoutCols * TILE;
  const H = layoutRows * TILE;

  // Filter out noise: [tools]/[warn]/[info], and backend duplicate of human message
  const filteredLog = displayLog.filter((e) => !isNoiseLogEntry(e));
  const latestVisibleLogId = filteredLog.at(-1)?.id ?? "";
  if (latestVisibleLogId && latestVisibleLogId !== _lastVisibleLogId) {
    _lastVisibleLogId = latestVisibleLogId;
    _scrollLogToBottom();
  } else if (!latestVisibleLogId) {
    _lastVisibleLogId = "";
  }

  return html`
    <div class="cd-page cd-page--office"
      @mousemove=${(e: MouseEvent) => {
        if (!_isDragging) {
          return;
        }
        const page = e.currentTarget as HTMLElement;
        const newW = page.getBoundingClientRect().right - e.clientX;
        _panelWidth = Math.max(240, Math.min(800, newW));
      }}
      @mouseup=${() => {
        _isDragging = false;
      }}
      @mouseleave=${() => {
        _isDragging = false;
      }}>

      <!-- ── Main split layout ───────────────────────────────────────── -->
      <div class="cd-office-split">

        <!-- LEFT: animated office canvas -->
        <div class="cd-office-canvas-wrap">
          <div class="cd-office-canvas" style="width:${W}px;height:${H}px">
            <div class="cd-office-floor" style="width:${W}px;height:${H}px">

              ${
                _agents.length === 0
                  ? html`
                      <div class="cd-office-empty-state">
                        <div class="cd-office-empty-state__icon">🏢</div>
                        <div class="cd-office-empty-state__title">No active agents</div>
                        <div class="cd-office-empty-state__sub">
                          Start agents from the Agent Config page or configure them in Company Settings.
                        </div>
                      </div>
                    `
                  : ""
              }

              <!-- Zones (dynamic from real team structure) -->
              ${zones.map(
                (zone) => html`
                <div class="cd-office-zone"
                  style="left:${zone.x * TILE}px;top:${zone.y * TILE}px;width:${zone.w * TILE}px;height:${zone.h * TILE}px;background:${zone.color};border-color:${zone.border}">
                  <span class="cd-office-zone__label">${zone.label}</span>
                </div>
              `,
              )}

              <!-- Desk items (one per agent) -->
              ${_agents.map(
                (a) => html`
                <div class="cd-office-desk-item" style="left:${a.deskX * TILE + TILE / 2 - 10}px;top:${a.deskY * TILE + TILE - 16}px">🖥️</div>
              `,
              )}

              <!-- SVG edge network (dynamic: shows edges for active message animations) -->
              <svg class="cd-office-network" style="width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}">
                ${_activeEdges.map((edge) => {
                  const from = _agents.find((a) => a.id === edge.from);
                  const to = _agents.find((a) => a.id === edge.to);
                  if (!from || !to) {
                    return "";
                  }
                  const x1 = from.x * TILE + TILE / 2;
                  const y1 = from.y * TILE + 20;
                  const x2 = to.x * TILE + TILE / 2;
                  const y2 = to.y * TILE + 20;
                  const cpX = (x1 + x2) / 2;
                  const cpY = Math.min(y1, y2) - Math.max(48, Math.abs(x2 - x1) * 0.18);
                  return html`
                    <g class="cd-office-edge cd-office-edge--active">
                      <path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__hit" fill="none" stroke="transparent" stroke-width="18"/>
                      <path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__line"/>
                      <path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__pulse"/>
                    </g>
                  `;
                })}
                <!-- Static edges: reportTo relationships from real agent data -->
                ${(() => {
                  if (!props.agents) {
                    return "";
                  }
                  const edges: { from: OfficeAgent; to: OfficeAgent }[] = [];
                  for (const ra of props.agents) {
                    if (!ra.reportTo) {
                      continue;
                    }
                    const child = _agents.find((a) => a.id === ra.id);
                    const parent = _agents.find((a) => a.id === ra.reportTo);
                    if (child && parent) {
                      edges.push({ from: parent, to: child });
                    }
                  }
                  return edges.map(({ from, to }) => {
                    const x1 = from.x * TILE + TILE / 2;
                    const y1 = from.y * TILE + TILE - 4;
                    const x2 = to.x * TILE + TILE / 2;
                    const y2 = to.y * TILE + 4;
                    return html`
                      <g class="cd-office-edge">
                        <path d="M ${x1} ${y1} L ${x2} ${y2}" class="cd-office-edge__line"/>
                      </g>
                    `;
                  });
                })()}
              </svg>

              <!-- Edge labels for active flying messages -->
              ${_messages.map((msg) => {
                const t = 0.5;
                const cpX = (msg.fromX + msg.toX) / 2;
                const cpY = Math.min(msg.fromY, msg.toY) - 50;
                const lx = (1 - t) * (1 - t) * msg.fromX + 2 * (1 - t) * t * cpX + t * t * msg.toX;
                const ly =
                  (1 - t) * (1 - t) * msg.fromY + 2 * (1 - t) * t * cpY + t * t * msg.toY - 22;
                return html`
                  <div class="cd-office-edge-label cd-office-edge-label--active"
                    style="left:${lx}px;top:${ly}px">
                    ${msg.label}
                  </div>
                `;
              })}

              <!-- Flying message packets (clawport style) -->
              ${_messages.map((msg) => {
                const t = msg.progress;
                const cpX = (msg.fromX + msg.toX) / 2;
                const cpY = Math.min(msg.fromY, msg.toY) - 50;
                const px = (1 - t) * (1 - t) * msg.fromX + 2 * (1 - t) * t * cpX + t * t * msg.toX;
                const py = (1 - t) * (1 - t) * msg.fromY + 2 * (1 - t) * t * cpY + t * t * msg.toY;
                const opacity = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) / 0.15 : 1;
                return html`
                  <div class="cd-office-packet" style="left:${px}px;top:${py}px;opacity:${opacity}">
                    <span class="cd-office-packet__icon">${msg.emoji}</span>
                    <span class="cd-office-packet__label">${msg.label}</span>
                  </div>
                `;
              })}

              <!-- Canvas output bubbles -->
              ${_canvasBubbles.map((bubble) => {
                const agent = _agents.find((a) => a.id === bubble.agentId);
                if (!agent) {
                  return "";
                }
                const fadeIn = (200 - bubble.timer) / 10;
                const fadeOut = bubble.timer < 40 ? bubble.timer / 40 : 1;
                const opacity = Math.min(fadeIn, fadeOut);
                // Position bubble above the agent, offset to the right to avoid overlap
                const offsetY = -TILE * 1.1;
                return html`
                  <div class="cd-canvas-bubble" style="
                    left:${agent.x * TILE + TILE * 0.6}px;
                    top:${agent.y * TILE + offsetY}px;
                    opacity:${opacity};
                    border-color:${bubble.color}40;
                    box-shadow: 0 0 12px ${bubble.color}30;
                  ">
                    <div class="cd-canvas-bubble__bar" style="background:${bubble.color}"></div>
                    <div class="cd-canvas-bubble__text">${bubble.text}</div>
                  </div>
                `;
              })}

              <!-- Agents -->
              ${_agents.map((agent) => {
                return html`
                  <div class="cd-office-agent ${agent.status === "crashed" ? "cd-office-agent--crashed" : ""} ${agent.status === "messaging" ? "cd-office-agent--messaging" : ""}"
                    style="left:${agent.x * TILE}px;top:${agent.y * TILE}px;--agent-accent:${agent.color}">
                    <span class="cd-office-agent__status-dot" style="background:${
                      agent.status === "working" || agent.status === "thinking"
                        ? "#22c55e"
                        : agent.status === "messaging"
                          ? "#3b82f6"
                          : agent.status === "idle"
                            ? "#f59e0b"
                            : "#ef4444"
                    }"></span>
                    <span class="cd-office-agent__avatar-shell">
                      <img class="cd-office-agent__avatar-img" src="${getAvatarUrlForAgent(agent.id)}" alt="" width="40" height="40" />
                    </span>
                    <span class="cd-office-agent__name-pill">${agent.name}</span>
                    <span class="cd-office-agent__role-text">${agent.team}</span>
                    ${agent.activity ? html`<span class="cd-office-agent__task-pill">📌 ${agent.activity}</span>` : ""}
                    ${agent.thoughtBubble ? html`<div class="cd-office-thought">${agent.thoughtBubble}</div>` : ""}
                    ${
                      agent.status === "crashed"
                        ? html`
                            <div class="cd-office-agent__crash">💥</div>
                          `
                        : ""
                    }
                  </div>
                `;
              })}

            </div>
          </div>

          <!-- Statistics strip -->
          <div class="cd-office-stats-strip">
            ${(() => {
              const working = _agents.filter(
                (a) => a.status === "working" || a.status === "thinking",
              );
              const idle = _agents.filter((a) => a.status === "idle");
              const crashed = _agents.filter((a) => a.status === "crashed");
              const messaging = _agents.filter((a) => a.status === "messaging");
              const total = _agents.length;
              const workingPct = total > 0 ? Math.round((working.length / total) * 100) : 0;
              const idlePct = total > 0 ? Math.round((idle.length / total) * 100) : 0;
              const crashPct = total > 0 ? Math.round((crashed.length / total) * 100) : 0;
              const msgPct = total > 0 ? Math.round((messaging.length / total) * 100) : 0;
              const totalOutputs = filteredLog.filter((e) => e.type === "output").length;
              const totalTools = filteredLog.filter((e) => e.type === "tool_call").length;
              const totalErrors = filteredLog.filter((e) => e.type === "error").length;
              const totalTokens = filteredLog.reduce((sum, e) => sum + (e.tokens ?? 0), 0);
              return html`
                <!-- Fleet: Pause / Resume / Stop all (real task control) -->
                ${
                  _runningCount > 0 || _pausedCount > 0
                    ? html`
                      <div class="cd-fleet-ctrl">
                        ${
                          _runningCount > 0
                            ? html`
                              <button class="cd-fleet-btn cd-fleet-btn--pause" title="Pause all running agents"
                                @click=${() => void _onPauseAll?.()}>
                                ⏸ Pause all (${_runningCount})
                              </button>
                              <button class="cd-fleet-btn cd-fleet-btn--stop" title="Stop (kill) all running agents"
                                @click=${() => void _onStopAll?.()}>
                                ⏹ Stop all (${_runningCount})
                              </button>
                            `
                            : ""
                        }
                        ${
                          _pausedCount > 0
                            ? html`
                              <button class="cd-fleet-btn cd-fleet-btn--resume" title="Resume all paused agents"
                                @click=${() => void _onResumeAll?.()}>
                                ▶ Resume all (${_pausedCount})
                              </button>
                            `
                            : ""
                        }
                      </div>
                    `
                    : ""
                }

                <!-- Agent donut ring -->
                <div class="cd-stat-card cd-stat-card--agents">
                  <div class="cd-stat-ring">
                    <svg viewBox="0 0 36 36" class="cd-stat-ring__svg">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3" opacity="0.2"/>
                      ${(() => {
                        // Multi-segment donut: working (green) → messaging (blue) → idle (amber) → crashed (red)
                        const r = 15.9;
                        const segments: { pct: number; color: string }[] = [];
                        if (workingPct > 0) {
                          segments.push({ pct: workingPct, color: "#22c55e" });
                        }
                        if (msgPct > 0) {
                          segments.push({ pct: msgPct, color: "#60a5fa" });
                        }
                        if (idlePct > 0) {
                          segments.push({ pct: idlePct, color: "#f59e0b" });
                        }
                        if (crashPct > 0) {
                          segments.push({ pct: crashPct, color: "#ef4444" });
                        }
                        let offset = 25; // start from top
                        return segments.map((s) => {
                          const el = html`<circle cx="18" cy="18" r="${r}" fill="none"
                            stroke="${s.color}" stroke-width="3"
                            stroke-dasharray="${s.pct} ${100 - s.pct}"
                            stroke-dashoffset="${offset}" stroke-linecap="round"/>`;
                          offset -= s.pct;
                          return el;
                        });
                      })()}
                    </svg>
                    <span class="cd-stat-ring__value">${total}</span>
                  </div>
                  <div class="cd-stat-card__info">
                    <span class="cd-stat-card__title">Agents</span>
                    <div class="cd-stat-card__dots">
                      ${_agents.map((a) => {
                        const dotColor =
                          a.status === "working" || a.status === "thinking"
                            ? "#22c55e"
                            : a.status === "messaging"
                              ? "#60a5fa"
                              : a.status === "crashed"
                                ? "#ef4444"
                                : "#f59e0b";
                        return html`<span class="cd-stat-agent-dot" style="background:${dotColor}" title="${a.name}: ${a.status}"></span>`;
                      })}
                    </div>
                    <div class="cd-stat-card__badges">
                      ${working.length > 0 ? html`<span class="cd-stat-badge cd-stat-badge--ok">${working.length} active</span>` : ""}
                      ${idle.length > 0 ? html`<span class="cd-stat-badge cd-stat-badge--warn">${idle.length} idle</span>` : ""}
                      ${messaging.length > 0 ? html`<span class="cd-stat-badge cd-stat-badge--info">${messaging.length} msg</span>` : ""}
                      ${crashed.length > 0 ? html`<span class="cd-stat-badge cd-stat-badge--danger">${crashed.length} err</span>` : ""}
                    </div>
                  </div>
                </div>

                <!-- Activity metrics -->
                <div class="cd-stat-card cd-stat-card--metrics">
                  <div class="cd-stat-card__metrics">
                    <div class="cd-stat-metric">
                      <span class="cd-stat-metric__value">${totalOutputs}</span>
                      <span class="cd-stat-metric__label">outputs</span>
                    </div>
                    <div class="cd-stat-metric">
                      <span class="cd-stat-metric__value">${totalTools}</span>
                      <span class="cd-stat-metric__label">tools</span>
                    </div>
                    <div class="cd-stat-metric">
                      <span class="cd-stat-metric__value ${totalErrors > 0 ? "cd-stat-metric__value--danger" : ""}">${totalErrors}</span>
                      <span class="cd-stat-metric__label">errors</span>
                    </div>
                    <div class="cd-stat-metric">
                      <span class="cd-stat-metric__value">${totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + "K" : totalTokens}</span>
                      <span class="cd-stat-metric__label">tokens</span>
                    </div>
                  </div>
                </div>

                <!-- In-flight messages -->
                <div class="cd-stat-card cd-stat-card--msgs">
                  <span class="cd-stat-card__icon ${_messages.length > 0 ? "cd-stat-card__icon--pulse" : ""}">${_messages.length > 0 ? "📡" : "📭"}</span>
                  <div class="cd-stat-card__info">
                    <span class="cd-stat-card__title">${_messages.length} in flight</span>
                    <span class="cd-stat-card__sub">${_canvasBubbles.length} bubbles</span>
                  </div>
                </div>

                <!-- Live feed ticker -->
                <div class="cd-stat-card cd-stat-card--feed">
                  <div class="cd-stat-feed">
                    ${
                      displayLog.length > 0
                        ? html`
                      <div class="cd-stat-feed__line">
                        <span class="cd-stat-feed__dot ${
                          displayLog[displayLog.length - 1].type === "output"
                            ? "cd-stat-feed__dot--ok"
                            : displayLog[displayLog.length - 1].type === "error"
                              ? "cd-stat-feed__dot--danger"
                              : "cd-stat-feed__dot--info"
                        }"></span>
                        <span class="cd-stat-feed__text">${displayLog[displayLog.length - 1].agentEmoji} ${displayLog[displayLog.length - 1].content.slice(0, 50)}${displayLog[displayLog.length - 1].content.length > 50 ? "..." : ""}</span>
                      </div>
                    `
                        : html`
                            <div class="cd-stat-feed__empty">Waiting for activity...</div>
                          `
                    }
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>

        <!-- Resize handle -->
        <div class="cd-office-resize-handle"
          @mousedown=${(e: MouseEvent) => {
            e.preventDefault();
            _isDragging = true;
          }}></div>

        <!-- RIGHT: execution panel ─────────────────────────────────── -->
        <div class="cd-office-panel" style="width:${_panelWidth}px;min-width:${_panelWidth}px">

          <!-- Panel tabs -->
          <div class="cd-office-panel__tabs">
            <button class="cd-office-panel__tab ${_rightTab === "log" ? "cd-office-panel__tab--active" : ""}"
              @click=${() => {
                _rightTab = "log";
              }}>📋 Execution Log</button>
            <button class="cd-office-panel__tab ${_rightTab === "output" ? "cd-office-panel__tab--active" : ""}"
              @click=${() => {
                _rightTab = "output";
              }}>📤 Outputs</button>
          </div>

          <!-- Execution Log tab — newest at bottom, auto-scroll -->
          ${
            _rightTab === "log"
              ? html`
            <div class="cd-log-agent-filter">
              <button class="cd-log-af-btn ${_logAgentFilter === "all" ? "cd-log-af-btn--active" : ""}"
                @click=${() => {
                  _logAgentFilter = "all";
                }}>All</button>
              ${_agents.map(
                (a) => html`
                <button class="cd-log-af-btn ${_logAgentFilter === a.id ? "cd-log-af-btn--active" : ""}"
                  style="${_logAgentFilter === a.id ? `border-color:${a.color};color:${a.color}` : ""}"
                  @click=${() => {
                    _logAgentFilter = _logAgentFilter === a.id ? "all" : a.id;
                  }}>
                  ${a.emoji} ${agentDisplayName(a.id, a.name)}
                </button>
              `,
              )}
            </div>
            <div class="cd-office-log" id="cd-exec-log">
              ${
                filteredLog.length === 0
                  ? html`
                      <div class="cd-office-empty">No logs yet — send a message below to start.</div>
                    `
                  : filteredLog
                      .filter((e) => _logAgentFilter === "all" || e.agent === _logAgentFilter)
                      .map((entry) => {
                        const isFinalOutput = entry.type === "output" && entry.content.length > 100;
                        return html`
                <div class="cd-log-entry ${logTypeClass(entry.type)} ${isFinalOutput ? "cd-log-entry--final" : ""}">
                  <div class="cd-log-entry__header">
                    <span class="cd-log-entry__icon">${logTypeIcon(entry.type, entry.content)}</span>
                    <span class="cd-log-entry__agent">${entry.agentEmoji} ${entry.agentDisplayName ?? entry.agent}</span>
                    ${
                      isFinalOutput
                        ? html`
                            <span class="cd-log-entry__final-badge">Final Output</span>
                          `
                        : ""
                    }
                    <span class="cd-log-entry__ts">${entry.ts}</span>
                    ${entry.tokens ? html`<span class="cd-log-entry__tokens">${(entry.tokens / 1000).toFixed(1)}K tk</span>` : ""}
                    <button class="cd-log-entry__copy" title="Copy" @click=${(e: Event) => {
                      e.stopPropagation();
                      void navigator.clipboard?.writeText(entry.content).then(() => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.textContent = "✓";
                        setTimeout(() => {
                          btn.textContent = "📋";
                        }, 1200);
                      });
                    }}>📋</button>
                  </div>
                  <div class="cd-log-entry__content ${entry.type === "output" ? "cd-log-entry__content--md" : ""}">${
                    entry.type === "output" ||
                    (entry.type === "system" && entry.content.length > 200)
                      ? unsafeHTML(
                          toSanitizedMarkdownHtml(formatExecutionLogContent(entry.content)),
                        )
                      : entry.content
                  }</div>
                </div>
              `;
                      })
              }
            </div>
          `
              : ""
          }

          <!-- Outputs tab -->
          ${
            _rightTab === "output"
              ? html`
            <div class="cd-office-outputs">
              ${filteredLog
                .filter((e) => e.type === "output")
                .map((entry) => {
                  const isExpanded = _expandedOutputIds.has(entry.id);
                  const isLong = entry.content.length > 120;
                  return html`
                <div class="cd-output-card ${isExpanded ? "cd-output-card--expanded" : ""}">
                  <div class="cd-output-card__header" @click=${() => {
                    if (isExpanded) {
                      _expandedOutputIds.delete(entry.id);
                    } else {
                      _expandedOutputIds.add(entry.id);
                    }
                    _expandedOutputIds = new Set(_expandedOutputIds);
                  }}>
                    <span class="cd-output-card__toggle">${isExpanded ? "▼" : "▶"}</span>
                    <span>${entry.agentEmoji} ${entry.agent}</span>
                    <span class="cd-output-card__preview">${!isExpanded ? entry.content.slice(0, 60) + (entry.content.length > 60 ? "..." : "") : ""}</span>
                    <span class="cd-output-card__ts">${entry.ts}</span>
                    ${entry.tokens ? html`<span class="cd-log-entry__tokens">${(entry.tokens / 1000).toFixed(1)}K tk</span>` : ""}
                  </div>
                  ${
                    isExpanded
                      ? html`
                    <div class="cd-output-card__content cd-log-entry__content--md">${unsafeHTML(toSanitizedMarkdownHtml(formatExecutionLogContent(entry.content)))}</div>
                    <div class="cd-output-card__actions">
                      <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
                        void navigator.clipboard?.writeText(entry.content);
                      }}>📋 Copy</button>
                      ${isLong ? html`<span class="cd-output-card__len">${entry.content.length} chars</span>` : ""}
                    </div>
                  `
                      : ""
                  }
                </div>
              `;
                })}
              ${
                filteredLog.filter((e) => e.type === "output").length === 0
                  ? html`
                      <div class="cd-office-empty">No outputs yet — agents are working...</div>
                    `
                  : ""
              }
            </div>
          `
              : ""
          }
        </div>
      </div>

      <!-- ── Talk to Company (below the split) ─────────────────────── -->
      <div class="cd-office-chat-bar">
        <div class="cd-office-chat-bar__input-wrap">
          <textarea class="cd-office-chat-bar__input" rows="1"
            placeholder="Message the Agent Orchestrator… (Enter to send, Shift+Enter for newline)"
            .value=${_humanInput}
            @input=${(e: Event) => {
              _humanInput = (e.target as HTMLTextAreaElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const msg = _humanInput.trim();
                if (!msg) {
                  return;
                }
                _sendToCompany(msg);
                _humanInput = "";
                (e.target as HTMLTextAreaElement).value = "";
              }
            }}></textarea>
          <button class="cd-btn cd-btn--primary cd-office-chat-bar__send" @click=${(e: Event) => {
            const wrap = (e.target as HTMLElement).closest(".cd-office-chat-bar__input-wrap");
            const textarea = wrap?.querySelector("textarea") as HTMLTextAreaElement | null;
            const msg = textarea?.value.trim() ?? _humanInput.trim();
            if (!msg) {
              return;
            }
            _sendToCompany(msg);
            _humanInput = "";
            if (textarea) {
              textarea.value = "";
            }
          }}>Send</button>
        </div>
      </div>
    </div>
  `;
}
