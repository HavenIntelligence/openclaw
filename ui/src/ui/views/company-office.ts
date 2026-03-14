import { html } from "lit";

// ── Types ──────────────────────────────────────────────────────────────────
type AgentStatus = "thinking" | "working" | "idle" | "crashed" | "messaging";
type Direction = "down" | "left" | "right" | "up";

type OfficeAgent = {
  id: string;
  name: string;
  role: string;
  emoji: string; // character avatar
  deskEmoji: string; // desk/work item
  x: number; // tile position
  y: number;
  targetX: number;
  targetY: number;
  status: AgentStatus;
  activity: string;
  direction: Direction;
  moveProgress: number; // 0..1 animation interpolation
  thoughtBubble: string;
  thoughtTimer: number;
  color: string;
  team: string;
  deskX: number; // home desk position
  deskY: number;
  messageTo: string | null;
  messageTimer: number;
};

// Message flying between agents
type FlyingMessage = {
  id: string;
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number; // 0..1
  emoji: string;
  label: string;
};

// ── Demo data ─────────────────────────────────────────────────────────────
const TILE = 48; // px per tile
const COLS = 18;
const ROWS = 10;

// Desk positions (tile coordinates)
const DESKS: Record<string, { x: number; y: number }> = {
  "founder-ai": { x: 8, y: 1 }, // CEO — center top
  "ops-prime": { x: 2, y: 3 }, // COO — left
  "content-director": { x: 13, y: 3 }, // CMO — right
  "nanoclaw-primary": { x: 8, y: 3 }, // PA — center
  "code-agent": { x: 1, y: 7 }, // Engineer — bottom left
  "test-runner": { x: 4, y: 7 }, // QA — bottom left
  "research-alpha": { x: 11, y: 7 }, // Researcher — bottom right
  "writing-beta": { x: 14, y: 7 }, // Writer — bottom right
  "review-gamma": { x: 16, y: 7 }, // Reviewer — bottom right
};

// Message scripts for simulation
const MESSAGE_SCRIPTS = [
  { from: "founder-ai", to: "content-director", emoji: "📋", label: "Strategy brief" },
  { from: "content-director", to: "research-alpha", emoji: "🔍", label: "Research task" },
  { from: "research-alpha", to: "writing-beta", emoji: "📄", label: "Research output" },
  { from: "writing-beta", to: "review-gamma", emoji: "✍️", label: "Draft ready" },
  { from: "founder-ai", to: "ops-prime", emoji: "📊", label: "OKR review" },
  { from: "ops-prime", to: "code-agent", emoji: "⚙️", label: "Deploy task" },
  { from: "code-agent", to: "test-runner", emoji: "💻", label: "PR ready" },
  { from: "test-runner", to: "ops-prime", emoji: "✅", label: "Tests passed" },
  { from: "nanoclaw-primary", to: "founder-ai", emoji: "💬", label: "Summary ready" },
];

const THOUGHTS: Record<string, string[]> = {
  "founder-ai": ["📈 Q2 targets...", "🧠 New strategy?", "👁️ Reviewing..."],
  "ops-prime": ["📋 Process gap...", "⚡ Optimizing...", "📊 KPIs look ok"],
  "content-director": ["🎯 Campaign ready", "📣 Reach growing", "💡 New angle!"],
  "nanoclaw-primary": ["📝 Taking notes", "🗓️ Schedule ok", "📌 Reminder set"],
  "code-agent": ["🐛 Found a bug!", "🔧 Fixing...", "✅ PR merged"],
  "test-runner": ["🧪 Running tests", "📊 89% coverage", "❌ 2 failures"],
  "research-alpha": ["🔍 Found data", "📚 Deep dive...", "💡 Insight!"],
  "writing-beta": ["✍️ First draft", "📝 Editing...", "🎉 Published!"],
  "review-gamma": ["⚡ CRASHED", "💥 Error 1", "🔴 Restarting..."],
};

