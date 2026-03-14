import { html } from "lit";
import { renderCompanyTasks } from "./company-tasks.ts";
import { renderRoleHub } from "./role-hub.ts";

// ── Sub-tab ────────────────────────────────────────────────────────────────
type OverviewTab = "profile" | "teams" | "fleet" | "roles" | "tasks" | "chats";
let _subTab: OverviewTab = "profile";

// ── Company data ───────────────────────────────────────────────────────────
type CompanyProfile = {
  id: string;
  name: string;
  tagline: string;
  founded: string;
  stage: string;
  industry: string;
  hq: string;
  mission: string;
  vision: string;
  values: { emoji: string; label: string; desc: string }[];
  businessModel: string;
  currentFocus: string[];
};

let _companies: CompanyProfile[] = [
  {
    id: "acme",
    name: "Acme AI Corp",
    tagline: "One founder. One fleet. Full output.",
    founded: "2025",
    stage: "Seed",
    industry: "AI Infrastructure",
    hq: "San Francisco, CA (remote-first)",
    mission: `Build the world's first self-operating AI company — where a single human founder delegates all execution to a supervised fleet of specialized AI agents, retaining only strategy, ethics review, and final approval rights.`,
    vision: `Every entrepreneur on Earth running a profitable company powered entirely by their own curated agent fleet, with zero operational overhead.`,
    values: [
      { emoji: "⚡", label: "Speed", desc: "Ship every day. Agents never sleep." },
      { emoji: "🎯", label: "Focus", desc: "One north star. No distractions." },
      { emoji: "🔍", label: "Transparency", desc: "Every decision logged and auditable." },
      { emoji: "🔄", label: "Resilience", desc: "Crash, recover, keep running." },
    ],
    businessModel: `B2B SaaS — tiered subscriptions based on agent seats and compute credits. Enterprise plans include custom agent fleet configuration, dedicated supervision infrastructure, and human-in-the-loop SLA guarantees.`,
    currentFocus: [
      "Launch content pipeline product (Q1 2026)",
      "Close seed round — $3M target",
      "Onboard first 10 design-partner companies",
      "Build MCP marketplace integration",
    ],
  },
];

let _activeCompanyId = "acme";
let _editing = false;
let _editDraft: CompanyProfile | null = null;
let _showNewCompanyForm = false;
let _newCompanyName = "";
let _newCompanyIndustry = "";
let _newCompanyStage = "Pre-seed";

// ── Agent data (lifecycle + trace) ────────────────────────────────────────
type AgentLifecycleState = "created" | "running" | "paused" | "crashed" | "archived";

type AgentRecord = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  team: string;
  model: string;
  color: string;
  status: AgentLifecycleState;
  // Lifecycle
  createdAt: string;
  lastActiveAt: string;
  totalTasksCompleted: number;
  totalTokensUsed: number;
  uptimePct: number;
  // Workspace
  currentWorkspace: string;
  currentApp: string;
  currentUrl: string;
  // Privileges
  tools: string[];
  skills: string[];
  computeBudget: string;
  memoryAccess: "read" | "read-write" | "none";
  networkAccess: boolean;
  fileAccess: string[];
  // State chain (high-level trace summary)
  stateChain: { ts: string; state: string; note: string }[];
  // Recent messages
  recentMessages: { ts: string; from: string; content: string }[];
};

