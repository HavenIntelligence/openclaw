import { html } from "lit";
import type { ClawDockAgent, LogEntry as RealLogEntry } from "../company-types.ts";

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
  agent: string;
  agentEmoji: string;
  type: "tool_call" | "output" | "thinking" | "human" | "error" | "system";
  content: string;
  tokens?: number;
  duration?: number;
};

// ── Project definition ──────────────────────────────────────────────────────
type Project = {
  id: string;
  name: string;
  status: "running" | "paused" | "completed";
  agents: string[];
  progress: number;
  description: string;
};

// ── Demo data ──────────────────────────────────────────────────────────────
const TILE = 62;
const COLS = 14;
const ROWS = 9;

const DESKS: Record<string, { x: number; y: number }> = {
  "ai-director": { x: 6, y: 0 },
  "ops-prime": { x: 1, y: 2 },
  "content-director": { x: 11, y: 2 },
  "nanoclaw-primary": { x: 6, y: 2 },
  "code-agent": { x: 0, y: 6 },
  "test-runner": { x: 3, y: 6 },
  "research-alpha": { x: 9, y: 6 },
  "writing-beta": { x: 11, y: 6 },
  "review-gamma": { x: 13, y: 6 },
};

const THOUGHTS: Record<string, string[]> = {
  "ai-director": [
    "Reviewing Q2 roadmap…",
    "Should we prioritize the MCP marketplace?",
    "Fundraise deck looks solid. One more round of feedback.",
  ],
  "ops-prime": [
    "Churn is up 1.2% — need to flag this.",
    "Deployment window set for Thursday 2am.",
    "Team velocity is healthy this sprint.",
  ],
  "content-director": [
    "New blog angle: AI agents vs. human teams.",
    "SEO score needs work on the pricing page.",
    "Let's A/B test two headline variants.",
  ],
  "nanoclaw-primary": [
    "Founder meeting notes synced.",
    "Calendar blocked for deep work: 9–12am.",
    "3 reminders queued for tomorrow.",
  ],
  "code-agent": [
    "MCP retry fix looks clean. Running tests.",
    "Auth token refresh was a race condition.",
    "PR #42 ready. All 142 tests passing ✅",
  ],
  "test-runner": [
    "Coverage at 89%. Need 3 more edge cases.",
    "Flakey test in auth suite — investigating.",
    "Regression suite finished. 0 new failures.",
  ],
  "research-alpha": [
    "Found pricing data for 18 competitors.",
    "Anthropic API: $3/M input tokens at scale.",
    "Building comparison table for writing-beta.",
  ],
  "writing-beta": [
    "Draft at 1,800 words. 700 more to go.",
    "Adding a 'Key Takeaways' section.",
    "SEO keywords woven in. Reads naturally.",
  ],
  "review-gamma": [
    "Context window exceeded 128K limit.",
    "Supervisor restarting… attempt 2/3.",
    "Unable to resume — awaiting human review.",
  ],
};

const MESSAGE_SCRIPTS = [
  { from: "ai-director", to: "content-director", emoji: "📋", label: "Strategy brief" },
  { from: "content-director", to: "research-alpha", emoji: "🔍", label: "Research task" },
  { from: "research-alpha", to: "writing-beta", emoji: "📄", label: "Research output" },
  { from: "writing-beta", to: "review-gamma", emoji: "✍️", label: "Draft ready" },
  { from: "ai-director", to: "ops-prime", emoji: "📊", label: "OKR review" },
  { from: "ops-prime", to: "code-agent", emoji: "⚙️", label: "Deploy task" },
  { from: "code-agent", to: "test-runner", emoji: "💻", label: "PR ready" },
  { from: "test-runner", to: "ops-prime", emoji: "✅", label: "Tests passed" },
  { from: "nanoclaw-primary", to: "ai-director", emoji: "💬", label: "Summary ready" },
];