const INITIAL_AGENTS: OfficeAgent[] = [
  {
    id: "founder-ai",
    name: "Founder AI",
    role: "CEO",
    emoji: "👑",
    deskEmoji: "🖥️",
    color: "#ff5c5c",
    team: "executive",
    status: "thinking",
    activity: "Setting strategy",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["founder-ai"],
    targetX: DESKS["founder-ai"].x,
    targetY: DESKS["founder-ai"].y,
    deskX: DESKS["founder-ai"].x,
    deskY: DESKS["founder-ai"].y,
  },
  {
    id: "ops-prime",
    name: "Ops Prime",
    role: "COO",
    emoji: "🏢",
    deskEmoji: "📊",
    color: "#60a5fa",
    team: "executive",
    status: "working",
    activity: "Reviewing OKRs",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["ops-prime"],
    targetX: DESKS["ops-prime"].x,
    targetY: DESKS["ops-prime"].y,
    deskX: DESKS["ops-prime"].x,
    deskY: DESKS["ops-prime"].y,
  },
  {
    id: "content-director",
    name: "CMO",
    role: "CMO",
    emoji: "📣",
    deskEmoji: "📋",
    color: "#fb923c",
    team: "content",
    status: "working",
    activity: "Planning content",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["content-director"],
    targetX: DESKS["content-director"].x,
    targetY: DESKS["content-director"].y,
    deskX: DESKS["content-director"].x,
    deskY: DESKS["content-director"].y,
  },
  {
    id: "nanoclaw-primary",
    name: "NanoClaw",
    role: "PA",
    emoji: "🤖",
    deskEmoji: "📅",
    color: "#14b8a6",
    team: "executive",
    status: "idle",
    activity: "Awaiting tasks",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["nanoclaw-primary"],
    targetX: DESKS["nanoclaw-primary"].x,
    targetY: DESKS["nanoclaw-primary"].y,
    deskX: DESKS["nanoclaw-primary"].x,
    deskY: DESKS["nanoclaw-primary"].y,
  },
  {
    id: "code-agent",
    name: "Code Agent",
    role: "Engineer",
    emoji: "💻",
    deskEmoji: "⚙️",
    color: "#22c55e",
    team: "devops",
    status: "working",
    activity: "Writing code",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["code-agent"],
    targetX: DESKS["code-agent"].x,
    targetY: DESKS["code-agent"].y,
    deskX: DESKS["code-agent"].x,
    deskY: DESKS["code-agent"].y,
  },
  {
    id: "test-runner",
    name: "Test Runner",
    role: "QA",
    emoji: "🧪",
    deskEmoji: "✅",
    color: "#4ade80",
    team: "devops",
    status: "thinking",
    activity: "Running tests",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["test-runner"],
    targetX: DESKS["test-runner"].x,
    targetY: DESKS["test-runner"].y,
    deskX: DESKS["test-runner"].x,
    deskY: DESKS["test-runner"].y,
  },
  {
    id: "research-alpha",
    name: "Researcher",
    role: "Research",
    emoji: "🔍",
    deskEmoji: "📚",
    color: "#f97316",
    team: "content",
    status: "working",
    activity: "Deep research",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["research-alpha"],
    targetX: DESKS["research-alpha"].x,
    targetY: DESKS["research-alpha"].y,
    deskX: DESKS["research-alpha"].x,
    deskY: DESKS["research-alpha"].y,
  },
  {
    id: "writing-beta",
    name: "Writer Beta",
    role: "Writer",
    emoji: "✍️",
    deskEmoji: "📝",
    color: "#fbbf24",
    team: "content",
    status: "working",
    activity: "Writing draft",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["writing-beta"],
    targetX: DESKS["writing-beta"].x,
    targetY: DESKS["writing-beta"].y,
    deskX: DESKS["writing-beta"].x,
    deskY: DESKS["writing-beta"].y,
  },
  {
    id: "review-gamma",
    name: "Reviewer",
    role: "Reviewer",
    emoji: "📝",
    deskEmoji: "🔴",
    color: "#ef4444",
    team: "content",
    status: "crashed",
    activity: "CRASHED",
    direction: "down",
    moveProgress: 0,
    thoughtBubble: "",
    thoughtTimer: 0,
    messageTo: null,
    messageTimer: 0,
    ...DESKS["review-gamma"],
    targetX: DESKS["review-gamma"].x,
    targetY: DESKS["review-gamma"].y,
    deskX: DESKS["review-gamma"].x,
    deskY: DESKS["review-gamma"].y,
  },
];

// ── Simulation state (module-level so it persists between renders) ─────────
let _agents: OfficeAgent[] = INITIAL_AGENTS.map((a) => ({ ...a }));
let _messages: FlyingMessage[] = [];
let _tick = 0;
let _msgIdCounter = 0;
let _scriptIdx = 0;
let _animFrame: number | null = null;
let _hostUpdate: (() => void) | null = null;
let _simulationStarted = false;