const AGENTS: AgentRecord[] = [
  {
    id: "founder-ai",
    name: "Founder AI",
    emoji: "👑",
    role: "CEO / Founder",
    team: "Executive",
    model: "claude-opus-4-5",
    color: "#ff5c5c",
    status: "running",
    createdAt: "2026-01-05 09:00",
    lastActiveAt: "just now",
    totalTasksCompleted: 214,
    totalTokensUsed: 8_420_000,
    uptimePct: 99.1,
    currentWorkspace: "Dashboard · Company Overview",
    currentApp: "ClawDock Control",
    currentUrl: "/company",
    tools: ["company-dashboard", "task-manager", "send-message"],
    skills: ["strategic-planning", "fundraising", "hiring"],
    computeBudget: "unlimited",
    memoryAccess: "read-write",
    networkAccess: true,
    fileAccess: ["/company/*", "/shared/*"],
    stateChain: [
      { ts: "09:41", state: "system:boot", note: "Agent initialized, context loaded" },
      { ts: "09:42", state: "thinking", note: "Reading Q1 OKR report from ops-prime" },
      { ts: "09:44", state: "working", note: "Composing strategy brief for content-director" },
      { ts: "09:47", state: "messaging", note: "Sent strategy brief → content-director" },
      { ts: "09:48", state: "idle:waiting", note: "Waiting for CMO response" },
      { ts: "09:51", state: "working", note: "Reviewing PR #42 diff (code-agent)" },
      { ts: "09:53", state: "human:paused", note: "Operator stopped for context review" },
      { ts: "09:54", state: "running", note: "Resumed after human override" },
    ],
    recentMessages: [
      { ts: "09:47", from: "→ content-director", content: "📋 Strategy brief for Q1 content push" },
      { ts: "09:48", from: "← ops-prime", content: "📊 OKR report Q1 — 87% target complete" },
      { ts: "09:52", from: "← code-agent", content: "💻 PR #42 ready for review" },
    ],
  },
  {
    id: "ops-prime",
    name: "Ops Prime",
    emoji: "🏢",
    role: "COO",
    team: "Executive",
    model: "claude-opus-4-5",
    color: "#60a5fa",
    status: "running",
    createdAt: "2026-01-05 09:00",
    lastActiveAt: "2m ago",
    totalTasksCompleted: 189,
    totalTokensUsed: 5_100_000,
    uptimePct: 98.4,
    currentWorkspace: "OKR Dashboard",
    currentApp: "Internal Analytics",
    currentUrl: "/analytics/okr",
    tools: ["task-manager", "send-message", "calendar"],
    skills: ["operations", "project-management", "reporting"],
    computeBudget: "500K tokens/day",
    memoryAccess: "read-write",
    networkAccess: true,
    fileAccess: ["/ops/*", "/shared/*"],
    stateChain: [
      { ts: "09:40", state: "working", note: "Generating Q1 OKR report" },
      { ts: "09:45", state: "messaging", note: "Sent OKR report → founder-ai" },
      { ts: "09:46", state: "working", note: "Delegating deploy task to code-agent" },
      { ts: "09:50", state: "idle:waiting", note: "Waiting for code-agent test results" },
    ],
    recentMessages: [
      { ts: "09:45", from: "→ founder-ai", content: "📊 Q1 OKR report filed" },
      { ts: "09:46", from: "→ code-agent", content: "⚙️ Deploy task: v1.2.0 to staging" },
    ],
  },
  {
    id: "research-alpha",
    name: "Research Alpha",
    emoji: "🔍",
    role: "Researcher",
    team: "Content",
    model: "claude-opus-4-5",
    color: "#f97316",
    status: "running",
    createdAt: "2026-01-10 14:00",
    lastActiveAt: "30s ago",
    totalTasksCompleted: 142,
    totalTokensUsed: 12_800_000,
    uptimePct: 97.2,
    currentWorkspace: "Web Research",
    currentApp: "Browser (headless)",
    currentUrl: "perplexity.ai",
    tools: ["web-search", "read-url", "save-note"],
    skills: ["research", "data-extraction", "summarization"],
    computeBudget: "1M tokens/day",
    memoryAccess: "read-write",
    networkAccess: true,
    fileAccess: ["/research/*", "/shared/data/*"],
    stateChain: [
      { ts: "09:41", state: "working", note: "Received task: competitor pricing research" },
      { ts: "09:41", state: "tool:web_search", note: "Query: 'AI SaaS pricing 2026 comparison'" },
      { ts: "09:42", state: "thinking", note: "Analyzing 18 sources, extracting pricing tiers" },
      { ts: "09:43", state: "output", note: "Sent research findings → writing-beta" },
    ],
    recentMessages: [
      { ts: "09:41", from: "← content-director", content: "🔍 Task: Competitor pricing analysis" },
      { ts: "09:43", from: "→ writing-beta", content: "📄 Research: 18 sources, pricing matrix" },
    ],
  },
  {
    id: "code-agent",
    name: "Code Agent",
    emoji: "💻",
    role: "Software Engineer",
    team: "DevOps",
    model: "claude-opus-4-5",
    color: "#22c55e",
    status: "running",
    createdAt: "2026-01-08 11:00",
    lastActiveAt: "1m ago",
    totalTasksCompleted: 98,
    totalTokensUsed: 9_300_000,
    uptimePct: 99.8,
    currentWorkspace: "GitHub / VSCode",
    currentApp: "Code Editor (headless)",
    currentUrl: "github.com/acme-ai/core/pull/42",
    tools: ["bash", "read-file", "write-file", "github-pr", "run-tests"],
    skills: ["typescript", "node", "testing", "ci-cd"],
    computeBudget: "800K tokens/day",
    memoryAccess: "read-write",
    networkAccess: true,
    fileAccess: ["/repo/*"],
    stateChain: [
      { ts: "09:42", state: "working", note: "Running test suite npm run test --coverage" },
      { ts: "09:42", state: "tool:bash", note: "142 passed, 2 failed — MCP retry + auth token" },
      { ts: "09:43", state: "thinking", note: "Diagnosing failures: timeout + 401 response" },
      { ts: "09:44", state: "working", note: "Fixing retry logic in mcp-client.ts" },
      { ts: "09:46", state: "output", note: "PR #42 opened — awaiting ops-prime approval" },
    ],
    recentMessages: [
      { ts: "09:42", from: "← ops-prime", content: "⚙️ Deploy task: prepare v1.2.0" },
      { ts: "09:46", from: "→ ops-prime", content: "💻 PR #42 ready, all tests green" },
    ],
  },
  {
    id: "review-gamma",
    name: "Reviewer",
    emoji: "📝",
    role: "Content Reviewer",
    team: "Content",
    model: "claude-haiku-4-5",
    color: "#ef4444",
    status: "crashed",
    createdAt: "2026-02-01 10:00",
    lastActiveAt: "8m ago",
    totalTasksCompleted: 44,
    totalTokensUsed: 1_200_000,
    uptimePct: 78.3,
    currentWorkspace: "—",
    currentApp: "—",
    currentUrl: "—",
    tools: ["read-file", "write-file", "send-message"],
    skills: ["editing", "seo", "fact-checking"],
    computeBudget: "200K tokens/day",
    memoryAccess: "read",
    networkAccess: false,
    fileAccess: ["/content/drafts/*"],
    stateChain: [
      { ts: "09:38", state: "working", note: "Reviewing draft: 'AI Agents in 2026'" },
      { ts: "09:39", state: "thinking", note: "Checking SEO score and fact-check sources" },
      { ts: "09:40", state: "error:crash", note: "Context window exceeded (128K limit hit)" },
      { ts: "09:40", state: "system:restart", note: "Supervisor restart attempt 1/3" },
      { ts: "09:41", state: "error:crash", note: "Restart failed — same context too large" },
      { ts: "09:41", state: "system:restart", note: "Supervisor restart attempt 2/3 (pending)" },
    ],
    recentMessages: [
      { ts: "09:38", from: "← writing-beta", content: "✍️ Draft ready for review" },
      { ts: "09:40", from: "→ supervisor", content: "❌ CRASH: context window exceeded" },
    ],
  },
];

