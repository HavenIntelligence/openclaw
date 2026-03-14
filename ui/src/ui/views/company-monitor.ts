import { html } from "lit";

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

// ── Constants ────────────────────────────────────────────────────────────────
const LANE_HEIGHT = 64;
const PADDING_TOP = 16;
const PADDING_LEFT = 180;
const TIME_SCALE = 8;
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
  },
  {
    id: "ops-prime",
    name: "Ops Prime",
    emoji: "🧑‍💼",
    role: "COO",
    lifecycle: "persistent",
    color: "#60a5fa",
  },
  {
    id: "content-director",
    name: "CMO",
    emoji: "👩‍🎨",
    role: "Content Director",
    lifecycle: "persistent",
    color: "#fb923c",
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

// ── State ────────────────────────────────────────────────────────────────────
let _currentTime = 0;
let _isPlaying = true;
let _speed = 1;
let _hoveredAgentId: string | null = null;
let _selectedAgentId: string | null = null;
let _hoveredEventId: string | null = null;
let _playInterval: ReturnType<typeof setInterval> | null = null;

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
  const index = AGENTS.findIndex((a) => a.id === agentId);
  return PADDING_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
}

function getX(timestamp: number): number {
  return PADDING_LEFT + timestamp * TIME_SCALE;
}

function lifecycleColor(lc: AgentLifecycle): string {
  if (lc === "persistent") {
    return "#22c55e";
  }
  if (lc === "ephemeral") {
    return "#f59e0b";
  }
  return "#818cf8";
}