function spawnMessage(fromId: string, toId: string, emoji: string, label: string) {
  const from = _agents.find((a) => a.id === fromId);
  const to = _agents.find((a) => a.id === toId);
  if (!from || !to) {
    return;
  }
  _messages.push({
    id: `msg-${_msgIdCounter++}`,
    fromId,
    toId,
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

  // Advance messages
  for (const msg of _messages) {
    msg.progress += 0.025;
  }
  _messages = _messages.filter((m) => m.progress < 1.0);

  // Spawn a new message every ~3s (90 frames)
  if (_tick % 90 === 0) {
    const script = MESSAGE_SCRIPTS[_scriptIdx % MESSAGE_SCRIPTS.length];
    spawnMessage(script.from, script.to, script.emoji, script.label);
    _scriptIdx++;
    // Also set messaging status on sender
    const sender = _agents.find((a) => a.id === script.from);
    if (sender && sender.status !== "crashed") {
      sender.status = "messaging";
      sender.activity = `Sending: ${script.label}`;
    }
  }

  // Walk agents toward meeting room sometimes
  for (const agent of _agents) {
    if (agent.status === "crashed") {
      agent.thoughtBubble = THOUGHTS[agent.id]?.[_tick % 3] ?? "💥";
      continue;
    }

    // Update thought bubble every 3s
    if (_tick % 80 === Math.abs(agent.id.charCodeAt(0)) % 80) {
      const thoughts = THOUGHTS[agent.id] ?? [];
      if (thoughts.length > 0) {
        agent.thoughtBubble = thoughts[Math.floor(_tick / 80) % thoughts.length];
        agent.thoughtTimer = 120;
      }
    }
    if (agent.thoughtTimer > 0) {
      agent.thoughtTimer--;
      if (agent.thoughtTimer === 0) {
        agent.thoughtBubble = "";
      }
    }

    // Occasionally walk to meeting room (tile 8,5) and back
    if (_tick % 200 === Math.abs(agent.id.charCodeAt(2) ?? 0) % 200) {
      const goMeet = Math.random() < 0.3 && agent.status !== "messaging";
      if (goMeet) {
        agent.targetX = 7 + Math.floor(Math.random() * 3);
        agent.targetY = 5;
        agent.status = "thinking";
      } else {
        // Return to desk
        agent.targetX = agent.deskX;
        agent.targetY = agent.deskY;
        agent.status = "working";
        agent.activity = "Back at desk";
      }
    }

    // Move toward target
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      const speed = 0.06;
      agent.x += (dx / dist) * speed;
      agent.y += (dy / dist) * speed;
      // Update facing direction
      if (Math.abs(dx) > Math.abs(dy)) {
        agent.direction = dx > 0 ? "right" : "left";
      } else {
        agent.direction = dy > 0 ? "down" : "up";
      }
    } else {
      agent.x = agent.targetX;
      agent.y = agent.targetY;
    }

    // Restore messaging status after a bit
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

// ── Floor plan tiles ───────────────────────────────────────────────────────
const FLOOR_TILES = [
  // Meeting room (center)
  {
    x: 7,
    y: 4,
    w: 4,
    h: 3,
    label: "Meeting Room",
    color: "rgba(255,92,92,0.06)",
    border: "rgba(255,92,92,0.25)",
  },
  // Dev area (bottom left)
  {
    x: 0,
    y: 6,
    w: 7,
    h: 3,
    label: "Dev Area",
    color: "rgba(34,197,94,0.06)",
    border: "rgba(34,197,94,0.2)",
  },
  // Content area (bottom right)
  {
    x: 10,
    y: 6,
    w: 8,
    h: 3,
    label: "Content Area",
    color: "rgba(251,146,60,0.06)",
    border: "rgba(251,146,60,0.2)",
  },
  // Executive area (top)
  {
    x: 1,
    y: 0,
    w: 16,
    h: 3,
    label: "Executive Suite",
    color: "rgba(96,165,250,0.05)",
    border: "rgba(96,165,250,0.15)",
  },
];

const DESK_ITEMS: Array<{ x: number; y: number; emoji: string }> = Object.entries(DESKS).map(
  ([id, pos]) => {
    const agent = INITIAL_AGENTS.find((a) => a.id === id);
    return { x: pos.x, y: pos.y, emoji: agent?.deskEmoji ?? "🖥️" };
  },
);

// ── Render ─────────────────────────────────────────────────────────────────
export type CompanyOfficeProps = {
  requestUpdate?: () => void;
};

export function renderCompanyOffice(props: CompanyOfficeProps) {
  // Start the simulation loop
  if (props.requestUpdate) {
    startSimulation(props.requestUpdate);
  }

  const W = COLS * TILE;
  const H = ROWS * TILE;

  return html`
    <div class="cd-page cd-page--office">
      <!-- Top bar -->
      <div class="cd-office-bar">
        <div class="cd-office-bar__left">
          <span class="cd-office-bar__title">🏢 Live Office</span>
          <span class="cd-office-bar__sub">Real-time agent activity simulation</span>
        </div>
        <div class="cd-office-bar__chips">
          ${_agents.filter((a) => a.status !== "crashed").length} agents active
          <span class="cd-pulse cd-pulse--running"></span>
          ${_messages.length > 0 ? html`<span class="cd-office-bar__msgs">${_messages.length} messages in flight</span>` : ""}
        </div>
      </div>

      <!-- Canvas -->
      <div class="cd-office-canvas-wrap">
        <div class="cd-office-canvas" style="width:${W}px;height:${H}px">
          <!-- Floor grid (CSS background handles grid lines) -->
          <div class="cd-office-floor" style="width:${W}px;height:${H}px">

            <!-- Zone fills -->
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
              <div class="cd-office-desk-item"
                style="left:${d.x * TILE + TILE / 2 - 10}px;top:${d.y * TILE + TILE - 16}px">
                ${d.emoji}
              </div>
            `,
            )}

            <!-- Flying messages -->
            ${_messages.map((msg) => {
              const t = msg.progress;
              // Bezier interpolation for curved path
              const cpX = (msg.fromX + msg.toX) / 2;
              const cpY = Math.min(msg.fromY, msg.toY) - 60;
              const px = (1 - t) * (1 - t) * msg.fromX + 2 * (1 - t) * t * cpX + t * t * msg.toX;
              const py = (1 - t) * (1 - t) * msg.fromY + 2 * (1 - t) * t * cpY + t * t * msg.toY;
              const opacity = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) / 0.15 : 1;
              return html`
                <div class="cd-office-msg-bubble" style="left:${px - 16}px;top:${py - 16}px;opacity:${opacity}">
                  ${msg.emoji}
                  <span class="cd-office-msg-label">${msg.label}</span>
                </div>
              `;
            })}

            <!-- Agents -->
            ${_agents.map((agent) => {
              const px = agent.x * TILE;
              const py = agent.y * TILE;
              const isMoving =
                Math.abs(agent.x - agent.targetX) > 0.15 ||
                Math.abs(agent.y - agent.targetY) > 0.15;
              return html`
                <div class="cd-office-agent ${agent.status === "crashed" ? "cd-office-agent--crashed" : ""} ${isMoving ? "cd-office-agent--moving" : ""} ${agent.status === "messaging" ? "cd-office-agent--messaging" : ""}"
                  style="left:${px}px;top:${py}px;border-color:${agent.color}">
                  <!-- Avatar -->
                  <div class="cd-office-agent__avatar">${agent.emoji}</div>
                  <!-- Status indicator -->
                  <div class="cd-office-agent__status-dot" style="background:${
                    agent.status === "working" || agent.status === "thinking"
                      ? "var(--ok)"
                      : agent.status === "messaging"
                        ? "var(--accent)"
                        : agent.status === "idle"
                          ? "#f59e0b"
                          : "var(--destructive)"
                  }"></div>
                  <!-- Thought bubble -->
                  ${
                    agent.thoughtBubble
                      ? html`
                    <div class="cd-office-thought">${agent.thoughtBubble}</div>
                  `
                      : ""
                  }
                  <!-- Name tag -->
                  <div class="cd-office-agent__tag" style="background:${agent.color}20;border-color:${agent.color}40">
                    ${agent.name}
                  </div>
                  <!-- Working animation -->
                  ${
                    agent.status === "working" || agent.status === "thinking"
                      ? html`
                          <div class="cd-office-agent__work-anim"><span></span><span></span><span></span></div>
                        `
                      : ""
                  }
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
      </div>

      <!-- Activity feed -->
      <div class="cd-office-feed">
        <div class="cd-office-feed__title">Activity Feed</div>
        <div class="cd-office-feed__list">
          ${_agents
            .slice()
            .toSorted((a, b) => a.id.localeCompare(b.id))
            .map(
              (agent) => html`
            <div class="cd-office-feed__row ${agent.status === "crashed" ? "cd-office-feed__row--crashed" : ""}">
              <span class="cd-office-feed__emoji">${agent.emoji}</span>
              <span class="cd-office-feed__name">${agent.name}</span>
              <span class="cd-office-feed__activity">${agent.activity}</span>
              <span class="cd-pulse cd-pulse--${agent.status === "working" || agent.status === "thinking" ? "running" : agent.status === "crashed" ? "crashed" : agent.status === "messaging" ? "running" : "idle"}"></span>
            </div>
          `,
            )}
        </div>
      </div>
    </div>
  `;
}
