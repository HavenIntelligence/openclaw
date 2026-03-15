import { html } from "lit";
import type { ClawDockAgent, LogEntry as RealLogEntry } from "../company-types.ts";

// ── Types ────────────────────────────────────────────────────────────────────
type AgentLifecycle = "persistent" | "ephemeral" | "contract";
type EventKind =
  | "spawn"
  | "start"
  | "pause"
  | "resume"
  | "split"
  | "merge"
  | "backtrack"
  | "error"
  | "handoff"
  | "archive";

type TimelineAgent = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  lifecycle: AgentLifecycle;
  color: string;
  workspace?: string;
};

type LifecycleEvent = {
  id: string;
  agentId: string;
  timestamp: number;
  type: EventKind;
  targetId?: string;
  details?: string;
};

type ActivityWindow = {
  id: string;
  agentId: string;
  startTime: number;
  endTime: number | null;
};

type LineageEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "split" | "merge" | "backtrack" | "handoff";
  timestamp: number;
};

type Annotation = {
  id: string;
  timestamp: number;
  agentId?: string;
  type: "bottleneck" | "decision" | "dispatch" | "insight";
  title: string;
  description: string;
  placement?: "top" | "bottom";
};

// ── Constants ────────────────────────────────────────────────────────────────
const LANE_HEIGHT = 64;
const PADDING_TOP = 16;
const TIMELINE_PAD = 16;
const MAX_TIME = 180;

// ── Demo Data ────────────────────────────────────────────────────────────────
const AGENTS: TimelineAgent[] = [
  {
    id: "ai-director",
    name: "AI Director",
    emoji: "🧑‍💻",
    role: "CEO",
    lifecycle: "persistent",
    color: "#ff5c5c",
    workspace: "strategy",
  },
  {
    id: "ops-prime",
    name: "Ops Prime",
    emoji: "🧑‍💼",
    role: "COO",
    lifecycle: "persistent",
    color: "#60a5fa",
    workspace: "operations",
  },
  {
    id: "content-director",
    name: "CMO",
    emoji: "👩‍🎨",
    role: "Content Director",
    lifecycle: "persistent",
    color: "#fb923c",
    workspace: "content",
  },
  {
    id: "research-alpha",
    name: "Researcher",
    emoji: "🔍",
    role: "Research Analyst",
    lifecycle: "ephemeral",
    color: "#f97316",
  },
  {
    id: "writing-beta",
    name: "Writer",
    emoji: "✍️",
    role: "Content Writer",
    lifecycle: "ephemeral",
    color: "#fbbf24",
  },
  {
    id: "review-gamma",
    name: "Reviewer",
    emoji: "🧐",
    role: "QA Reviewer",
    lifecycle: "contract",
    color: "#ef4444",
  },
  {
    id: "code-agent",
    name: "Code Agent",
    emoji: "👨‍💻",
    role: "Software Engineer",
    lifecycle: "persistent",
    color: "#22c55e",
    workspace: "engineering",
  },
  {
    id: "test-runner",
    name: "Test Runner",
    emoji: "🧪",
    role: "QA Engineer",
    lifecycle: "ephemeral",
    color: "#a78bfa",
  },
  {
    id: "nanoclaw",
    name: "NanoClaw",
    emoji: "🤖",
    role: "Executive Assistant",
    lifecycle: "persistent",
    color: "#14b8a6",
    workspace: "executive",
  },
];