let _selectedAgentId: string | null = null;
let _agentDetailTab: "trace" | "messages" | "privileges" = "trace";

// ── Helpers ────────────────────────────────────────────────────────────────
function statusColor(s: AgentLifecycleState) {
  switch (s) {
    case "running":
      return "var(--ok)";
    case "paused":
      return "#f59e0b";
    case "crashed":
      return "var(--destructive)";
    case "archived":
      return "var(--muted-foreground)";
    default:
      return "var(--muted-foreground)";
  }
}

function stateColor(state: string) {
  if (state.startsWith("error") || state.startsWith("crash")) {
    return "#ef4444";
  }
  if (state.startsWith("output") || state === "running") {
    return "var(--ok)";
  }
  if (state.startsWith("tool")) {
    return "#a78bfa";
  }
  if (state.startsWith("thinking")) {
    return "#60a5fa";
  }
  if (state.startsWith("human")) {
    return "#f59e0b";
  }
  if (state.startsWith("system")) {
    return "var(--muted-foreground)";
  }
  return "var(--text-strong)";
}

function startEdit(co: CompanyProfile) {
  _editing = true;
  _editDraft = {
    ...co,
    values: co.values.map((v) => ({ ...v })),
    currentFocus: [...co.currentFocus],
  };
}
function saveEdit() {
  if (!_editDraft) {
    return;
  }
  const idx = _companies.findIndex((c) => c.id === _editDraft!.id);
  if (idx >= 0) {
    _companies[idx] = { ..._editDraft };
  }
  _editing = false;
  _editDraft = null;
}
function cancelEdit() {
  _editing = false;
  _editDraft = null;
}
function createCompany() {
  if (!_newCompanyName.trim()) {
    return;
  }
  const id = `company-${Date.now()}`;
  _companies.push({
    id,
    name: _newCompanyName.trim(),
    tagline: "Building the future with AI.",
    founded: new Date().getFullYear().toString(),
    stage: _newCompanyStage,
    industry: _newCompanyIndustry || "Technology",
    hq: "Remote",
    mission: "Define your company mission here.",
    vision: "Define your company vision here.",
    values: [
      { emoji: "⚡", label: "Speed", desc: "Move fast." },
      { emoji: "🎯", label: "Quality", desc: "Ship with quality." },
    ],
    businessModel: "Describe your business model.",
    currentFocus: ["Define your first priority"],
  });
  _activeCompanyId = id;
  _showNewCompanyForm = false;
  _newCompanyName = "";
}