function eventIcon(type: EventKind): string {
  const map: Record<EventKind, string> = {
    spawn: "🟢",
    start: "▶️",
    pause: "⏸️",
    resume: "▶️",
    split: "🔀",
    merge: "🔗",
    backtrack: "↩️",
    error: "❌",
    handoff: "🤝",
    archive: "📦",
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

function agentStatus(agentId: string, time: number): string {
  const agentEvents = EVENTS.filter((e) => e.agentId === agentId && e.timestamp <= time).toSorted(
    (a, b) => b.timestamp - a.timestamp,
  );
  const last = agentEvents[0];
  if (!last) {
    return "inactive";
  }
  if (
    last.type === "start" ||
    last.type === "resume" ||
    last.type === "split" ||
    last.type === "handoff" ||
    last.type === "merge"
  ) {
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

// ── Render ───────────────────────────────────────────────────────────────────
export function renderCompanyMonitor(deps: { requestRender?: () => void }) {
  const requestRender = deps.requestRender ?? (() => {});

  if (_isPlaying && !_playInterval) {
    startPlayback(requestRender);
  }

  const activityWindows = deriveActivityWindows(AGENTS, EVENTS, _currentTime);
  const lineageEdges = deriveLineageEdges(EVENTS.filter((e) => e.timestamp <= _currentTime));
  const timelineWidth = PADDING_LEFT + MAX_TIME * TIME_SCALE + 40;
  const timelineHeight = PADDING_TOP + AGENTS.length * LANE_HEIGHT + 16;

  const highlightSet = new Set<string>();
  const focusId = _hoveredAgentId || _selectedAgentId;
  if (focusId) {
    highlightSet.add(focusId);
    for (const e of lineageEdges) {
      if (e.sourceId === focusId) {
        highlightSet.add(e.targetId);
      }
      if (e.targetId === focusId) {
        highlightSet.add(e.sourceId);
      }
    }
  }
  const hasHighlight = highlightSet.size > 0;

  return html`
    <div class="cd-monitor-page">
      <!-- Top bar -->
      <div class="cd-monitor-topbar">
        <div class="cd-monitor-topbar__left">
          <span class="cd-monitor-eyebrow">Agent Timeline Monitor</span>
          <span class="cd-monitor-counts">
            ${AGENTS.filter((a) => agentStatus(a.id, _currentTime) === "running").length} running ·
            ${AGENTS.filter((a) => agentStatus(a.id, _currentTime) === "error").length} errors ·
            ${AGENTS.filter((a) => agentStatus(a.id, _currentTime) === "paused").length} paused
          </span>
        </div>
        <div class="cd-monitor-controls">
          <button class="cd-monitor-btn ${_speed === 1 ? "cd-monitor-btn--active" : ""}" @click=${() => {
            _speed = 1;
            requestRender();
          }}>1x</button>
          <button class="cd-monitor-btn ${_speed === 2 ? "cd-monitor-btn--active" : ""}" @click=${() => {
            _speed = 2;
            requestRender();
          }}>2x</button>
          <button class="cd-monitor-btn ${_speed === 4 ? "cd-monitor-btn--active" : ""}" @click=${() => {
            _speed = 4;
            requestRender();
          }}>4x</button>
          <button class="cd-monitor-btn cd-monitor-btn--primary" @click=${() => {
            if (_currentTime >= MAX_TIME) {
              _currentTime = 0;
            }
            _isPlaying = !_isPlaying;
            if (_isPlaying) {
              startPlayback(requestRender);
            }
            requestRender();
          }}>${_isPlaying ? "⏸ Pause" : "▶ Play"}</button>
          <button class="cd-monitor-btn" @click=${() => {
            _currentTime = 0;
            _isPlaying = true;
            stopPlayback();
            startPlayback(requestRender);
            requestRender();
          }}>↻ Replay</button>
          <span class="cd-monitor-time">T = ${Math.floor(_currentTime)}</span>
        </div>
      </div>

      <!-- Time slider -->
      <div class="cd-monitor-slider-row">
        <input type="range" class="cd-monitor-slider" min="0" max="${MAX_TIME}" step="1"
          .value=${String(Math.floor(_currentTime))}
          @input=${(e: Event) => {
            _currentTime = Number((e.target as HTMLInputElement).value);
            requestRender();
          }}
        />
      </div>

      <!-- Main timeline -->
      <div class="cd-monitor-timeline-wrap">
        <div class="cd-monitor-timeline" style="width:${timelineWidth}px;height:${timelineHeight}px;position:relative">

          <!-- Background grid -->
          <div style="position:absolute;inset:0;pointer-events:none;background-size:${TIME_SCALE * 10}px ${LANE_HEIGHT}px;background-position:${PADDING_LEFT}px ${PADDING_TOP}px;background-image:linear-gradient(to right,rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.025) 1px,transparent 1px)"></div>

          <!-- Time scale labels -->
          ${Array.from({ length: Math.floor(MAX_TIME / 10) + 1 }, (_, i) => i * 10).map(
            (t) => html`
              <div class="cd-monitor-tick" style="left:${getX(t)}px;top:0;position:absolute">
                <span class="cd-monitor-tick__label">${t}</span>
              </div>
            `,
          )}

          <!-- Agent lane labels (left) -->
          ${AGENTS.map(
            (agent) => html`
              <div class="cd-monitor-lane-label"
                style="top:${getAgentY(agent.id) - LANE_HEIGHT / 2}px;height:${LANE_HEIGHT}px"
                @mouseenter=${() => {
                  _hoveredAgentId = agent.id;
                  requestRender();
                }}
                @mouseleave=${() => {
                  _hoveredAgentId = null;
                  requestRender();
                }}
                @click=${() => {
                  _selectedAgentId = _selectedAgentId === agent.id ? null : agent.id;
                  requestRender();
                }}>
                <span class="cd-monitor-lane-dot" style="background:${statusDotColor(agentStatus(agent.id, _currentTime))}"></span>
                <span class="cd-monitor-lane-emoji">${agent.emoji}</span>
                <span class="cd-monitor-lane-info">
                  <span class="cd-monitor-lane-name">${agent.name}</span>
                  <span class="cd-monitor-lane-role">${agent.role}</span>
                </span>
              </div>
            `,
          )}

          <!-- SVG: lineage edges -->
          <svg style="position:absolute;inset:0;overflow:visible;pointer-events:none" width="${timelineWidth}" height="${timelineHeight}">
            ${lineageEdges.map((edge) => {
              const y1 = getAgentY(edge.sourceId);
              const y2 = getAgentY(edge.targetId);
              const x = getX(edge.timestamp);
              const isHighlighted = hasHighlight
                ? highlightSet.has(edge.sourceId) && highlightSet.has(edge.targetId)
                : true;
              const opacity = hasHighlight ? (isHighlighted ? 0.9 : 0.12) : 0.45;
              const strokeColor =
                edge.type === "handoff"
                  ? "#3b82f6"
                  : edge.type === "split"
                    ? "#a78bfa"
                    : edge.type === "merge"
                      ? "#60a5fa"
                      : "#94a3b8";
              const isDown = y2 > y1;
              let pathD = `M ${x} ${y1}`;
              let arrowPoints = "";
              if (isDown) {
                pathD += ` L ${x} ${y2 - 6}`;
                arrowPoints = `${x - 4},${y2 - 6} ${x + 4},${y2 - 6} ${x},${y2}`;
              } else {
                pathD += ` L ${x} ${y2 + 6}`;
                arrowPoints = `${x - 4},${y2 + 6} ${x + 4},${y2 + 6} ${x},${y2}`;
              }
              return html`
                <g style="opacity:${opacity};transition:opacity .2s ease">
                  <path d="${pathD}" stroke="${strokeColor}" stroke-width="${isHighlighted ? 2 : 1}" fill="none" stroke-dasharray="${edge.type === "handoff" ? "4 4" : "none"}"/>
                  <circle cx="${x}" cy="${y1}" r="3" fill="${strokeColor}"/>
                  ${arrowPoints ? html`<polygon points="${arrowPoints}" fill="${strokeColor}"/>` : ""}
                </g>
              `;
            })}
          </svg>

          <!-- Activity windows -->
          ${activityWindows.map((w) => {
            const agent = AGENTS.find((a) => a.id === w.agentId);
            if (!agent) {
              return "";
            }
            const y = getAgentY(w.agentId) - 10;
            const x = getX(w.startTime);
            const endT = w.endTime !== null ? w.endTime : _currentTime;
            const width = Math.max((endT - w.startTime) * TIME_SCALE, 4);
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
            const isHighlighted = hasHighlight ? highlightSet.has(w.agentId) : true;
            const opacity = hasHighlight ? (isHighlighted ? 1 : 0.2) : 1;
            return html`
              <div class="cd-monitor-window" style="left:${x}px;top:${y}px;width:${width}px;background:${bg};border-color:${border};opacity:${opacity}"
                @mouseenter=${() => {
                  _hoveredAgentId = w.agentId;
                  requestRender();
                }}
                @mouseleave=${() => {
                  _hoveredAgentId = null;
                  requestRender();
                }}>
              </div>
            `;
          })}

          <!-- Event markers -->
          ${EVENTS.filter((e) => e.timestamp <= _currentTime)
            .filter((e) =>
              ["pause", "error", "archive", "backtrack", "split", "handoff", "merge"].includes(
                e.type,
              ),
            )
            .map((ev) => {
              const y = getAgentY(ev.agentId);
              const x = getX(ev.timestamp);
              const isHighlighted = hasHighlight ? highlightSet.has(ev.agentId) : true;
              const opacity = hasHighlight ? (isHighlighted ? 1 : 0.2) : 1;
              const color = eventColor(ev.type);
              const isHovered = _hoveredEventId === ev.id;
              return html`
              <div class="cd-monitor-event ${isHovered ? "cd-monitor-event--hovered" : ""}"
                style="left:${x}px;top:${y}px;border-color:${color}50;background:${color}20;opacity:${opacity}"
                @mouseenter=${() => {
                  _hoveredEventId = ev.id;
                  _hoveredAgentId = ev.agentId;
                  requestRender();
                }}
                @mouseleave=${() => {
                  _hoveredEventId = null;
                  _hoveredAgentId = null;
                  requestRender();
                }}>
                <span style="font-size:10px">${eventIcon(ev.type)}</span>
                ${
                  isHovered
                    ? html`
                  <div class="cd-monitor-tooltip">
                    <div class="cd-monitor-tooltip__type" style="color:${color}">${ev.type}</div>
                    ${ev.details ? html`<div class="cd-monitor-tooltip__detail">${ev.details}</div>` : ""}
                    ${ev.targetId ? html`<div class="cd-monitor-tooltip__target">→ ${AGENTS.find((a) => a.id === ev.targetId)?.name ?? ev.targetId}</div>` : ""}
                  </div>
                `
                    : ""
                }
              </div>
            `;
            })}

          <!-- Playhead -->
          <div class="cd-monitor-playhead" style="left:${getX(_currentTime)}px;top:0;height:${timelineHeight}px">
            <span class="cd-monitor-playhead__time">${Math.floor(_currentTime)}</span>
          </div>

        </div>
      </div>

      <!-- Legend -->
      <div class="cd-monitor-legend">
        <div class="cd-monitor-legend__section">
          <span class="cd-monitor-legend__title">Lifecycle</span>
          <span class="cd-monitor-legend__item"><span class="cd-monitor-legend__swatch" style="background:${lifecycleColor("persistent")}"></span> Persistent</span>
          <span class="cd-monitor-legend__item"><span class="cd-monitor-legend__swatch" style="background:${lifecycleColor("ephemeral")}"></span> Ephemeral</span>
          <span class="cd-monitor-legend__item"><span class="cd-monitor-legend__swatch" style="background:${lifecycleColor("contract")}"></span> Contract</span>
        </div>
        <div class="cd-monitor-legend__section">
          <span class="cd-monitor-legend__title">Events</span>
          <span class="cd-monitor-legend__item">⏸️ Pause</span>
          <span class="cd-monitor-legend__item">❌ Error</span>
          <span class="cd-monitor-legend__item">🔀 Split</span>
          <span class="cd-monitor-legend__item">🤝 Handoff</span>
          <span class="cd-monitor-legend__item">🔗 Merge</span>
          <span class="cd-monitor-legend__item">↩️ Backtrack</span>
          <span class="cd-monitor-legend__item">📦 Archive</span>
        </div>
      </div>
    </div>
  `;
}