const EVENTS: LifecycleEvent[] = [
  { id: "e1", agentId: "ai-director", timestamp: 0, type: "spawn" },
  { id: "e2", agentId: "ai-director", timestamp: 2, type: "start" },
  { id: "e3", agentId: "ops-prime", timestamp: 5, type: "spawn" },
  { id: "e4", agentId: "ops-prime", timestamp: 7, type: "start" },
  { id: "e5", agentId: "content-director", timestamp: 10, type: "spawn" },
  { id: "e6", agentId: "content-director", timestamp: 12, type: "start" },
  {
    id: "e7",
    agentId: "ai-director",
    timestamp: 20,
    type: "split",
    targetId: "research-alpha",
    details: "Delegated competitor analysis",
  },
  { id: "e8", agentId: "research-alpha", timestamp: 20, type: "spawn" },
  { id: "e9", agentId: "research-alpha", timestamp: 22, type: "start" },
  {
    id: "e10",
    agentId: "content-director",
    timestamp: 30,
    type: "split",
    targetId: "writing-beta",
    details: "Assigned blog post",
  },
  { id: "e11", agentId: "writing-beta", timestamp: 30, type: "spawn" },
  { id: "e12", agentId: "writing-beta", timestamp: 32, type: "start" },
  {
    id: "e13",
    agentId: "research-alpha",
    timestamp: 50,
    type: "handoff",
    targetId: "writing-beta",
    details: "Delivered research data",
  },
  { id: "e14", agentId: "code-agent", timestamp: 15, type: "spawn" },
  { id: "e15", agentId: "code-agent", timestamp: 17, type: "start" },
  { id: "e16", agentId: "test-runner", timestamp: 40, type: "spawn" },
  { id: "e17", agentId: "test-runner", timestamp: 42, type: "start" },
  {
    id: "e18",
    agentId: "code-agent",
    timestamp: 55,
    type: "handoff",
    targetId: "test-runner",
    details: "PR ready for testing",
  },
  { id: "e19", agentId: "review-gamma", timestamp: 60, type: "spawn" },
  { id: "e20", agentId: "review-gamma", timestamp: 62, type: "start" },
  {
    id: "e21",
    agentId: "writing-beta",
    timestamp: 70,
    type: "handoff",
    targetId: "review-gamma",
    details: "Draft submitted for review",
  },
  {
    id: "e22",
    agentId: "review-gamma",
    timestamp: 90,
    type: "error",
    details: "Context window exceeded 128K limit",
  },
  {
    id: "e23",
    agentId: "review-gamma",
    timestamp: 95,
    type: "backtrack",
    details: "Rolling back to last checkpoint",
  },
  { id: "e24", agentId: "review-gamma", timestamp: 100, type: "resume" },
  { id: "e25", agentId: "nanoclaw", timestamp: 8, type: "spawn" },
  { id: "e26", agentId: "nanoclaw", timestamp: 10, type: "start" },
  {
    id: "e27",
    agentId: "nanoclaw",
    timestamp: 80,
    type: "pause",
    details: "Awaiting human feedback",
  },
  { id: "e28", agentId: "nanoclaw", timestamp: 110, type: "resume" },
  { id: "e29", agentId: "test-runner", timestamp: 75, type: "pause", details: "Waiting for CI" },
  { id: "e30", agentId: "test-runner", timestamp: 85, type: "resume" },
  {
    id: "e31",
    agentId: "research-alpha",
    timestamp: 65,
    type: "archive",
    details: "Task complete",
  },
  {
    id: "e32",
    agentId: "ops-prime",
    timestamp: 120,
    type: "merge",
    targetId: "nanoclaw",
    details: "Merged assistant context",
  },
];

const ANNOTATIONS: Annotation[] = [
  {
    id: "ann-1",
    timestamp: 20,
    agentId: "ai-director",
    type: "dispatch",
    title: "Parallel Dispatch",
    description: "Root agent delegates competitor analysis and engineering tasks concurrently.",
  },
  {
    id: "ann-2",
    timestamp: 55,
    agentId: "code-agent",
    type: "bottleneck",
    title: "Handoff Delay",
    description: "PR handoff to test-runner created a pipeline bottleneck.",
    placement: "bottom",
  },
  {
    id: "ann-3",
    timestamp: 90,
    agentId: "review-gamma",
    type: "decision",
    title: "Error Recovery",
    description: "Context window exceeded 128K. Agent triggered backtrack to last checkpoint.",
  },
  {
    id: "ann-4",
    timestamp: 80,
    agentId: "nanoclaw",
    type: "insight",
    title: "Human-in-Loop",
    description: "Agent paused awaiting human feedback on executive summary.",
  },
  {
    id: "ann-5",
    timestamp: 120,
    agentId: "ops-prime",
    type: "dispatch",
    title: "Context Merge",
    description: "Ops merged assistant context from NanoClaw into operations workspace.",
  },
];

// ── Active data (overridden from real backend when available) ────────────────
let _activeAgents: TimelineAgent[] = AGENTS;
let _activeEvents: LifecycleEvent[] = EVENTS;

// ── State ────────────────────────────────────────────────────────────────────
let _currentTime = 0;
let _isPlaying = true;
let _speed = 1;
let _timeScale = 8;
let _hoveredAgentId: string | null = null;
let _selectedAgentId: string | null = null;
let _hoveredEventId: string | null = null;
let _selectedActivityId: string | null = null;
let _showAnnotations = true;
let _hoveredAnnotation: string | null = null;
let _playInterval: ReturnType<typeof setInterval> | null = null;

// ── Playback ─────────────────────────────────────────────────────────────────
function startPlayback(requestRender: () => void) {
  if (_playInterval) {
    return;
  }
  _playInterval = setInterval(() => {
    if (!_isPlaying) {
      return;
    }
    _currentTime = Math.min(_currentTime + 0.5 * _speed, MAX_TIME);
    if (_currentTime >= MAX_TIME) {
      _isPlaying = false;
    }
    requestRender();
  }, 50);
}