// ── Agent detail panel ─────────────────────────────────────────────────────
function renderAgentDetail(agent: AgentRecord) {
  return html`
    <div class="cd-agent-detail">
      <!-- Header -->
      <div class="cd-agent-detail__header" style="border-left:3px solid ${agent.color}">
        <div class="cd-agent-detail__avatar">${agent.emoji}</div>
        <div class="cd-agent-detail__meta">
          <div class="cd-agent-detail__name">${agent.name}</div>
          <div class="cd-agent-detail__role">${agent.role} · ${agent.team}</div>
          <div class="cd-agent-detail__badges">
            <span class="cd-ad-badge" style="background:${statusColor(agent.status)}22;color:${statusColor(agent.status)};border-color:${statusColor(agent.status)}44">
              ${agent.status}
            </span>
            <span class="cd-ad-badge cd-ad-badge--model">${agent.model}</span>
          </div>
        </div>
        <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
          _selectedAgentId = null;
        }}>✕</button>
      </div>

      <!-- Quick stats row -->
      <div class="cd-agent-detail__stats">
        <div class="cd-ad-stat">
          <div class="cd-ad-stat__val">${agent.totalTasksCompleted}</div>
          <div class="cd-ad-stat__label">Tasks done</div>
        </div>
        <div class="cd-ad-stat">
          <div class="cd-ad-stat__val">${(agent.totalTokensUsed / 1_000_000).toFixed(1)}M</div>
          <div class="cd-ad-stat__label">Tokens used</div>
        </div>
        <div class="cd-ad-stat">
          <div class="cd-ad-stat__val">${agent.uptimePct}%</div>
          <div class="cd-ad-stat__label">Uptime</div>
        </div>
        <div class="cd-ad-stat">
          <div class="cd-ad-stat__val">${agent.lastActiveAt}</div>
          <div class="cd-ad-stat__label">Last active</div>
        </div>
      </div>

      <!-- Workspace row -->
      <div class="cd-agent-detail__workspace">
        <span class="cd-ad-ws-label">📍 Workspace</span>
        <span class="cd-ad-ws-val">${agent.currentWorkspace}</span>
        ${agent.currentApp !== "—" ? html`<span class="cd-ad-ws-app">${agent.currentApp}</span>` : ""}
        ${agent.currentUrl !== "—" ? html`<span class="cd-ad-ws-url">${agent.currentUrl}</span>` : ""}
      </div>

      <!-- Detail tabs -->
      <div class="cd-agent-detail__tabs">
        ${(["trace", "messages", "privileges"] as const).map(
          (t) => html`
          <button class="cd-agent-detail__tab ${_agentDetailTab === t ? "cd-agent-detail__tab--active" : ""}"
            @click=${() => {
              _agentDetailTab = t;
            }}>
            ${{ trace: "🔗 State Chain", messages: "💬 Messages", privileges: "🔐 Privileges" }[t]}
          </button>
        `,
        )}
      </div>

      <!-- State chain tab -->
      ${
        _agentDetailTab === "trace"
          ? html`
        <div class="cd-agent-detail__trace">
          ${agent.stateChain.map(
            (step, i) => html`
            <div class="cd-trace-step">
              <div class="cd-trace-step__connector ${i === 0 ? "cd-trace-step__connector--first" : ""}">
                <div class="cd-trace-step__dot" style="background:${stateColor(step.state)}"></div>
                ${
                  i < agent.stateChain.length - 1
                    ? html`
                        <div class="cd-trace-step__line"></div>
                      `
                    : ""
                }
              </div>
              <div class="cd-trace-step__body">
                <div class="cd-trace-step__header">
                  <span class="cd-trace-step__state" style="color:${stateColor(step.state)}">${step.state}</span>
                  <span class="cd-trace-step__ts">${step.ts}</span>
                </div>
                <div class="cd-trace-step__note">${step.note}</div>
              </div>
            </div>
          `,
          )}
        </div>
      `
          : ""
      }

      <!-- Messages tab -->
      ${
        _agentDetailTab === "messages"
          ? html`
        <div class="cd-agent-detail__msgs">
          ${agent.recentMessages.map(
            (msg) => html`
            <div class="cd-ad-msg ${msg.from.startsWith("→") ? "cd-ad-msg--out" : "cd-ad-msg--in"}">
              <div class="cd-ad-msg__meta">
                <span class="cd-ad-msg__dir">${msg.from}</span>
                <span class="cd-ad-msg__ts">${msg.ts}</span>
              </div>
              <div class="cd-ad-msg__content">${msg.content}</div>
            </div>
          `,
          )}
          ${
            agent.recentMessages.length === 0
              ? html`
                  <div class="cd-office-empty">No messages yet.</div>
                `
              : ""
          }
        </div>
      `
          : ""
      }

      <!-- Privileges tab -->
      ${
        _agentDetailTab === "privileges"
          ? html`
        <div class="cd-agent-detail__privs">
          <div class="cd-priv-section">
            <div class="cd-priv-section__title">🔧 Tools</div>
            <div class="cd-priv-tags">
              ${agent.tools.map((t) => html`<span class="cd-priv-tag cd-priv-tag--tool">${t}</span>`)}
            </div>
          </div>
          <div class="cd-priv-section">
            <div class="cd-priv-section__title">⚡ Skills</div>
            <div class="cd-priv-tags">
              ${agent.skills.map((s) => html`<span class="cd-priv-tag cd-priv-tag--skill">${s}</span>`)}
            </div>
          </div>
          <div class="cd-priv-section">
            <div class="cd-priv-section__title">💎 Compute</div>
            <div class="cd-priv-row">
              <span>Budget</span><span class="cd-priv-val">${agent.computeBudget}</span>
            </div>
            <div class="cd-priv-row">
              <span>Memory</span><span class="cd-priv-val">${agent.memoryAccess}</span>
            </div>
            <div class="cd-priv-row">
              <span>Network</span>
              <span class="cd-priv-val" style="color:${agent.networkAccess ? "var(--ok)" : "var(--destructive)"}">
                ${agent.networkAccess ? "✅ Allowed" : "❌ Blocked"}
              </span>
            </div>
          </div>
          <div class="cd-priv-section">
            <div class="cd-priv-section__title">📁 File Access</div>
            <div class="cd-priv-tags">
              ${agent.fileAccess.map((f) => html`<span class="cd-priv-tag cd-priv-tag--file">${f}</span>`)}
            </div>
          </div>
          <div class="cd-priv-section">
            <div class="cd-priv-section__title">🔀 Lifecycle Controls</div>
            <div class="cd-priv-actions">
              <button class="cd-btn cd-btn--outline cd-btn--sm">⏸ Pause</button>
              <button class="cd-btn cd-btn--outline cd-btn--sm">🔄 Restart</button>
              <button class="cd-btn cd-btn--outline cd-btn--sm">🔀 Split</button>
              <button class="cd-btn cd-btn--outline cd-btn--sm">🔗 Merge</button>
              <button class="cd-btn cd-btn--outline cd-btn--sm">↩ Backtrack</button>
              <button class="cd-btn cd-btn--destructive cd-btn--sm">🗃 Archive</button>
            </div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ── Sub-tab: Agent Status (renamed from Fleet) ────────────────────────────
function renderFleet() {
  return html`
    <div class="cd-fleet-view">
      <div class="cd-fleet-header">
        <span class="cd-fleet-header__title">Agent Status</span>
        <span class="cd-fleet-header__sub"
          >${AGENTS.length} agents · ${AGENTS.filter((a) => a.status === "running").length} running ·
          ${AGENTS.filter((a) => a.status === "paused").length} paused ·
          ${AGENTS.filter((a) => a.status === "crashed").length} crashed</span
        >
        <button class="cd-btn cd-btn--primary cd-btn--sm">+ New Agent</button>
      </div>
      <div class="cd-fleet-table">
        <div class="cd-fleet-thead">
          <span>Agent</span><span>Role / Team</span><span>Current Workspace</span><span>Status</span><span>Tasks</span><span>Tokens</span><span>Uptime</span><span>Last Active</span>
        </div>
        ${AGENTS.map(
          (a) => html`
          <div
            class="cd-fleet-row ${_selectedAgentId === a.id ? "cd-fleet-row--selected" : ""}"
            @click=${() => {
              _selectedAgentId = _selectedAgentId === a.id ? null : a.id;
              _agentDetailTab = "trace";
            }}
          >
            <span class="cd-fleet-agent">
              <span class="cd-fleet-dot" style="background:${statusColor(a.status)}"></span>
              ${a.emoji} <strong>${a.name}</strong>
            </span>
            <span class="cd-muted" style="font-size:12px">${a.role}<br /><span style="font-size:10px;opacity:.6">${a.team}</span></span>
            <span class="cd-muted cd-mono" style="font-size:11px">${a.currentWorkspace}</span>
            <span
              class="cd-ad-badge"
              style="background:${statusColor(a.status)}22;color:${statusColor(a.status)};border-color:${statusColor(a.status)}44"
              >${a.status}</span
            >
            <span>${a.totalTasksCompleted}</span>
            <span>${(a.totalTokensUsed / 1_000_000).toFixed(1)}M</span>
            <span>${a.uptimePct}%</span>
            <span class="cd-muted" style="font-size:11px">${a.lastActiveAt}</span>
          </div>
          ${
            _selectedAgentId === a.id
              ? html`
                <div class="cd-fleet-row-detail">${renderAgentDetail(a)}</div>
              `
              : ""
          }
        `,
        )}
      </div>
    </div>
  `;
}

// ── Sub-tab stubs ──────────────────────────────────────────────────────────
function renderTeams() {
  // Team definitions with supervision strategies, members, KPIs
  const TEAMS = [
    {
      id: "executive",
      name: "Executive Suite",
      icon: "👑",
      color: "#ff5c5c",
      strategy: "singleton",
      strategyDesc: "Each agent is unique; crashes restart only that agent.",
      lead: "founder-ai",
      leadEmoji: "👑",
      members: [
        {
          id: "founder-ai",
          emoji: "👑",
          name: "Founder AI",
          role: "CEO",
          status: "running" as const,
        },
        {
          id: "ops-prime",
          emoji: "🧑‍💼",
          name: "Ops Prime",
          role: "COO",
          status: "running" as const,
        },
        {
          id: "nanoclaw-primary",
          emoji: "🤖",
          name: "NanoClaw",
          role: "Executive Assistant",
          status: "paused" as const,
        },
      ],
      kpis: { tasksThisWeek: 42, avgResponseTime: "1.2s", uptime: "99.1%", tokensUsed: "8.4M" },
      healthStatus: "healthy" as const,
      description:
        "Sets company strategy, oversees all departments, and handles human↔fleet communication.",
    },
    {
      id: "content",
      name: "Content Pipeline",
      icon: "✍️",
      color: "#fb923c",
      strategy: "one-for-one",
      strategyDesc: "One agent crashes → only that agent restarts. Others unaffected.",
      lead: "content-director",
      leadEmoji: "📢",
      members: [
        {
          id: "content-director",
          emoji: "📢",
          name: "CMO",
          role: "Content Director",
          status: "running" as const,
        },
        {
          id: "research-alpha",
          emoji: "🔍",
          name: "Research Alpha",
          role: "Researcher",
          status: "running" as const,
        },
        {
          id: "writing-beta",
          emoji: "✍️",
          name: "Writing Beta",
          role: "Writer",
          status: "running" as const,
        },
        {
          id: "review-gamma",
          emoji: "🧐",
          name: "Reviewer",
          role: "Content Reviewer",
          status: "crashed" as const,
        },
      ],
      kpis: { tasksThisWeek: 28, avgResponseTime: "3.8s", uptime: "82.4%", tokensUsed: "21.6M" },
      healthStatus: "degraded" as const,
      description:
        "Runs the full content production pipeline: research → draft → review → publish.",
    },
    {
      id: "devops",
      name: "DevOps",
      icon: "⚙️",
      color: "#22c55e",
      strategy: "rest-for-one",
      strategyDesc:
        "One crashes → all downstream dependents restart. Preserves pipeline integrity.",
      lead: "code-agent",
      leadEmoji: "💻",
      members: [
        {
          id: "code-agent",
          emoji: "💻",
          name: "Code Agent",
          role: "Software Engineer",
          status: "running" as const,
        },
        {
          id: "test-runner",
          emoji: "🧪",
          name: "Test Runner",
          role: "QA Engineer",
          status: "paused" as const,
        },
      ],
      kpis: { tasksThisWeek: 19, avgResponseTime: "4.1s", uptime: "99.8%", tokensUsed: "9.3M" },
      healthStatus: "healthy" as const,
      description: "Manages codebase, CI/CD pipeline, deployments, and automated test coverage.",
    },
  ];

  const statusC = (s: string) => {
    if (s === "running") {
      return "var(--ok)";
    }
    if (s === "crashed") {
      return "var(--destructive)";
    }
    if (s === "paused") {
      return "#f59e0b";
    }
    return "var(--muted-foreground)";
  };

  const healthBadge = (h: "healthy" | "degraded") =>
    h === "healthy"
      ? html`
          <span
            class="cd-ad-badge"
            style="
              background: rgba(34, 197, 94, 0.12);
              color: var(--ok);
              border-color: rgba(34, 197, 94, 0.3);
            "
            >✅ Healthy</span
          >
        `
      : html`
          <span
            class="cd-ad-badge"
            style="
              background: rgba(245, 158, 11, 0.12);
              color: #f59e0b;
              border-color: rgba(245, 158, 11, 0.3);
            "
            >⚠️ Degraded</span
          >
        `;

  const strategyBadge = (s: string) => {
    const map: Record<string, string> = {
      "one-for-one": "#60a5fa",
      "one-for-all": "#f97316",
      "rest-for-one": "#a78bfa",
      singleton: "var(--muted-foreground)",
    };
    return html`<span class="cd-ad-badge" style="background:${map[s] ?? "var(--border)"}20;color:${map[s] ?? "var(--muted-foreground)"};border-color:${map[s] ?? "var(--border)"}40">${s}</span>`;
  };

  return html`
    <div class="cd-teams-view">
      <div class="cd-teams-header">
        <span class="cd-teams-header__title">Teams</span>
        <span class="cd-teams-header__sub">${TEAMS.length} teams · ${TEAMS.reduce((n, t) => n + t.members.length, 0)} agents total</span>
        <button class="cd-btn cd-btn--primary cd-btn--sm">+ New Team</button>
      </div>
      <div class="cd-teams-grid">
        ${TEAMS.map(
          (team) => html`
          <div class="cd-team-card" style="border-top-color:${team.color}">
            <div class="cd-team-card__header">
              <span class="cd-team-card__icon">${team.icon}</span>
              <div class="cd-team-card__meta">
                <div class="cd-team-card__name">${team.name}</div>
                <div class="cd-team-card__badges">
                  ${strategyBadge(team.strategy)}
                  ${healthBadge(team.healthStatus)}
                </div>
              </div>
            </div>
            <div class="cd-team-card__desc">${team.description}</div>
            <div class="cd-team-card__strategy-info">
              <span class="cd-team-card__strategy-label">Supervision strategy</span>
              <span class="cd-team-card__strategy-desc">${team.strategyDesc}</span>
            </div>
            <!-- KPIs -->
            <div class="cd-team-kpis">
              <div class="cd-team-kpi"><div class="cd-team-kpi__val">${team.kpis.tasksThisWeek}</div><div class="cd-team-kpi__label">Tasks this week</div></div>
              <div class="cd-team-kpi"><div class="cd-team-kpi__val">${team.kpis.avgResponseTime}</div><div class="cd-team-kpi__label">Avg response</div></div>
              <div class="cd-team-kpi"><div class="cd-team-kpi__val">${team.kpis.uptime}</div><div class="cd-team-kpi__label">Uptime</div></div>
              <div class="cd-team-kpi"><div class="cd-team-kpi__val">${team.kpis.tokensUsed}</div><div class="cd-team-kpi__label">Tokens used</div></div>
            </div>
            <!-- Members -->
            <div class="cd-team-card__members-title">Members (${team.members.length})</div>
            <div class="cd-team-members">
              ${team.members.map(
                (m) => html`
                <div class="cd-team-member">
                  <span class="cd-fleet-dot" style="background:${statusC(m.status)}"></span>
                  <span class="cd-team-member__avatar">${m.emoji}</span>
                  <span class="cd-team-member__name">${m.name}</span>
                  <span class="cd-team-member__role">${m.role}</span>
                  <span class="cd-ad-badge" style="font-size:10px;background:${statusC(m.status)}18;color:${statusC(m.status)};border-color:${statusC(m.status)}35">${m.status}</span>
                </div>
              `,
              )}
            </div>
          </div>
        `,
        )}
      </div>
    </div>
  `;
}
function renderRoles() {
  return renderRoleHub({});
}
function renderTasks() {
  return renderCompanyTasks({});
}
function renderChats() {
  const CHAT_LOG = [
    {
      ts: "09:54",
      from: "👤 Founder",
      to: "👑 founder-ai",
      content: "[Human override] Hold restart — check if context window exceeded first.",
      type: "human",
    },
    {
      ts: "09:47",
      from: "👑 founder-ai",
      to: "📣 content-director",
      content:
        "📋 Strategy brief for Q1 content push — prioritize AI use-case blog and pricing page rewrite.",
      type: "out",
    },
    {
      ts: "09:47",
      from: "📣 content-director",
      to: "🔍 research-alpha",
      content:
        "🔍 Task: Competitor pricing analysis — focus on 10 top AI SaaS players, extract pricing tiers.",
      type: "out",
    },
    {
      ts: "09:48",
      from: "🏢 ops-prime",
      to: "👑 founder-ai",
      content:
        "📊 Q1 OKR report filed — 87% target completion. 2 red items: hiring (delayed) and churn (+1.2%).",
      type: "in",
    },
    {
      ts: "09:46",
      from: "💻 code-agent",
      to: "🏢 ops-prime",
      content:
        "💻 PR #42 ready — MCP retry fix + auth token refresh. All 142 tests passing. Requesting approval.",
      type: "in",
    },
    {
      ts: "09:43",
      from: "🔍 research-alpha",
      to: "✍️ writing-beta",
      content:
        "📄 Research complete: 18 sources, pricing matrix attached. Avg entry $49/mo, enterprise ~$2K.",
      type: "out",
    },
    {
      ts: "09:40",
      from: "📝 review-gamma",
      to: "🔔 supervisor",
      content: "❌ CRASH: Context window exceeded (128K). Supervisor restart requested.",
      type: "error",
    },
    {
      ts: "09:40",
      from: "✍️ writing-beta",
      to: "📝 review-gamma",
      content:
        "✍️ Draft ready: 'AI Agents in 2026' — 2,480 words, SEO score 84/100. Please review.",
      type: "out",
    },
  ];
  const typeColor: Record<string, string> = {
    out: "var(--border)",
    in: "rgba(34,197,94,0.3)",
    error: "rgba(239,68,68,0.3)",
    human: "rgba(245,158,11,0.3)",
  };
  return html`
    <div class="cd-chats-view">
      <div class="cd-chats-header">
        <span class="cd-chats-header__title">💬 Company Chats</span>
        <span class="cd-chats-header__sub"
          >All inter-agent messages and human overrides · ${CHAT_LOG.length} entries</span
        >
      </div>
      <div class="cd-chats-log">
        ${CHAT_LOG.map(
          (msg) => html`
          <div class="cd-chat-entry" style="border-left-color:${typeColor[msg.type] ?? "var(--border)"}">
            <div class="cd-chat-entry__meta">
              <span class="cd-chat-entry__from">${msg.from}</span>
              <span class="cd-chat-entry__arrow">→</span>
              <span class="cd-chat-entry__to">${msg.to}</span>
              <span class="cd-chat-entry__ts">${msg.ts}</span>
            </div>
            <div class="cd-chat-entry__content">${msg.content}</div>
          </div>
        `,
        )}
      </div>
    </div>
  `;
}

// ── Company profile sub-tab ────────────────────────────────────────────────
function renderProfile() {
  const co = _companies.find((c) => c.id === _activeCompanyId) ?? _companies[0];
  const draft = _editDraft ?? co;

  return html`
    <!-- Company switcher -->
    <div class="cd-co-switcher">
      ${_companies.map(
        (c) => html`
        <button class="cd-co-switch-btn ${_activeCompanyId === c.id ? "cd-co-switch-btn--active" : ""}"
          @click=${() => {
            _activeCompanyId = c.id;
            _editing = false;
          }}>
          🦀 ${c.name}
          <span class="cd-chip cd-chip--xs">${c.stage}</span>
        </button>
      `,
      )}
      <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${() => {
        _showNewCompanyForm = !_showNewCompanyForm;
      }}>
        + New Company
      </button>
    </div>

    ${
      _showNewCompanyForm
        ? html`
      <div class="cd-new-co-form">
        <input class="cd-form-input" placeholder="Company name…" .value=${_newCompanyName}
          @input=${(e: Event) => {
            _newCompanyName = (e.target as HTMLInputElement).value;
          }} />
        <input class="cd-form-input" placeholder="Industry…" .value=${_newCompanyIndustry}
          @input=${(e: Event) => {
            _newCompanyIndustry = (e.target as HTMLInputElement).value;
          }} />
        <select class="cd-form-select" @change=${(e: Event) => {
          _newCompanyStage = (e.target as HTMLSelectElement).value;
        }}>
          ${["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Public"].map((s) => html`<option>${s}</option>`)}
        </select>
        <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${createCompany}>Create</button>
        <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${() => {
          _showNewCompanyForm = false;
        }}>Cancel</button>
      </div>
    `
        : ""
    }

    <!-- Profile card -->
    <div class="cd-profile-card">
      <div class="cd-profile-card__left">
        <div class="cd-profile-card__logo">🦀</div>
        <div class="cd-profile-card__meta">
          ${
            _editing
              ? html`
            <input class="cd-edit-input cd-edit-input--title" .value=${draft.name}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.name = (e.target as HTMLInputElement).value;
                }
              }} />
            <input class="cd-edit-input" .value=${draft.tagline}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.tagline = (e.target as HTMLInputElement).value;
                }
              }} />
          `
              : html`
            <h1 class="cd-profile-card__name">${co.name}</h1>
            <p class="cd-profile-card__tag">${co.tagline}</p>
          `
          }
          <div class="cd-profile-card__chips">
            ${
              _editing
                ? html`
              <input class="cd-edit-input cd-edit-input--sm" placeholder="Stage" .value=${draft.stage}
                @input=${(e: Event) => {
                  if (_editDraft) {
                    _editDraft.stage = (e.target as HTMLInputElement).value;
                  }
                }} />
              <input class="cd-edit-input cd-edit-input--sm" placeholder="Industry" .value=${draft.industry}
                @input=${(e: Event) => {
                  if (_editDraft) {
                    _editDraft.industry = (e.target as HTMLInputElement).value;
                  }
                }} />
              <input class="cd-edit-input cd-edit-input--sm" placeholder="HQ" .value=${draft.hq}
                @input=${(e: Event) => {
                  if (_editDraft) {
                    _editDraft.hq = (e.target as HTMLInputElement).value;
                  }
                }} />
            `
                : html`
              <span class="cd-chip">${co.stage}</span>
              <span class="cd-chip">${co.industry}</span>
              <span class="cd-chip">Est. ${co.founded}</span>
              <span class="cd-chip">📍 ${co.hq}</span>
            `
            }
          </div>
        </div>
      </div>
      <div class="cd-profile-card__right">
        <div class="cd-profile-section">
          <div class="cd-profile-section__label">Mission</div>
          ${
            _editing
              ? html`
            <textarea class="cd-edit-textarea" rows="3" .value=${draft.mission}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.mission = (e.target as HTMLTextAreaElement).value;
                }
              }}></textarea>
          `
              : html`<p class="cd-profile-section__text">${co.mission}</p>`
          }
        </div>
        <div class="cd-profile-section">
          <div class="cd-profile-section__label">Vision</div>
          ${
            _editing
              ? html`
            <textarea class="cd-edit-textarea" rows="2" .value=${draft.vision}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.vision = (e.target as HTMLTextAreaElement).value;
                }
              }}></textarea>
          `
              : html`<p class="cd-profile-section__text">${co.vision}</p>`
          }
        </div>
        <div class="cd-profile-actions">
          ${
            _editing
              ? html`
            <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${saveEdit}>✅ Save</button>
            <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${cancelEdit}>Cancel</button>
          `
              : html`
            <button class="cd-btn cd-btn--outline cd-btn--sm" @click=${() => startEdit(co)}>✏️ Edit</button>
          `
          }
        </div>
      </div>
    </div>

    <!-- Values + Focus -->
    <div class="cd-overview-row">
      <div class="cd-values-card cd-card">
        <div class="cd-card__title">Core Values</div>
        <div class="cd-values-grid">
          ${co.values.map(
            (v) => html`
            <div class="cd-value-item">
              <span class="cd-value-item__emoji">${v.emoji}</span>
              <strong>${v.label}</strong>
              <span>${v.desc}</span>
            </div>
          `,
          )}
        </div>
      </div>
      <div class="cd-focus-card cd-card">
        <div class="cd-card__title">Current Focus</div>
        <ul class="cd-focus-list">
          ${co.currentFocus.map(
            (f) => html`
            <li class="cd-focus-list__item"><span class="cd-focus-list__dot"></span>${f}</li>
          `,
          )}
        </ul>
        <div class="cd-card__title" style="margin-top:14px">Business Model</div>
        <p class="cd-biz-model">${co.businessModel}</p>
      </div>
    </div>
  `;
}