const INITIAL_AGENTS: OfficeAgent[] = [
  {
    id: "ai-director",
    name: "AI Director",
    emoji: "🧑‍💻",
    color: "#ff5c5c",
    team: "executive",
    status: "thinking",
    activity: "Setting strategy",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["ai-director"],
    targetX: DESKS["ai-director"].x,
    targetY: DESKS["ai-director"].y,
    deskX: DESKS["ai-director"].x,
    deskY: DESKS["ai-director"].y,
  },
  {
    id: "ops-prime",
    name: "Ops Prime",
    emoji: "🧑‍💼",
    color: "#60a5fa",
    team: "executive",
    status: "working",
    activity: "Reviewing OKRs",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["ops-prime"],
    targetX: DESKS["ops-prime"].x,
    targetY: DESKS["ops-prime"].y,
    deskX: DESKS["ops-prime"].x,
    deskY: DESKS["ops-prime"].y,
  },
  {
    id: "content-director",
    name: "CMO",
    emoji: "👩‍🎨",
    color: "#fb923c",
    team: "content",
    status: "working",
    activity: "Planning content",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["content-director"],
    targetX: DESKS["content-director"].x,
    targetY: DESKS["content-director"].y,
    deskX: DESKS["content-director"].x,
    deskY: DESKS["content-director"].y,
  },
  {
    id: "nanoclaw-primary",
    name: "NanoClaw",
    emoji: "🤖",
    color: "#14b8a6",
    team: "executive",
    status: "idle",
    activity: "Awaiting tasks",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["nanoclaw-primary"],
    targetX: DESKS["nanoclaw-primary"].x,
    targetY: DESKS["nanoclaw-primary"].y,
    deskX: DESKS["nanoclaw-primary"].x,
    deskY: DESKS["nanoclaw-primary"].y,
  },
  {
    id: "code-agent",
    name: "Code Agent",
    emoji: "👨‍💻",
    color: "#22c55e",
    team: "devops",
    status: "working",
    activity: "Fixing MCP retry",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["code-agent"],
    targetX: DESKS["code-agent"].x,
    targetY: DESKS["code-agent"].y,
    deskX: DESKS["code-agent"].x,
    deskY: DESKS["code-agent"].y,
  },
  {
    id: "test-runner",
    name: "Test Runner",
    emoji: "🧪",
    color: "#a78bfa",
    team: "devops",
    status: "idle",
    activity: "Waiting for PR",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["test-runner"],
    targetX: DESKS["test-runner"].x,
    targetY: DESKS["test-runner"].y,
    deskX: DESKS["test-runner"].x,
    deskY: DESKS["test-runner"].y,
  },
  {
    id: "research-alpha",
    name: "Researcher",
    emoji: "🔍",
    color: "#f97316",
    team: "content",
    status: "working",
    activity: "Competitor analysis",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["research-alpha"],
    targetX: DESKS["research-alpha"].x,
    targetY: DESKS["research-alpha"].y,
    deskX: DESKS["research-alpha"].x,
    deskY: DESKS["research-alpha"].y,
  },
  {
    id: "writing-beta",
    name: "Writer",
    emoji: "✍️",
    color: "#fbbf24",
    team: "content",
    status: "working",
    activity: "Drafting blog post",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["writing-beta"],
    targetX: DESKS["writing-beta"].x,
    targetY: DESKS["writing-beta"].y,
    deskX: DESKS["writing-beta"].x,
    deskY: DESKS["writing-beta"].y,
  },
  {
    id: "review-gamma",
    name: "Reviewer",
    emoji: "🧐",
    color: "#ef4444",
    team: "content",
    status: "crashed",
    activity: "CRASHED",
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    ...DESKS["review-gamma"],
    targetX: DESKS["review-gamma"].x,
    targetY: DESKS["review-gamma"].y,
    deskX: DESKS["review-gamma"].x,
    deskY: DESKS["review-gamma"].y,
  },
];