function stopPlayback() {
  if (_playInterval) {
    clearInterval(_playInterval);
    _playInterval = null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAgentY(agentId: string): number {
  const index = _activeAgents.findIndex((a) => a.id === agentId);
  return PADDING_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
}

function getX(timestamp: number): number {
  return TIMELINE_PAD + timestamp * _timeScale;
}

function agentStatus(agentId: string, time: number): string {
  const agentEvents = _activeEvents
    .filter((e) => e.agentId === agentId && e.timestamp <= time)
    .toSorted((a, b) => b.timestamp - a.timestamp);
  const last = agentEvents[0];
  if (!last) {
    return "inactive";
  }
  if (["start", "resume", "split", "handoff", "merge"].includes(last.type)) {
    return "running";
  }
  if (last.type === "pause") {
    return "paused";
  }
  if (last.type === "error") {
    return "error";
  }
  if (last.type === "archive") {
    return "archived";
  }
  return "spawned";
}

function statusDotColor(status: string): string {
  if (status === "running") {
    return "#22c55e";
  }
  if (status === "paused") {
    return "#f59e0b";
  }
  if (status === "error") {
    return "#ef4444";
  }
  if (status === "archived") {
    return "#94a3b8";
  }
  return "#6b7280";
}

function eventIcon(type: EventKind): string {
  const map: Record<EventKind, string> = {
    spawn: "●",
    start: "▶",
    pause: "⏸",
    resume: "▶",
    split: "⑂",
    merge: "⊕",
    backtrack: "↩",
    error: "✕",
    handoff: "⇋",
    archive: "▣",
  };
  return map[type] ?? "•";
}

function eventColor(type: EventKind): string {
  const map: Record<EventKind, string> = {
    spawn: "#22c55e",
    start: "#22c55e",
    pause: "#f59e0b",
    resume: "#22c55e",
    split: "#a78bfa",
    merge: "#60a5fa",
    backtrack: "#60a5fa",
    error: "#ef4444",
    handoff: "#3b82f6",
    archive: "#94a3b8",
  };
  return map[type] ?? "#94a3b8";
}

function annotationIcon(type: Annotation["type"]): string {
  if (type === "bottleneck") {
    return "⚠";
  }
  if (type === "decision") {
    return "◆";
  }
  if (type === "dispatch") {
    return "⚡";
  }
  return "✦";
}

function annotationColor(type: Annotation["type"]): {
  fg: string;
  border: string;
  bg: string;
} {
  if (type === "bottleneck") {
    return {
      fg: "#fb7185",
      border: "rgba(244,63,94,0.5)",
      bg: "rgba(244,63,94,0.2)",
    };
  }
  if (type === "decision") {
    return {
      fg: "#fbbf24",
      border: "rgba(245,158,11,0.5)",
      bg: "rgba(245,158,11,0.2)",
    };
  }
  if (type === "dispatch") {
    return {
      fg: "#34d399",
      border: "rgba(16,185,129,0.5)",
      bg: "rgba(16,185,129,0.2)",
    };
  }
  return {
    fg: "#a78bfa",
    border: "rgba(129,140,248,0.5)",
    bg: "rgba(129,140,248,0.2)",
  };
}

// ── Derivation ───────────────────────────────────────────────────────────────
function deriveActivityWindows(
  agents: TimelineAgent[],
  events: LifecycleEvent[],
  currentTime: number,
): ActivityWindow[] {
  const windows: ActivityWindow[] = [];
  for (const agent of agents) {
    const agentEvents = events
      .filter((e) => e.agentId === agent.id && e.timestamp <= currentTime)
      .toSorted((a, b) => a.timestamp - b.timestamp);
    let windowStart: number | null = null;
    let windowId = 0;
    for (const ev of agentEvents) {
      if (ev.type === "start" || ev.type === "resume") {
        if (windowStart === null) {
          windowStart = ev.timestamp;
        }
      } else if (ev.type === "pause" || ev.type === "error" || ev.type === "archive") {
        if (windowStart !== null) {
          windows.push({
            id: `${agent.id}-w${windowId++}`,
            agentId: agent.id,
            startTime: windowStart,
            endTime: ev.timestamp,
          });
          windowStart = null;
        }
      }
    }
    if (windowStart !== null) {
      windows.push({
        id: `${agent.id}-w${windowId++}`,
        agentId: agent.id,
        startTime: windowStart,
        endTime: null,
      });
    }
  }
  return windows;
}

function deriveLineageEdges(events: LifecycleEvent[]): LineageEdge[] {
  const edges: LineageEdge[] = [];
  for (const ev of events) {
    if (
      (ev.type === "split" ||
        ev.type === "merge" ||
        ev.type === "handoff" ||
        ev.type === "backtrack") &&
      ev.targetId
    ) {
      edges.push({
        id: `le-${ev.id}`,
        sourceId: ev.agentId,
        targetId: ev.targetId,
        type: ev.type,
        timestamp: ev.timestamp,
      });
    }
  }
  return edges;
}

function windowForAgentAtTime(
  agentId: string,
  timestamp: number,
  isSource: boolean,
  windows: ActivityWindow[],
): ActivityWindow | null {
  const exact = windows.find(
    (w) =>
      w.agentId === agentId &&
      w.startTime <= timestamp &&
      (w.endTime === null || w.endTime >= timestamp),
  );
  if (exact) {
    return exact;
  }
  if (isSource) {
    const past = windows.filter((w) => w.agentId === agentId && w.startTime <= timestamp);
    return past.length > 0 ? past.reduce((a, b) => (a.startTime > b.startTime ? a : b)) : null;
  }
  const future = windows.filter((w) => w.agentId === agentId && w.startTime >= timestamp);
  return future.length > 0 ? future.reduce((a, b) => (a.startTime < b.startTime ? a : b)) : null;
}

function connectedWindowIds(
  startId: string,
  windows: ActivityWindow[],
  edges: LineageEdge[],
): Set<string> {
  const set = new Set<string>([startId]);
  for (const edge of edges) {
    const src = windowForAgentAtTime(edge.sourceId, edge.timestamp, true, windows);
    const tgt = windowForAgentAtTime(edge.targetId, edge.timestamp, false, windows);
    if (src?.id === startId && tgt) {
      set.add(tgt.id);
    }
    if (tgt?.id === startId && src) {
      set.add(src.id);
    }
  }
  return set;
}

// ── Scroll sync ──────────────────────────────────────────────────────────────
function syncScroll(e: Event): void {
  const canvas = e.target as HTMLElement;
  const body = canvas.closest(".cd-monitor-body");
  if (!body) {
    return;
  }
  const left = body.querySelector(".cd-monitor-left-scroll");
  if (left) {
    left.scrollTop = canvas.scrollTop;
  }
  const axis = body.querySelector(".cd-monitor-axis-row");
  if (axis) {
    axis.scrollLeft = canvas.scrollLeft;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
export function renderCompanyMonitor(deps: {
  requestRender?: () => void;
  agents?: ClawDockAgent[];
  logs?: Map<string, RealLogEntry[]>;
}) {
  const rr = deps.requestRender ?? (() => {});

  // Map real agents to TimelineAgent format when available
  if (deps.agents && deps.agents.length > 0) {
    _activeAgents = deps.agents.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      role: a.role,
      lifecycle: "persistent" as AgentLifecycle,
      color: a.color,
      workspace: a.currentTask ? `Working: ${a.currentTask.slice(0, 40)}` : undefined,
    }));
  } else {
    _activeAgents = AGENTS;
  }

  // Derive lifecycle events from real log entries when available
  if (deps.logs && deps.logs.size > 0) {
    const now = Date.now();
    const baseTs = now - MAX_TIME * 1000; // treat MAX_TIME as seconds window
    const realEvents: LifecycleEvent[] = [];
    let evtIdx = 0;
    for (const [agentId, entries] of deps.logs) {
      for (const e of entries) {
        const kind: EventKind | null =
          e.type === "system"
            ? "start"
            : e.type === "error"
              ? "error"
              : e.type === "output"
                ? "start"
                : null;
        if (!kind) {
          continue;
        }
        realEvents.push({
          id: `real-${evtIdx++}`,
          agentId,
          timestamp: Math.max(0, Math.min(MAX_TIME, (e.ts - baseTs) / 1000)),
          type: kind,
          details: e.content.slice(0, 80),
        });
      }
    }
    if (realEvents.length > 0) {
      _activeEvents = realEvents;
    } else {
      _activeEvents = EVENTS;
    }
  } else {
    _activeEvents = EVENTS;
  }

  if (_isPlaying && !_playInterval) {
    startPlayback(rr);
  }

  const windows = deriveActivityWindows(_activeAgents, _activeEvents, _currentTime);
  const edges = deriveLineageEdges(_activeEvents.filter((e) => e.timestamp <= _currentTime));
  const tlWidth = MAX_TIME * _timeScale + TIMELINE_PAD * 2 + 20;
  const tlHeight = PADDING_TOP + _activeAgents.length * LANE_HEIGHT + 24;

  const highlightSet = new Set<string>();
  const focusId = _hoveredAgentId || _selectedAgentId;
  if (focusId) {
    highlightSet.add(focusId);
    for (const e of edges) {
      if (e.sourceId === focusId) {
        highlightSet.add(e.targetId);
      }
      if (e.targetId === focusId) {
        highlightSet.add(e.sourceId);
      }
    }
  }
  const hasHL = highlightSet.size > 0;

  const connWins = _selectedActivityId
    ? connectedWindowIds(_selectedActivityId, windows, edges)
    : new Set<string>();

  const runningCount = _activeAgents.filter(
    (a) => agentStatus(a.id, _currentTime) === "running",
  ).length;
  const errorCount = _activeAgents.filter(
    (a) => agentStatus(a.id, _currentTime) === "error",
  ).length;
  const pausedCount = _activeAgents.filter(
    (a) => agentStatus(a.id, _currentTime) === "paused",
  ).length;

  return html`
    <div class="cd-monitor-page">
      <!-- ═══ Top bar ═══ -->
      <div class="cd-monitor-topbar">
        <div class="cd-monitor-topbar__left">
          <span class="cd-monitor-eyebrow">Agent Timeline Monitor</span>
          <span class="cd-monitor-counts">
            ${runningCount} running · ${errorCount} errors · ${pausedCount}
            paused
          </span>
        </div>
        <div class="cd-monitor-controls">
          <button
            class="cd-monitor-btn cd-monitor-btn--primary"
            @click=${() => {
              if (_currentTime >= MAX_TIME) {
                _currentTime = 0;
              }
              _isPlaying = !_isPlaying;
              if (_isPlaying) {
                startPlayback(rr);
              }
              rr();
            }}
          >
            ${_isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            class="cd-monitor-btn"
            @click=${() => {
              _isPlaying = false;
              _currentTime = MAX_TIME;
              rr();
            }}
            title="Skip to End"
          >
            ⏭ End
          </button>
          <button
            class="cd-monitor-btn"
            @click=${() => {
              _currentTime = 0;
              _isPlaying = true;
              stopPlayback();
              startPlayback(rr);
              rr();
            }}
          >
            ↻ Replay
          </button>
          <span class="cd-monitor-sep"></span>
          ${[1, 2, 4].map(
            (s) => html`
              <button
                class="cd-monitor-btn ${_speed === s ? "cd-monitor-btn--active" : ""}"
                @click=${() => {
                  _speed = s;
                  rr();
                }}
              >
                ${s}x
              </button>
            `,
          )}
          <span class="cd-monitor-sep"></span>
          <button
            class="cd-monitor-btn ${_showAnnotations ? "cd-monitor-btn--insights-on" : ""}"
            @click=${() => {
              _showAnnotations = !_showAnnotations;
              rr();
            }}
            title="Toggle AI Insights"
          >
            ✦ Insights
          </button>
          <span class="cd-monitor-sep"></span>
          <button
            class="cd-monitor-btn cd-monitor-btn--sm"
            @click=${() => {
              _timeScale = Math.max(2, _timeScale - 2);
              rr();
            }}
            title="Zoom Out"
          >
            −
          </button>
          <span class="cd-monitor-zoom-label">${_timeScale}x</span>
          <button
            class="cd-monitor-btn cd-monitor-btn--sm"
            @click=${() => {
              _timeScale = Math.min(32, _timeScale + 2);
              rr();
            }}
            title="Zoom In"
          >
            +
          </button>
          <span class="cd-monitor-time">T = ${Math.floor(_currentTime)}</span>
        </div>
      </div>

      <!-- ═══ Scrubber ═══ -->
      <div class="cd-monitor-slider-row">
        <input
          type="range"
          class="cd-monitor-slider"
          min="0"
          max="${MAX_TIME}"
          step="1"
          .value=${String(Math.floor(_currentTime))}
          @input=${(e: Event) => {
            _currentTime = Number((e.target as HTMLInputElement).value);
            rr();
          }}
        />
      </div>

      <!-- ═══ Body: left panel + right timeline ═══ -->
      <div class="cd-monitor-body">
        <!-- Left panel: agent lane headers -->
        <div
          class="cd-monitor-left"
          @click=${() => {
            _selectedAgentId = null;
            _selectedActivityId = null;
            rr();
          }}
        >
          <div class="cd-monitor-left-corner"></div>
          <div class="cd-monitor-left-scroll">
            <div style="padding-top:${PADDING_TOP}px;min-height:${tlHeight}px">
              ${_activeAgents.map((agent) => {
                const status = agentStatus(agent.id, _currentTime);
                const isSelected = _selectedAgentId === agent.id;
                const isHovered = _hoveredAgentId === agent.id && !isSelected;
                return html`
                  <div
                    class="cd-monitor-lane-header ${
                      isSelected ? "cd-monitor-lane-header--selected" : ""
                    } ${isHovered ? "cd-monitor-lane-header--hovered" : ""}"
                    style="height:${LANE_HEIGHT}px"
                    @click=${(ev: Event) => {
                      ev.stopPropagation();
                      _selectedAgentId = _selectedAgentId === agent.id ? null : agent.id;
                      _selectedActivityId = null;
                      rr();
                    }}
                    @mouseenter=${() => {
                      _hoveredAgentId = agent.id;
                      rr();
                    }}
                    @mouseleave=${() => {
                      _hoveredAgentId = null;
                      rr();
                    }}
                  >
                    <div class="cd-monitor-lane-header__info">
                      <div class="cd-monitor-lane-header__row">
                        <span class="cd-monitor-lane-header__name"
                          >${agent.emoji} ${agent.name}</span
                        >
                        ${
                          agent.workspace
                            ? html`<span class="cd-monitor-lane-workspace"
                              >${agent.workspace}</span
                            >`
                            : ""
                        }
                      </div>
                      <div class="cd-monitor-lane-header__row">
                        <span class="cd-monitor-lane-header__role"
                          >${agent.role}</span
                        >
                        <span
                          class="cd-monitor-lane-lifecycle cd-monitor-lane-lifecycle--${agent.lifecycle}"
                          >${agent.lifecycle.toUpperCase()}</span
                        >
                      </div>
                    </div>
                    <div
                      class="cd-monitor-lane-status-dot ${
                        status === "running" ? "cd-monitor-lane-status-dot--running" : ""
                      }"
                      style="background:${statusDotColor(status)}"
                    ></div>
                  </div>
                `;
              })}
            </div>
          </div>
        </div>

        <!-- Right: time axis + scrollable timeline -->
        <div class="cd-monitor-right">
          <!-- Time axis (clickable) -->
          <div
            class="cd-monitor-axis-row"
            @click=${(e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement;
              const rect = el.getBoundingClientRect();
              const x = e.clientX - rect.left + el.scrollLeft - TIMELINE_PAD;
              const t = Math.max(0, Math.min(MAX_TIME, Math.round(x / _timeScale)));
              _isPlaying = false;
              _currentTime = t;
              rr();
            }}
          >
            <div
              class="cd-monitor-axis-inner"
              style="width:${tlWidth}px;position:relative;height:100%"
            >
              ${Array.from({ length: Math.floor(MAX_TIME / 10) + 1 }, (_, i) => i * 10).map(
                (t) => html`
                  <div
                    class="cd-monitor-axis-tick"
                    style="left:${getX(t)}px"
                  >
                    <span class="cd-monitor-axis-tick__label">${t}</span>
                    <div class="cd-monitor-axis-tick__mark"></div>
                  </div>
                `,
              )}
              <div
                class="cd-monitor-axis-cursor"
                style="left:${getX(_currentTime)}px"
              >
                <span class="cd-monitor-axis-cursor__val"
                  >${Math.floor(_currentTime)}</span
                >
              </div>
            </div>
          </div>

          <!-- Scrollable timeline canvas -->
          <div
            class="cd-monitor-canvas"
            @scroll=${syncScroll}
            @click=${() => {
              _selectedAgentId = null;
              _selectedActivityId = null;
              rr();
            }}
          >
            <div
              style="position:relative;width:${tlWidth}px;height:${tlHeight}px"
            >
              <!-- Background grid -->
              <div
                style="position:absolute;inset:0;pointer-events:none;background-size:${
                  _timeScale * 10
                }px ${LANE_HEIGHT}px;background-position:${TIMELINE_PAD}px ${PADDING_TOP}px;background-image:linear-gradient(to right,rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.025) 1px,transparent 1px)"
              ></div>

              <!-- SVG: lineage edges -->
              <svg
                style="position:absolute;inset:0;overflow:visible;pointer-events:none"
                width="${tlWidth}"
                height="${tlHeight}"
              >
                ${edges.map((edge) => {
                  const y1 = getAgentY(edge.sourceId);
                  const y2 = getAgentY(edge.targetId);
                  const x = getX(edge.timestamp);
                  const isEdgeHL = hasHL
                    ? highlightSet.has(edge.sourceId) && highlightSet.has(edge.targetId)
                    : true;
                  let opacity = hasHL ? (isEdgeHL ? 0.9 : 0.12) : 0.45;
                  let sw = isEdgeHL ? 2 : 1;
                  if (_selectedActivityId) {
                    const srcW = windowForAgentAtTime(edge.sourceId, edge.timestamp, true, windows);
                    const tgtW = windowForAgentAtTime(
                      edge.targetId,
                      edge.timestamp,
                      false,
                      windows,
                    );
                    const conn =
                      srcW?.id === _selectedActivityId || tgtW?.id === _selectedActivityId;
                    opacity = conn ? 1 : 0.1;
                    sw = conn ? 2 : 1;
                  }
                  const sc =
                    edge.type === "handoff"
                      ? "#3b82f6"
                      : edge.type === "split"
                        ? "#a78bfa"
                        : edge.type === "merge"
                          ? "#60a5fa"
                          : "#94a3b8";
                  const down = y2 > y1;
                  let pathD = `M ${x} ${y1}`;
                  let arrow = "";
                  if (down) {
                    pathD += ` L ${x} ${y2 - 6}`;
                    arrow = `${x - 4},${y2 - 6} ${x + 4},${y2 - 6} ${x},${y2}`;
                  } else {
                    pathD += ` L ${x} ${y2 + 6}`;
                    arrow = `${x - 4},${y2 + 6} ${x + 4},${y2 + 6} ${x},${y2}`;
                  }
                  return html`
                    <g
                      style="opacity:${opacity};transition:opacity .2s ease"
                    >
                      <path
                        d="${pathD}"
                        stroke="${sc}"
                        stroke-width="${sw}"
                        fill="none"
                        stroke-dasharray="${edge.type === "handoff" ? "4 4" : "none"}"
                      />
                      <circle cx="${x}" cy="${y1}" r="3" fill="${sc}" />
                      ${arrow ? html`<polygon points="${arrow}" fill="${sc}" />` : ""}
                    </g>
                  `;
                })}
              </svg>

              <!-- Activity windows -->
              ${windows.map((w) => {
                const agent = _activeAgents.find((a) => a.id === w.agentId);
                if (!agent) {
                  return "";
                }
                const y = getAgentY(w.agentId) - 10;
                const x = getX(w.startTime);
                const endT = w.endTime !== null ? w.endTime : _currentTime;
                const width = Math.max((endT - w.startTime) * _timeScale, 4);
                const lc = agent.lifecycle;
                const bg =
                  lc === "persistent"
                    ? "rgba(34,197,94,0.18)"
                    : lc === "ephemeral"
                      ? "rgba(245,158,11,0.18)"
                      : "rgba(129,140,248,0.18)";
                const border =
                  lc === "persistent"
                    ? "rgba(34,197,94,0.5)"
                    : lc === "ephemeral"
                      ? "rgba(245,158,11,0.5)"
                      : "rgba(129,140,248,0.5)";
                let opacity = 1;
                if (_selectedActivityId) {
                  opacity = connWins.has(w.id) ? 1 : 0.1;
                } else if (hasHL) {
                  opacity = highlightSet.has(w.agentId) ? 1 : 0.2;
                }
                const isSel = _selectedActivityId === w.id;
                return html`
                  <div
                    class="cd-monitor-window ${isSel ? "cd-monitor-window--selected" : ""}"
                    style="left:${x}px;top:${y}px;width:${width}px;background:${bg};border-color:${border};opacity:${opacity}"
                    @mouseenter=${() => {
                      if (!_selectedActivityId) {
                        _hoveredAgentId = w.agentId;
                        rr();
                      }
                    }}
                    @mouseleave=${() => {
                      if (!_selectedActivityId) {
                        _hoveredAgentId = null;
                        rr();
                      }
                    }}
                    @click=${(ev: Event) => {
                      ev.stopPropagation();
                      _selectedActivityId = _selectedActivityId === w.id ? null : w.id;
                      _selectedAgentId = w.agentId;
                      rr();
                    }}
                  >
                  </div>
                `;
              })}

              <!-- Event markers -->
              ${_activeEvents
                .filter((e) => e.timestamp <= _currentTime)
                .filter((e) =>
                  ["pause", "error", "archive", "backtrack", "split", "handoff", "merge"].includes(
                    e.type,
                  ),
                )
                .map((ev) => {
                  const y = getAgentY(ev.agentId);
                  const x = getX(ev.timestamp);
                  let opacity = 1;
                  if (_selectedActivityId) {
                    const ew = windowForAgentAtTime(ev.agentId, ev.timestamp, true, windows);
                    opacity = ew && connWins.has(ew.id) ? 1 : 0.1;
                  } else if (hasHL) {
                    opacity = highlightSet.has(ev.agentId) ? 1 : 0.2;
                  }
                  const color = eventColor(ev.type);
                  const isHov = _hoveredEventId === ev.id;
                  return html`
                    <div
                      class="cd-monitor-event ${isHov ? "cd-monitor-event--hovered" : ""}"
                      style="left:${x}px;top:${y}px;border-color:${color}50;background:${color}20;opacity:${opacity}"
                      @mouseenter=${() => {
                        _hoveredEventId = ev.id;
                        _hoveredAgentId = ev.agentId;
                        rr();
                      }}
                      @mouseleave=${() => {
                        _hoveredEventId = null;
                        _hoveredAgentId = null;
                        rr();
                      }}
                      @click=${(ev2: Event) => {
                        ev2.stopPropagation();
                        _selectedAgentId = ev.agentId;
                        rr();
                      }}
                    >
                      <span style="font-size:10px">${eventIcon(ev.type)}</span>
                      ${
                        isHov
                          ? html`
                            <div class="cd-monitor-tooltip">
                              <div
                                class="cd-monitor-tooltip__type"
                                style="color:${color}"
                              >
                                ${ev.type}
                              </div>
                              ${
                                ev.details
                                  ? html`<div
                                    class="cd-monitor-tooltip__detail"
                                  >
                                    ${ev.details}
                                  </div>`
                                  : ""
                              }
                              ${
                                ev.targetId
                                  ? html`<div
                                    class="cd-monitor-tooltip__target"
                                  >
                                    →
                                    ${_activeAgents.find((a) => a.id === ev.targetId)?.name ?? ev.targetId}
                                  </div>`
                                  : ""
                              }
                            </div>
                          `
                          : ""
                      }
                    </div>
                  `;
                })}

              <!-- AI Annotation markers -->
              ${
                _showAnnotations
                  ? ANNOTATIONS.filter((a) => a.timestamp <= _currentTime).map((ann) => {
                      const x = getX(ann.timestamp);
                      const rawY = ann.agentId ? getAgentY(ann.agentId) : 40;
                      const below = ann.placement === "bottom" || rawY < 60;
                      const y = below ? rawY + 24 : rawY - 24;
                      const ac = annotationColor(ann.type);
                      const isHov = _hoveredAnnotation === ann.id;
                      return html`
                      <div
                        class="cd-monitor-annotation"
                        style="left:${x}px;top:${y}px"
                        @mouseenter=${() => {
                          _hoveredAnnotation = ann.id;
                          rr();
                        }}
                        @mouseleave=${() => {
                          _hoveredAnnotation = null;
                          rr();
                        }}
                      >
                        <div
                          class="cd-monitor-annotation__dot"
                          style="color:${ac.fg};border-color:${ac.border};background:${ac.bg}"
                        >
                          ${annotationIcon(ann.type)}
                        </div>
                        ${
                          isHov
                            ? html`
                              <div
                                class="cd-monitor-annotation__tip ${
                                  below ? "cd-monitor-annotation__tip--below" : ""
                                }"
                              >
                                <div
                                  class="cd-monitor-annotation__tip-title"
                                  style="color:${ac.fg}"
                                >
                                  ${ann.title}
                                </div>
                                <div
                                  class="cd-monitor-annotation__tip-desc"
                                >
                                  ${ann.description}
                                </div>
                              </div>
                            `
                            : ""
                        }
                      </div>
                    `;
                    })
                  : ""
              }

              <!-- Playhead -->
              <div
                class="cd-monitor-playhead"
                style="left:${getX(_currentTime)}px;top:0;height:${tlHeight}px"
              >
                <span class="cd-monitor-playhead__time"
                  >${Math.floor(_currentTime)}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Legend ═══ -->
      <div class="cd-monitor-legend">
        <div class="cd-monitor-legend__section">
          <span class="cd-monitor-legend__title">Lifecycle</span>
          <span class="cd-monitor-legend__item"
            ><span
              class="cd-monitor-legend__swatch"
              style="background:#22c55e"
            ></span>
            Persistent</span
          >
          <span class="cd-monitor-legend__item"
            ><span
              class="cd-monitor-legend__swatch"
              style="background:#f59e0b"
            ></span>
            Ephemeral</span
          >
          <span class="cd-monitor-legend__item"
            ><span
              class="cd-monitor-legend__swatch"
              style="background:#818cf8"
            ></span>
            Contract</span
          >
        </div>
        <div class="cd-monitor-legend__section">
          <span class="cd-monitor-legend__title">Events</span>
          <span class="cd-monitor-legend__item">⏸ Pause</span>
          <span class="cd-monitor-legend__item">✕ Error</span>
          <span class="cd-monitor-legend__item">⑂ Split</span>
          <span class="cd-monitor-legend__item">⇋ Handoff</span>
          <span class="cd-monitor-legend__item">⊕ Merge</span>
          <span class="cd-monitor-legend__item">↩ Backtrack</span>
          <span class="cd-monitor-legend__item">▣ Archive</span>
        </div>
        ${
          _showAnnotations
            ? html`
                <div class="cd-monitor-legend__section">
                  <span class="cd-monitor-legend__title">AI Insights</span>
                  <span class="cd-monitor-legend__item"
                    ><span class="cd-monitor-legend__swatch" style="background: #fb7185"></span> Bottleneck</span
                  >
                  <span class="cd-monitor-legend__item"
                    ><span class="cd-monitor-legend__swatch" style="background: #fbbf24"></span> Decision</span
                  >
                  <span class="cd-monitor-legend__item"
                    ><span class="cd-monitor-legend__swatch" style="background: #34d399"></span> Dispatch</span
                  >
                  <span class="cd-monitor-legend__item"
                    ><span class="cd-monitor-legend__swatch" style="background: #a78bfa"></span> Insight</span
                  >
                </div>
              `
            : ""
        }
      </div>
    </div>
  `;
}