// ── Main render ────────────────────────────────────────────────────────────
export type CompanyOverviewProps = Record<string, never>;

export function renderCompanyOverview(_props: CompanyOverviewProps) {
  const SUB_TABS: { id: OverviewTab; icon: string; label: string }[] = [
    { id: "profile", icon: "🦀", label: "Company" },
    { id: "fleet", icon: "🤖", label: "Agent Status" },
    { id: "teams", icon: "👥", label: "Teams" },
    { id: "roles", icon: "🎭", label: "Role Hub" },
    { id: "tasks", icon: "📋", label: "Tasks" },
    { id: "chats", icon: "💬", label: "Chats" },
  ];

  return html`
    <div class="cd-page cd-page--overview">

      <!-- Sub-navigation -->
      <div class="cd-subnav">
        ${SUB_TABS.map(
          (t) => html`
          <button class="cd-subnav__btn ${_subTab === t.id ? "cd-subnav__btn--active" : ""}"
            @click=${() => {
              _subTab = t.id;
            }}>
            ${t.icon} ${t.label}
          </button>
        `,
        )}
      </div>

      <!-- Content -->
      <div class="cd-subnav-content">
        ${_subTab === "profile" ? renderProfile() : ""}
        ${_subTab === "fleet" ? renderFleet() : ""}
        ${_subTab === "teams" ? renderTeams() : ""}
        ${_subTab === "roles" ? renderRoles() : ""}
        ${_subTab === "tasks" ? renderTasks() : ""}
        ${_subTab === "chats" ? renderChats() : ""}
      </div>
    </div>
  `;
}