// ── Demo execution log ────────────────────────────────────────────────────
let _execLog: LogEntry[] = [
  {
    id: "l-0",
    ts: "09:41:02",
    agent: "ai-director",
    agentEmoji: "👑",
    type: "system",
    content: "Project Alpha started — 4 agents assigned",
    tokens: undefined,
  },
  {
    id: "l-1",
    ts: "09:41:04",
    agent: "research-alpha",
    agentEmoji: "🔍",
    type: "thinking",
    content:
      "Analyzing task: competitor pricing research for B2B AI SaaS landscape (10 companies)…",
  },
  {
    id: "l-2",
    ts: "09:41:08",
    agent: "research-alpha",
    agentEmoji: "🔍",
    type: "tool_call",
    content: "web_search({ query: 'AI SaaS pricing models 2026 comparison', max_results: 20 })",
    tokens: 1_200,
    duration: 1840,
  },
  {
    id: "l-3",
    ts: "09:41:12",
    agent: "research-alpha",
    agentEmoji: "🔍",
    type: "output",
    content:
      "Found 18 sources. Extracting pricing tiers for: Anthropic API, OpenAI, Cohere, Mistral, Replicate, Modal, Together.ai, Groq, Fireworks, Perplexity…",
    tokens: 4_800,
  },
  {
    id: "l-4",
    ts: "09:42:15",
    agent: "code-agent",
    agentEmoji: "💻",
    type: "tool_call",
    content: "bash({ cmd: 'npm run test -- --coverage --reporter=verbose' })",
    tokens: 320,
    duration: 12_400,
  },
  {
    id: "l-5",
    ts: "09:42:27",
    agent: "code-agent",
    agentEmoji: "💻",
    type: "output",
    content:
      "Test suite: 142 passed, 2 failed\n  ✗ MCP retry test: timeout after 5000ms\n  ✗ Auth token refresh: expected 200, got 401",
    tokens: 890,
  },
  {
    id: "l-6",
    ts: "09:43:01",
    agent: "writing-beta",
    agentEmoji: "✍️",
    type: "thinking",
    content:
      "Drafting 'AI Agents in 2026' — structuring 5 sections: Overview, Use Cases, Architecture, Risks, Future Outlook…",
  },
  {
    id: "l-7",
    ts: "09:43:18",
    agent: "writing-beta",
    agentEmoji: "✍️",
    type: "output",
    content:
      "**AI Agents in 2026: The Operational Layer**\n\nThe shift from language models to autonomous agents represents the most significant productivity unlock since cloud computing. In 2026, enterprises are deploying fleets of specialized agents…",
    tokens: 2_400,
  },
  {
    id: "l-8",
    ts: "09:44:00",
    agent: "ops-prime",
    agentEmoji: "🏢",
    type: "system",
    content: "⚠️ review-gamma crashed (OOM). Supervisor initiating restart sequence (attempt 1/3).",
  },
  {
    id: "l-9",
    ts: "09:44:05",
    agent: "ai-director",
    agentEmoji: "👑",
    type: "human",
    content: "[Human override] Hold restart — check if context window exceeded first.",
  },
];

let _logIdCounter = 10;

// ── Projects ───────────────────────────────────────────────────────────────
const PROJECTS: Project[] = [
  {
    id: "alpha",
    name: "Project Alpha",
    status: "running",
    agents: ["code-agent", "test-runner", "research-alpha", "writing-beta"],
    progress: 62,
    description: "Core platform v1.2.0 — reliability improvements and MCP client refactor.",
  },
  {
    id: "beta",
    name: "Project Beta",
    status: "paused",
    agents: ["research-alpha", "writing-beta"],
    progress: 28,
    description: "AI agent fleet white-paper and thought leadership content series.",
  },
  {
    id: "content",
    name: "Content Pipeline",
    status: "running",
    agents: ["research-alpha", "writing-beta", "review-gamma"],
    progress: 85,
    description: "Automated content production pipeline: research → draft → review → publish.",
  },
];

// ── Human input state ──────────────────────────────────────────────────────
let _humanInput = "";
let _isPaused = false;
let _activeProject = "alpha";
let _showAddProject = false;
let _newProjectName = "";
let _rightTab: "log" | "output" | "human" = "log";
let _logAgentFilter: string = "all"; // "all" or agent id

// ── Callbacks from props (module-level to be accessible in renderFn) ────────
let _onSendMessage: ((content: string) => void) | undefined;
let _onStopAgent: ((agentId: string) => void) | undefined;

// ── Animation state ────────────────────────────────────────────────────────
let _agents: OfficeAgent[] = INITIAL_AGENTS.map((a) => ({ ...a }));
let _messages: FlyingMessage[] = [];
let _canvasBubbles: CanvasBubble[] = [];
let _bubbleIdCounter = 0;
let _tick = 0;
let _msgIdCounter = 0;
let _scriptIdx = 0;
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
    agent,
    agentEmoji: emoji,
    type,
    content,
    tokens,
  });
  if (_execLog.length > 80) {
    _execLog = _execLog.slice(-60);
  }
  // Spawn canvas bubble for output and thinking entries
  if (type === "output" || type === "thinking" || type === "tool_call") {
    const shortText = content.length > 60 ? content.slice(0, 57) + "…" : content;
    const color = type === "output" ? "var(--ok)" : type === "tool_call" ? "#a78bfa" : "#60a5fa";
    _canvasBubbles.push({
      id: `bubble-${_bubbleIdCounter++}`,
      agentId: agent,
      text: shortText,
      timer: 340,
      color,
    });
    if (_canvasBubbles.length > 5) {
      _canvasBubbles = _canvasBubbles.slice(-5);
    }
  }
}

function spawnMessage(fromId: string, toId: string, emoji: string, label: string) {
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
  if (_isPaused) {
    return;
  }
  _tick++;

  for (const msg of _messages) {
    msg.progress += 0.012;
  }
  _messages = _messages.filter((m) => m.progress < 1.0);

  // Tick canvas bubbles
  for (const b of _canvasBubbles) {
    b.timer--;
  }
  _canvasBubbles = _canvasBubbles.filter((b) => b.timer > 0);

  if (_tick % 200 === 0) {
    const script = MESSAGE_SCRIPTS[_scriptIdx % MESSAGE_SCRIPTS.length];
    spawnMessage(script.from, script.to, script.emoji, script.label);
    addLog(
      script.from,
      _agents.find((a) => a.id === script.from)?.emoji ?? "🤖",
      "tool_call",
      `→ ${script.to}: ${script.label}`,
      Math.floor(Math.random() * 3000 + 500),
    );
    _scriptIdx++;
    const sender = _agents.find((a) => a.id === script.from);
    if (sender && sender.status !== "crashed") {
      sender.status = "messaging";
      sender.activity = `Sending: ${script.label}`;
    }
  }

  if (_tick % 320 === 0) {
    const activeAgents = _agents.filter((a) => a.status !== "crashed");
    if (activeAgents.length > 0) {
      const a = activeAgents[Math.floor(Math.random() * activeAgents.length)];
      const outputs = [
        "Completed analysis. 14 key insights identified.",
        "Generated 1,200 word draft. Ready for review.",
        "All tests passing. Coverage at 91%.",
        "Dependency vulnerability patched and deployed.",
        "Market research compiled: 8 competitors analyzed.",
      ];
      addLog(
        a.id,
        a.emoji,
        "output",
        outputs[Math.floor(Math.random() * outputs.length)],
        Math.floor(Math.random() * 8000 + 1000),
      );
    }
  }

  for (const agent of _agents) {
    if (agent.status === "crashed") {
      continue;
    }

    if (_tick % 60 === Math.abs(agent.id.charCodeAt(0)) % 60) {
      const thoughts = THOUGHTS[agent.id] ?? [];
      if (thoughts.length > 0) {
        agent.thoughtBubble = thoughts[Math.floor(_tick / 60) % thoughts.length];
        agent.thoughtTimer = 180;
      }
    }
    if (agent.thoughtTimer > 0) {
      agent.thoughtTimer--;
      if (agent.thoughtTimer === 0) {
        agent.thoughtBubble = "";
      }
    }

    if (_tick % 600 === Math.abs(agent.id.charCodeAt(2) ?? 0) % 600) {
      // 15% chance to go to meeting room, otherwise stay at desk
      const goMeet = Math.random() < 0.15;
      if (goMeet) {
        agent.targetX = 5 + Math.floor(Math.random() * 3);
        agent.targetY = 4;
        agent.status = "thinking";
      } else {
        agent.targetX = agent.deskX;
        agent.targetY = agent.deskY;
        agent.status = "working";
        agent.activity = "Back at desk";
      }
    }

    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      const speed = 0.022;
      agent.x += (dx / dist) * speed;
      agent.y += (dy / dist) * speed;
    } else {
      agent.x = agent.targetX;
      agent.y = agent.targetY;
    }

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

// ── Floor zones ────────────────────────────────────────────────────────────
const FLOOR_TILES = [
  {
    x: 0,
    y: 0,
    w: COLS,
    h: 2,
    label: "Executive Suite",
    color: "rgba(96,165,250,0.05)",
    border: "rgba(96,165,250,0.15)",
  },
  {
    x: 5,
    y: 3,
    w: 4,
    h: 3,
    label: "Meeting Room",
    color: "rgba(255,92,92,0.06)",
    border: "rgba(255,92,92,0.25)",
  },
  {
    x: 0,
    y: 5,
    w: 7,
    h: 4,
    label: "Dev Area",
    color: "rgba(34,197,94,0.06)",
    border: "rgba(34,197,94,0.2)",
  },
  {
    x: 8,
    y: 5,
    w: 6,
    h: 4,
    label: "Content Area",
    color: "rgba(251,146,60,0.06)",
    border: "rgba(251,146,60,0.2)",
  },
];

const DESK_ITEMS = Object.entries(DESKS).map(([id, pos]) => {
  const a = INITIAL_AGENTS.find((x) => x.id === id);
  return { ...pos, emoji: "🖥️", agent: a };
});

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

function logTypeIcon(type: LogEntry["type"]) {
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
  onSendMessage?: (content: string) => void;
  onStopAgent?: (agentId: string) => void;
};

export function renderCompanyOffice(props: CompanyOfficeProps) {
  if (props.requestUpdate) {
    startSimulation(props.requestUpdate);
  }
  _onSendMessage = props.onSendMessage;
  _onStopAgent = props.onStopAgent;

  // Sync real agent statuses into the simulation when provided.
  if (props.agents && props.agents.length > 0) {
    const statusMap: Record<string, OfficeAgent["status"]> = {
      active: "working",
      idle: "idle",
      crashed: "crashed",
      starting: "thinking",
      stopping: "idle",
      paused: "idle",
    };
    for (const realAgent of props.agents) {
      const existing = _agents.find((a) => a.id === realAgent.id);
      if (existing) {
        // Only override status — preserve animation position.
        existing.status = statusMap[realAgent.status] ?? "idle";
      }
    }
  }

  // Merge real log entries into the execution log (most recent at top, deduplicated by id).
  if (props.logs && props.logs.size > 0) {
    const existingIds = new Set(_execLog.map((e) => e.id));
    const newEntries: LogEntry[] = [];
    for (const entries of props.logs.values()) {
      for (const e of entries) {
        if (!existingIds.has(e.id)) {
          const agent = props.agents?.find((a) => a.id === e.agentId);
          // Map real log entry types to the office view's narrower type set.
          const typeMap: Record<string, LogEntry["type"]> = {
            message_in: "system",
            message_out: "output",
          };
          const entryType: LogEntry["type"] =
            e.type in typeMap ? typeMap[e.type] : (e.type as LogEntry["type"]);
          newEntries.push({
            id: e.id,
            ts: new Date(e.ts).toTimeString().slice(0, 8),
            agent: e.agentId,
            agentEmoji: agent?.emoji ?? "🤖",
            type: entryType,
            content: e.content,
            tokens: e.tokensUsed,
            duration: e.durationMs,
          });
        }
      }
    }
    if (newEntries.length > 0) {
      // Prepend new entries, sorted by ts desc; keep at most 50 entries total.
      _execLog = [...newEntries.toSorted((a, b) => b.id.localeCompare(a.id)), ..._execLog].slice(
        0,
        50,
      );
    }
  }

  const W = COLS * TILE;
  const H = ROWS * TILE;
  const activeProject = PROJECTS.find((p) => p.id === _activeProject) ?? PROJECTS[0];

  return html`
    <div class="cd-page cd-page--office">

      <!-- ── Top bar ─────────────────────────────────────────────────── -->
      <div class="cd-office-bar">
        <div class="cd-office-bar__left">
          <span class="cd-office-bar__title">🏢 Live Office</span>
          <span class="cd-office-bar__sub">Real-time agent simulation</span>
        </div>

        <!-- Project tabs -->
        <div class="cd-office-projects">
          ${PROJECTS.map(
            (p) => html`
            <button class="cd-office-proj-tab ${_activeProject === p.id ? "cd-office-proj-tab--active" : ""} cd-office-proj-tab--${p.status}"
              @click=${() => {
                _activeProject = p.id;
              }}>
              ${
                p.status === "running"
                  ? html`
                      <span class="cd-pulse cd-pulse--running"></span>
                    `
                  : p.status === "paused"
                    ? "⏸"
                    : "✅"
              }
              ${p.name}
              <span class="cd-office-proj-tab__pct">${p.progress}%</span>
            </button>
          `,
          )}
          <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
            _showAddProject = !_showAddProject;
          }} title="New Project">
            + Project
          </button>
        </div>

        <!-- Controls -->
        <div class="cd-office-bar__chips">
          <button class="cd-btn cd-btn--${_isPaused ? "primary" : "outline"} cd-btn--sm" @click=${() => {
            _isPaused = !_isPaused;
          }}>
            ${_isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <span>${_agents.filter((a) => a.status !== "crashed").length} active</span>
          ${_messages.length > 0 ? html`<span class="cd-office-bar__msgs">${_messages.length} msgs</span>` : ""}
        </div>
      </div>

      <!-- Add project inline form -->
      ${
        _showAddProject
          ? html`
        <div class="cd-office-new-proj">
          <input class="cd-form-input" placeholder="Project name…"
            .value=${_newProjectName}
            @input=${(e: Event) => {
              _newProjectName = (e.target as HTMLInputElement).value;
            }} />
          <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
            if (_newProjectName.trim()) {
              PROJECTS.push({
                id: `proj-${Date.now()}`,
                name: _newProjectName.trim(),
                status: "running",
                agents: [],
                progress: 0,
                description: "New project",
              });
              _newProjectName = "";
              _showAddProject = false;
            }
          }}>Launch</button>
          <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${() => {
            _showAddProject = false;
          }}>Cancel</button>
        </div>
      `
          : ""
      }

      <!-- ── Main split layout ───────────────────────────────────────── -->
      <div class="cd-office-split">

        <!-- LEFT: animated office canvas -->
        <div class="cd-office-canvas-wrap">
          <!-- Project progress bar (clawport style) -->
          <div class="cd-office-proj-bar">
            <div class="cd-office-proj-bar__copy">
              <span class="cd-office-proj-bar__name">${activeProject.name}</span>
              <span class="cd-office-proj-bar__desc">${activeProject.description}</span>
            </div>
            <div class="cd-office-proj-bar__meta">
              <span class="cd-office-proj-status cd-office-proj-status--${activeProject.status}">${activeProject.status}</span>
              <div class="cd-office-proj-progress">
                <div class="cd-office-proj-progress__fill" style="width:${activeProject.progress}%"></div>
              </div>
              <span class="cd-office-proj-bar__pct">${activeProject.progress}%</span>
            </div>
          </div>

          <!-- Focus strip (critical path) -->
          <div class="cd-office-focus-strip">
            <span class="cd-office-focus-strip__label">Critical path</span>
            <div class="cd-office-focus-track">
              ${[
                "ai-director",
                "content-director",
                "research-alpha",
                "writing-beta",
                "review-gamma",
              ].map((agentId, i, arr) => {
                const a = _agents.find((x) => x.id === agentId);
                if (!a) {
                  return "";
                }
                const isHot = a.status === "working" || a.status === "thinking";
                return html`
                  <span class="cd-office-focus-pill ${isHot ? "cd-office-focus-pill--hot" : ""}">
                    ${a.emoji} ${a.name}
                  </span>
                  ${
                    i < arr.length - 1
                      ? html`
                          <span class="cd-office-focus-arrow">→</span>
                        `
                      : ""
                  }
                `;
              })}
            </div>
          </div>

          <div class="cd-office-canvas" style="width:${W}px;height:${H}px">
            <div class="cd-office-floor" style="width:${W}px;height:${H}px">

              <!-- Zones -->
              ${FLOOR_TILES.map(
                (zone) => html`
                <div class="cd-office-zone"
                  style="left:${zone.x * TILE}px;top:${zone.y * TILE}px;width:${zone.w * TILE}px;height:${zone.h * TILE}px;background:${zone.color};border-color:${zone.border}">
                  <span class="cd-office-zone__label">${zone.label}</span>
                </div>
              `,
              )}

              <!-- Desk items -->
              ${DESK_ITEMS.map(
                (d) => html`
                <div class="cd-office-desk-item" style="left:${d.x * TILE + TILE / 2 - 10}px;top:${d.y * TILE + TILE - 16}px">🖥️</div>
              `,
              )}

              <!-- SVG edge network -->
              <svg class="cd-office-network" style="width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}">
                ${MESSAGE_SCRIPTS.map((script) => {
                  const from = _agents.find((a) => a.id === script.from);
                  const to = _agents.find((a) => a.id === script.to);
                  if (!from || !to) {
                    return "";
                  }
                  const x1 = from.x * TILE + TILE / 2;
                  const y1 = from.y * TILE + 20;
                  const x2 = to.x * TILE + TILE / 2;
                  const y2 = to.y * TILE + 20;
                  const cpX = (x1 + x2) / 2;
                  const cpY = Math.min(y1, y2) - Math.max(48, Math.abs(x2 - x1) * 0.18);
                  const hasActiveMsg = _messages.some(
                    (m) => Math.abs(m.fromX - x1) < TILE && Math.abs(m.toX - x2) < TILE,
                  );
                  return html`
                    <g class="cd-office-edge ${hasActiveMsg ? "cd-office-edge--active" : ""}">
                      <path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__hit" fill="none" stroke="transparent" stroke-width="18"/>
                      <path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__line"/>
                      ${hasActiveMsg ? html`<path d="M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}" class="cd-office-edge__pulse"/>` : ""}
                    </g>
                  `;
                })}
              </svg>

              <!-- Edge labels (clawport style) -->
              ${MESSAGE_SCRIPTS.map((script) => {
                const from = _agents.find((a) => a.id === script.from);
                const to = _agents.find((a) => a.id === script.to);
                if (!from || !to) {
                  return "";
                }
                const x1 = from.x * TILE + TILE / 2;
                const y1 = from.y * TILE + 20;
                const x2 = to.x * TILE + TILE / 2;
                const y2 = to.y * TILE + 20;
                const cpX = (x1 + x2) / 2;
                const cpY = Math.min(y1, y2) - Math.max(48, Math.abs(x2 - x1) * 0.18);
                const lx = 0.5 * 0.5 * x1 + 2 * 0.5 * 0.5 * cpX + 0.5 * 0.5 * x2;
                const ly = 0.5 * 0.5 * y1 + 2 * 0.5 * 0.5 * cpY + 0.5 * 0.5 * y2 - 22;
                const hasActiveMsg = _messages.some(
                  (m) => Math.abs(m.fromX - x1) < TILE && Math.abs(m.toX - x2) < TILE,
                );
                return html`
                  <div class="cd-office-edge-label ${hasActiveMsg ? "cd-office-edge-label--active" : ""}"
                    style="left:${lx}px;top:${ly}px">
                    ${script.label}
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
                const fadeIn = (340 - bubble.timer) / 15;
                const fadeOut = bubble.timer < 50 ? bubble.timer / 50 : 1;
                const opacity = Math.min(fadeIn, fadeOut);
                const offsetY = -TILE * 0.6 - (340 - bubble.timer) * 0.04;
                return html`
                  <div class="cd-canvas-bubble" style="
                    left:${agent.x * TILE - 60}px;
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
                const isMoving =
                  Math.abs(agent.x - agent.targetX) > 0.15 ||
                  Math.abs(agent.y - agent.targetY) > 0.15;
                return html`
                  <div class="cd-office-agent ${agent.status === "crashed" ? "cd-office-agent--crashed" : ""} ${isMoving ? "cd-office-agent--moving" : ""} ${agent.status === "messaging" ? "cd-office-agent--messaging" : ""}"
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
                      <span class="cd-office-agent__avatar">${agent.emoji}</span>
                    </span>
                    <span class="cd-office-agent__name-pill">${agent.name}</span>
                    <span class="cd-office-agent__role-text">${agent.team}</span>
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

          <!-- Summary strip (clawport style) -->
          <div class="cd-office-summary-strip">
            <div class="cd-office-summary-card">
              <span class="cd-office-summary-card__label">Now</span>
              <span class="cd-office-summary-card__title">
                ${_execLog.length > 0 ? _execLog[_execLog.length - 1].content.slice(0, 60) : "Waiting for first event"}
              </span>
              <span class="cd-office-summary-card__detail">
                ${_execLog.length > 0 ? `${_execLog[_execLog.length - 1].agentEmoji} ${_execLog[_execLog.length - 1].agent} · ${_execLog[_execLog.length - 1].ts}` : "Press play to start"}
              </span>
            </div>
            <div class="cd-office-summary-card">
              <span class="cd-office-summary-card__label">Active</span>
              <span class="cd-office-summary-card__title">${_agents.filter((a) => a.status === "working" || a.status === "thinking").length} agents working</span>
              <span class="cd-office-summary-card__detail">${_messages.length} messages in flight · ${_canvasBubbles.length} outputs visible</span>
            </div>
            <div class="cd-office-summary-card ${_agents.some((a) => a.status === "crashed") ? "cd-office-summary-card--danger" : ""}">
              <span class="cd-office-summary-card__label">Blocked</span>
              <span class="cd-office-summary-card__title">
                ${_agents.find((a) => a.status === "crashed") ? `${_agents.find((a) => a.status === "crashed")?.name} crashed` : "No active blocker"}
              </span>
              <span class="cd-office-summary-card__detail">
                ${_agents.find((a) => a.status === "crashed") ? "Awaiting supervisor restart or human review" : "All paths clear"}
              </span>
            </div>
          </div>
        </div>

        <!-- RIGHT: execution panel ─────────────────────────────────── -->
        <div class="cd-office-panel">

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
            <button class="cd-office-panel__tab ${_rightTab === "human" ? "cd-office-panel__tab--active" : ""}"
              @click=${() => {
                _rightTab = "human";
              }}>👤 Talk to Company</button>
          </div>

          <!-- Execution Log tab — with per-agent filter -->
          ${
            _rightTab === "log"
              ? html`
            <!-- Agent filter row -->
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
                  ${a.emoji} ${a.name}
                </button>
              `,
              )}
            </div>
            <div class="cd-office-log">
              ${[..._execLog]
                .filter((e) => _logAgentFilter === "all" || e.agent === _logAgentFilter)
                .toReversed()
                .map(
                  (entry) => html`
                <div class="cd-log-entry ${logTypeClass(entry.type)}">
                  <div class="cd-log-entry__header">
                    <span class="cd-log-entry__icon">${logTypeIcon(entry.type)}</span>
                    <span class="cd-log-entry__agent">${entry.agentEmoji} ${entry.agent}</span>
                    <span class="cd-log-entry__ts">${entry.ts}</span>
                    ${entry.tokens ? html`<span class="cd-log-entry__tokens">${(entry.tokens / 1000).toFixed(1)}K tk</span>` : ""}
                    ${entry.duration ? html`<span class="cd-log-entry__duration">${entry.duration}ms</span>` : ""}
                  </div>
                  <div class="cd-log-entry__content">${entry.content}</div>
                </div>
              `,
                )}
            </div>
          `
              : ""
          }

          <!-- Outputs tab -->
          ${
            _rightTab === "output"
              ? html`
            <div class="cd-office-outputs">
              ${_execLog
                .filter((e) => e.type === "output")
                .toReversed()
                .map(
                  (entry) => html`
                <div class="cd-output-card">
                  <div class="cd-output-card__header">
                    <span>${entry.agentEmoji} ${entry.agent}</span>
                    <span class="cd-output-card__ts">${entry.ts}</span>
                    ${entry.tokens ? html`<span class="cd-log-entry__tokens">${(entry.tokens / 1000).toFixed(1)}K tk</span>` : ""}
                  </div>
                  <div class="cd-output-card__content">${entry.content}</div>
                  <div class="cd-output-card__actions">
                    <button class="cd-btn cd-btn--ghost cd-btn--xs">📋 Copy</button>
                    <button class="cd-btn cd-btn--ghost cd-btn--xs">✅ Approve</button>
                    <button class="cd-btn cd-btn--ghost cd-btn--xs">↩ Revise</button>
                  </div>
                </div>
              `,
                )}
              ${
                _execLog.filter((e) => e.type === "output").length === 0
                  ? html`
                      <div class="cd-office-empty">No outputs yet — agents are working…</div>
                    `
                  : ""
              }
            </div>
          `
              : ""
          }

          <!-- Talk to Company tab -->
          ${
            _rightTab === "human"
              ? html`
            <div class="cd-office-human">
              <div class="cd-human-desc">
                Send a message to your company. The relevant agent(s) will receive and respond to your instruction.
              </div>
              <label class="cd-form-label">Message to Company</label>
              <textarea class="cd-form-textarea" rows="4"
                placeholder="Type your instruction, question, or strategic directive…"
                .value=${_humanInput}
                @input=${(e: Event) => {
                  _humanInput = (e.target as HTMLTextAreaElement).value;
                }}></textarea>
              <div class="cd-human-actions">
                <button class="cd-btn cd-btn--primary" @click=${() => {
                  if (!_humanInput.trim()) {
                    return;
                  }
                  const msg = _humanInput.trim();
                  addLog("human", "👤", "human", `[Founder] ${msg}`);
                  const founderAgent = _agents.find((a) => a.id === "ai-director");
                  if (founderAgent) {
                    founderAgent.activity = "Processing founder input";
                    founderAgent.status = "thinking";
                  }
                  // Send to real backend if connected
                  if (_onSendMessage) {
                    _onSendMessage(msg);
                  }
                  _humanInput = "";
                }}>📨 Send</button>
                <button class="cd-btn cd-btn--outline" @click=${() => {
                  _isPaused = true;
                  addLog("human", "👤", "system", "[Founder] Fleet paused.");
                }}>⏸ Pause Fleet</button>
                <button class="cd-btn cd-btn--outline" @click=${() => {
                  _isPaused = false;
                  addLog("human", "👤", "system", "[Founder] Fleet resumed.");
                }}>▶ Resume</button>
              </div>

              <!-- Pending reviews -->
              <div class="cd-human-reviews">
                <div class="cd-human-reviews__title">⚠️ Pending Review (2)</div>
                <div class="cd-human-review-item">
                  <div class="cd-human-review-item__title">writing-beta → Approve blog post</div>
                  <div class="cd-human-review-item__desc">"AI Agents in 2026" — 2,480 words, ready to publish.</div>
                  <div class="cd-human-review-item__actions">
                    <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
                      addLog(
                        "human",
                        "👤",
                        "human",
                        "✅ Approved: 'AI Agents in 2026' for publish.",
                      );
                    }}>✅ Approve</button>
                    <button class="cd-btn cd-btn--outline cd-btn--sm">↩ Revise</button>
                  </div>
                </div>
                <div class="cd-human-review-item">
                  <div class="cd-human-review-item__title">code-agent → Approve deploy v1.2.0</div>
                  <div class="cd-human-review-item__desc">PR #42 merged. All tests passing.</div>
                  <div class="cd-human-review-item__actions">
                    <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
                      addLog("human", "👤", "human", "✅ Approved: production deploy v1.2.0.");
                    }}>✅ Approve</button>
                    <button class="cd-btn cd-btn--outline cd-btn--sm">⏸ Hold</button>
                  </div>
                </div>
              </div>
            </div>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;
}
