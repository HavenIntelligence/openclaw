import { html } from "lit";
import type {
  AgentMessage,
  ClawDockAgent,
  CompanyProfile as RealProfile,
  Task as RealTask,
  TeamConfig,
} from "../company-types.ts";
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

// ── Real backend data (set from props each render) ──────────────────────────
let _realProfile: RealProfile | null = null;
let _realAgents: ClawDockAgent[] = [];
let _realTasks: RealTask[] = [];
let _realMessages: AgentMessage[] = [];
// ── Callbacks (set from props each render) ──────────────────────────────────
let _onSaveProfile: ((partial: Partial<RealProfile>) => void) | undefined;
let _onSendMessage: ((content: string) => void) | undefined;
let _onCreateTeam: ((params: Omit<TeamConfig, "id">) => Promise<void>) | undefined;
let _onUpdateTeam:
  | ((id: string, partial: Partial<Omit<TeamConfig, "id">>) => Promise<void>)
  | undefined;
let _onDeleteTeam: ((id: string) => Promise<void>) | undefined;
let _requestUpdate: (() => void) | undefined;
let _realTeams: TeamConfig[] = [];

// ── Team form state ─────────────────────────────────────────────────────────
let _showTeamForm = false;
let _editingTeamId: string | null = null;
let _teamFormData = { name: "", description: "", selectedAgents: [] as string[] };
let _teamFormLoading = false;
let _confirmDeleteTeamId: string | null = null;

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

const _AGENTS: AgentRecord[] = [
  {
    id: "ai-director",
    name: "AI Director",
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
      { ts: "09:45", state: "messaging", note: "Sent OKR report → ai-director" },
      { ts: "09:46", state: "working", note: "Delegating deploy task to code-agent" },
      { ts: "09:50", state: "idle:waiting", note: "Waiting for code-agent test results" },
    ],
    recentMessages: [
      { ts: "09:45", from: "→ ai-director", content: "📊 Q1 OKR report filed" },
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
let _expandedFleetAgentId: string | null = null;

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

function formatSince(ts?: number): string {
  if (!ts) {
    return "—";
  }
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) {
    return `${secs}s ago`;
  }
  if (secs < 3600) {
    return `${Math.floor(secs / 60)}m ago`;
  }
  if (secs < 86400) {
    return `${Math.floor(secs / 3600)}h ago`;
  }
  return `${Math.floor(secs / 86400)}d ago`;
}

function formatStartedAt(ts?: number): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function formatCompactTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return `${n}`;
}

function triggerOverviewUpdate() {
  _requestUpdate?.();
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
  // Persist to backend if callback is available
  if (_onSaveProfile) {
    _onSaveProfile({
      name: _editDraft.name,
      mission: _editDraft.mission,
      vision: _editDraft.vision,
      businessModel: _editDraft.businessModel,
      focusAreas: _editDraft.currentFocus,
      values: _editDraft.values?.map((v) => v.label),
    });
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
function _renderAgentDetail(agent: AgentRecord) {
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
  // Use real agents from backend
  const agents = _realAgents;
  if (agents.length === 0) {
    return html`
      <div class="cd-fleet-view">
        <div class="cd-office-empty" style="padding: 48px 24px; text-align: center">
          <div style="font-size: 2rem; margin-bottom: 12px">🤖</div>
          <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px">No agents registered</div>
          <div style="color: var(--muted-foreground)">Use the Fleet tab to create your first agent.</div>
        </div>
      </div>
    `;
  }

  const agentStatusColor = (s: string) => {
    if (s === "active") {
      return "var(--ok)";
    }
    if (s === "idle") {
      return "#f59e0b";
    }
    if (s === "crashed") {
      return "var(--destructive)";
    }
    return "var(--muted-foreground)";
  };

  const renderFleetDetail = (agent: ClawDockAgent) => {
    const manager = agent.reportTo
      ? (agents.find((candidate) => candidate.id === agent.reportTo)?.name ?? agent.reportTo)
      : "—";
    const directReports =
      agent.directReports.length > 0
        ? agent.directReports
            .map((id) => agents.find((candidate) => candidate.id === id)?.name ?? id)
            .join(", ")
        : "None";
    return html`
      <div class="cd-fleet-row-detail">
        <div class="cd-agent-detail" style="padding: 14px 18px">
          <div class="cd-agent-detail__header" style="border-left:3px solid ${agent.color}">
            <div class="cd-agent-detail__avatar">${agent.emoji}</div>
            <div class="cd-agent-detail__meta">
              <div class="cd-agent-detail__name">${agent.name}</div>
              <div class="cd-agent-detail__role">${agent.role} · ${agent.team}</div>
              <div class="cd-agent-detail__badges">
                <span
                  class="cd-ad-badge"
                  style="background:${agentStatusColor(agent.status)}22;color:${agentStatusColor(agent.status)};border-color:${agentStatusColor(agent.status)}44"
                >
                  ${agent.status}
                </span>
                <span class="cd-ad-badge cd-ad-badge--model">${agent.model}</span>
                <span class="cd-ad-badge cd-ad-badge--model">${agent.runtime}</span>
              </div>
            </div>
            <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${(e: Event) => {
              e.stopPropagation();
              _expandedFleetAgentId = null;
              triggerOverviewUpdate();
            }}>✕</button>
          </div>

          <div class="cd-agent-detail__stats">
            <div class="cd-ad-stat">
              <div class="cd-ad-stat__val">${agent.tasksCompleted}</div>
              <div class="cd-ad-stat__label">Tasks done</div>
            </div>
            <div class="cd-ad-stat">
              <div class="cd-ad-stat__val">${formatCompactTokens(agent.tokensUsed)}</div>
              <div class="cd-ad-stat__label">Tokens used</div>
            </div>
            <div class="cd-ad-stat">
              <div class="cd-ad-stat__val">${agent.toolCount}</div>
              <div class="cd-ad-stat__label">Tools</div>
            </div>
            <div class="cd-ad-stat">
              <div class="cd-ad-stat__val">${agent.cronCount}</div>
              <div class="cd-ad-stat__label">Crons</div>
            </div>
          </div>

          <div class="cd-agent-detail__workspace">
            <span class="cd-ad-ws-label">🧭 Current task</span>
            <span class="cd-ad-ws-val">${agent.currentTask || "Idle — no active task"}</span>
          </div>

          <div class="cd-agent-detail__workspace">
            <span class="cd-ad-ws-label">🕒 Last active</span>
            <span class="cd-ad-ws-val">${formatSince(agent.lastActiveAt)}</span>
            <span class="cd-ad-ws-label">Started</span>
            <span class="cd-ad-ws-val">${formatStartedAt(agent.startedAt)}</span>
            <span class="cd-ad-ws-label">PID</span>
            <span class="cd-ad-ws-val">${agent.pid ?? "—"}</span>
          </div>

          <div class="cd-agent-detail__workspace">
            <span class="cd-ad-ws-label">👤 Reports to</span>
            <span class="cd-ad-ws-val">${manager}</span>
            <span class="cd-ad-ws-label">👥 Direct reports</span>
            <span class="cd-ad-ws-val">${directReports}</span>
          </div>

          ${
            agent.description
              ? html`
                  <div class="cd-agent-detail__workspace">
                    <span class="cd-ad-ws-label">📝 Description</span>
                    <span class="cd-ad-ws-val">${agent.description}</span>
                  </div>
                `
              : ""
          }
        </div>
      </div>
    `;
  };

  return html`
    <div class="cd-fleet-view">
      <div class="cd-fleet-header">
        <span class="cd-fleet-header__title">Agent Status</span>
        <span class="cd-fleet-header__sub"
          >${agents.length} agents · ${agents.filter((a) => a.status === "active").length} active ·
          ${agents.filter((a) => a.status === "idle").length} idle ·
          ${agents.filter((a) => a.status === "crashed").length} crashed</span
        >
      </div>
      <div class="cd-fleet-table">
        <div class="cd-fleet-thead">
          <span>Agent</span><span>Role / Team</span><span>Model</span><span>Status</span><span>Tasks Done</span>
        </div>
        ${agents.map((a) => {
          const isExpanded = _expandedFleetAgentId === a.id;
          return html`
          <div
            class="cd-fleet-row ${isExpanded ? "cd-fleet-row--selected" : ""}"
            role="button"
            tabindex="0"
            aria-expanded=${isExpanded ? "true" : "false"}
            @click=${() => {
              _expandedFleetAgentId = isExpanded ? null : a.id;
              triggerOverviewUpdate();
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                _expandedFleetAgentId = isExpanded ? null : a.id;
                triggerOverviewUpdate();
              }
            }}
          >
            <span class="cd-fleet-agent">
              <span class="cd-fleet-dot" style="background:${agentStatusColor(a.status)}"></span>
              ${a.emoji} <strong>${a.name}</strong>
              <span class="cd-muted" style="margin-left:auto">${isExpanded ? "▾" : "▸"}</span>
            </span>
            <span class="cd-muted" style="font-size:12px">${a.role}<br /><span style="font-size:10px;opacity:.6">${a.team}</span></span>
            <span class="cd-muted cd-mono" style="font-size:11px">${a.model}</span>
            <span
              class="cd-ad-badge"
              style="background:${agentStatusColor(a.status)}22;color:${agentStatusColor(a.status)};border-color:${agentStatusColor(a.status)}44"
              >${a.status}</span
            >
            <span>${a.tasksCompleted}</span>
          </div>
          ${isExpanded ? renderFleetDetail(a) : ""}
        `;
        })}
      </div>
    </div>
  `;
}

// ── Sub-tab stubs ──────────────────────────────────────────────────────────
function renderTeamForm() {
  if (!_showTeamForm) {
    return "";
  }
  const isEditing = _editingTeamId !== null;
  const allAgents = _realAgents;

  return html`
    <div class="cd-create-agent-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
        _showTeamForm = false;
        _editingTeamId = null;
        _requestUpdate?.();
      }
    }}>
      <div class="cd-create-agent-panel">
        <div class="cd-create-agent-panel__header">
          <h3>${isEditing ? "Edit Team" : "Create New Team"}</h3>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${() => {
            _showTeamForm = false;
            _editingTeamId = null;
            _requestUpdate?.();
          }}>✕</button>
        </div>
        <div class="cd-create-agent-panel__body">
          <div class="cd-form-group">
            <label class="cd-form-label">Team Name *</label>
            <input class="cd-form-input" type="text" placeholder="e.g. engineering"
              .value=${_teamFormData.name}
              @input=${(e: Event) => {
                _teamFormData.name = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="cd-form-group">
            <label class="cd-form-label">Description</label>
            <input class="cd-form-input" type="text" placeholder="What does this team do?"
              .value=${_teamFormData.description}
              @input=${(e: Event) => {
                _teamFormData.description = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="cd-form-group">
            <label class="cd-form-label">Assign Agents</label>
            <p style="margin:0 0 6px;font-size:0.8rem;color:var(--muted-foreground)">An agent can belong to multiple teams.</p>
            ${
              allAgents.length > 0
                ? html`
              <div class="cd-agent-checklist">
                ${allAgents.map(
                  (a) => html`
                  <label class="cd-agent-check-item">
                    <input type="checkbox"
                      .checked=${_teamFormData.selectedAgents.includes(a.id)}
                      @change=${(e: Event) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        if (checked) {
                          _teamFormData.selectedAgents = [..._teamFormData.selectedAgents, a.id];
                        } else {
                          _teamFormData.selectedAgents = _teamFormData.selectedAgents.filter(
                            (id) => id !== a.id,
                          );
                        }
                        _requestUpdate?.();
                      }}
                    />
                    <span class="cd-agent-check-item__name">${a.emoji} ${a.name || a.id}</span>
                    <span class="cd-agent-check-item__role">${a.role}</span>
                  </label>
                `,
                )}
              </div>
            `
                : html`
                    <p style="margin: 0; color: var(--muted-foreground); font-size: 0.9rem">No agents available.</p>
                  `
            }
          </div>
        </div>
        <div class="cd-create-agent-panel__footer">
          <button class="cd-btn cd-btn--sm cd-btn--ghost" @click=${() => {
            _showTeamForm = false;
            _editingTeamId = null;
            _requestUpdate?.();
          }}>Cancel</button>
          <button class="cd-btn cd-btn--sm cd-btn--primary"
            ?disabled=${!_teamFormData.name.trim() || _teamFormLoading}
            @click=${async () => {
              if (!_teamFormData.name.trim() || _teamFormLoading) {
                return;
              }
              _teamFormLoading = true;
              _requestUpdate?.();
              try {
                if (isEditing && _editingTeamId) {
                  await _onUpdateTeam?.(_editingTeamId, {
                    name: _teamFormData.name.trim(),
                    description: _teamFormData.description.trim(),
                    agents: _teamFormData.selectedAgents,
                  });
                } else {
                  await _onCreateTeam?.({
                    name: _teamFormData.name.trim(),
                    description: _teamFormData.description.trim(),
                    strategy: "one-for-one",
                    agents: _teamFormData.selectedAgents,
                  });
                }
                _showTeamForm = false;
                _editingTeamId = null;
                _teamFormData = { name: "", description: "", selectedAgents: [] };
              } catch (err) {
                console.error("[ClawDock] Team create/update failed:", err);
              } finally {
                _teamFormLoading = false;
                _requestUpdate?.();
              }
            }}
          >${_teamFormLoading ? "Saving…" : isEditing ? "Save Changes" : "Create Team"}</button>
        </div>
      </div>
    </div>
  `;
}

function renderDeleteTeamConfirm(team: TeamConfig) {
  return html`
    <div class="cd-create-agent-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
        _confirmDeleteTeamId = null;
        _requestUpdate?.();
      }
    }}>
      <div class="cd-create-agent-panel" style="max-width:420px">
        <div class="cd-create-agent-panel__header">
          <h3>Delete Team</h3>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${() => {
            _confirmDeleteTeamId = null;
            _requestUpdate?.();
          }}>✕</button>
        </div>
        <div class="cd-create-agent-panel__body">
          <p style="margin:0;color:var(--foreground)">
            Are you sure you want to delete team <strong>${team.name}</strong>?
          </p>
          <p style="margin:8px 0 0;color:var(--muted-foreground);font-size:0.9rem">
            Agents in this team will not be deleted — they can still belong to other teams.
          </p>
        </div>
        <div class="cd-create-agent-panel__footer">
          <button class="cd-btn cd-btn--sm cd-btn--ghost" @click=${() => {
            _confirmDeleteTeamId = null;
            _requestUpdate?.();
          }}>Cancel</button>
          <button class="cd-btn cd-btn--sm cd-btn--danger" @click=${async () => {
            await _onDeleteTeam?.(team.id);
            _confirmDeleteTeamId = null;
            _requestUpdate?.();
          }}>Delete</button>
        </div>
      </div>
    </div>
  `;
}

function renderTeams() {
  const statusC = (s: string) => {
    if (s === "active" || s === "running") {
      return "var(--ok)";
    }
    if (s === "crashed") {
      return "var(--destructive)";
    }
    if (s === "paused" || s === "idle") {
      return "#f59e0b";
    }
    return "var(--muted-foreground)";
  };

  const teams = _realTeams;
  const agentMap = new Map(_realAgents.map((a) => [a.id, a]));

  const teamColors: Record<string, string> = {
    orchestration: "#6366f1",
    engineering: "#22c55e",
    marketing: "#f97316",
    operations: "#60a5fa",
    finance: "#eab308",
    leadership: "#3b82f6",
  };
  const defaultColor = "#94a3b8";

  return html`
    <div class="cd-teams-view">
      <div class="cd-teams-header">
        <span class="cd-teams-header__title">Teams</span>
        <span class="cd-teams-header__sub">${teams.length} teams · ${_realAgents.length} agents total</span>
        ${
          _onCreateTeam
            ? html`
          <button class="cd-btn cd-btn--sm cd-btn--primary" style="margin-left:auto" @click=${() => {
            _teamFormData = { name: "", description: "", selectedAgents: [] };
            _editingTeamId = null;
            _showTeamForm = true;
            _requestUpdate?.();
          }}>+ New Team</button>
        `
            : ""
        }
      </div>

      ${
        teams.length === 0
          ? html`
        <div class="cd-office-empty" style="padding:48px 24px;text-align:center">
          <div style="font-size:2rem;margin-bottom:12px">👥</div>
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:8px">No teams configured yet</div>
          <div style="color:var(--muted-foreground);margin-bottom:16px">
            Create a team and assign agents. An agent can belong to multiple teams.
          </div>
          ${
            _onCreateTeam
              ? html`
            <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
              _teamFormData = { name: "", description: "", selectedAgents: [] };
              _editingTeamId = null;
              _showTeamForm = true;
              _requestUpdate?.();
            }}>+ Create First Team</button>
          `
              : ""
          }
        </div>
      `
          : html`
        <div class="cd-teams-grid">
          ${teams.map((team) => {
            const members = team.agents
              .map((id) => agentMap.get(id))
              .filter(Boolean) as ClawDockAgent[];
            const crashed = members.filter((a) => a.status === "crashed").length;
            const color = teamColors[team.name] ?? team.color ?? defaultColor;
            return html`
            <div class="cd-team-card" style="border-top-color:${color}">
              <div class="cd-team-card__header">
                <span class="cd-team-card__icon">${members[0]?.emoji ?? "👥"}</span>
                <div class="cd-team-card__meta">
                  <div class="cd-team-card__name">${team.name}</div>
                  ${team.description ? html`<div style="font-size:0.8rem;color:var(--muted-foreground)">${team.description}</div>` : ""}
                  <div class="cd-team-card__badges">
                    ${
                      crashed > 0
                        ? html`
                            <span
                              class="cd-ad-badge"
                              style="
                                background: rgba(245, 158, 11, 0.12);
                                color: #f59e0b;
                                border-color: rgba(245, 158, 11, 0.3);
                              "
                              >⚠️ Degraded</span
                            >
                          `
                        : html`
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
                    }
                    ${team.strategy ? html`<span class="cd-ad-badge" style="font-size:10px">${team.strategy}</span>` : ""}
                  </div>
                </div>
                <div style="display:flex;gap:2px;margin-left:auto;flex-shrink:0">
                  ${
                    _onUpdateTeam
                      ? html`
                    <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Edit team" style="padding:2px 6px;min-width:0" @click=${() => {
                      _editingTeamId = team.id;
                      _teamFormData = {
                        name: team.name,
                        description: team.description ?? "",
                        selectedAgents: [...team.agents],
                      };
                      _showTeamForm = true;
                      _requestUpdate?.();
                    }}>✏️</button>
                  `
                      : ""
                  }
                  ${
                    _onDeleteTeam
                      ? html`
                    <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Delete team" style="padding:2px 6px;min-width:0" @click=${() => {
                      _confirmDeleteTeamId = team.id;
                      _requestUpdate?.();
                    }}>🗑️</button>
                  `
                      : ""
                  }
                </div>
              </div>
              <div class="cd-team-card__members-title">Members (${members.length})</div>
              <div class="cd-team-members">
                ${
                  members.length > 0
                    ? members.map(
                        (a) => html`
                  <div class="cd-team-member">
                    <span class="cd-fleet-dot" style="background:${statusC(a.status)}"></span>
                    <span class="cd-team-member__avatar">${a.emoji}</span>
                    <span class="cd-team-member__name">${a.name}</span>
                    <span class="cd-team-member__role">${a.role}</span>
                    <span class="cd-ad-badge" style="font-size:10px;background:${statusC(a.status)}18;color:${statusC(a.status)};border-color:${statusC(a.status)}35">${a.status}</span>
                  </div>
                `,
                      )
                    : html`
                        <div style="color: var(--muted-foreground); font-size: 0.9rem; padding: 8px 0">No members yet</div>
                      `
                }
              </div>
            </div>
          `;
          })}
        </div>
      `
      }
      ${renderTeamForm()}
      ${
        _confirmDeleteTeamId
          ? (() => {
              const t = teams.find((t) => t.id === _confirmDeleteTeamId);
              return t ? renderDeleteTeamConfirm(t) : "";
            })()
          : ""
      }
    </div>
  `;
}
function renderRoles() {
  return renderRoleHub({});
}
function renderTasks() {
  return renderCompanyTasks({
    tasks: _realTasks.length ? _realTasks : undefined,
    agents: _realAgents.length ? _realAgents : undefined,
  });
}
function renderChats() {
  let _chatInput = "";
  const typeColor: Record<string, string> = {
    task: "rgba(245,158,11,0.3)",
    result: "rgba(34,197,94,0.3)",
    query: "rgba(96,165,250,0.3)",
    notify: "var(--border)",
  };
  return html`
    <div class="cd-chats-view">
      <div class="cd-chats-header">
        <span class="cd-chats-header__title">💬 Company Chats</span>
        <span class="cd-chats-header__sub"
          >${
            _realMessages.length > 0 ? `${_realMessages.length} messages` : "No messages yet"
          }</span
        >
      </div>
      <div class="cd-chats-log">
        ${
          _realMessages.length === 0
            ? html`
                <div class="cd-chat-empty">
                  <div class="cd-chat-empty__icon">💬</div>
                  <div class="cd-chat-empty__title">No messages yet</div>
                  <div class="cd-chat-empty__sub">
                    Agent-to-agent messages and human interactions will appear here once agents are active.
                  </div>
                </div>
              `
            : _realMessages.slice(-50).map((msg) => {
                const isHuman = msg.from === "human";
                const ts = new Date(msg.ts).toTimeString().slice(0, 8);
                return html`
            <div class="cd-chat-entry" style="border-left-color:${isHuman ? "rgba(245,158,11,0.5)" : (typeColor[msg.type] ?? "var(--border)")}">
              <div class="cd-chat-entry__meta">
                <span class="cd-chat-entry__from">${isHuman ? "👤 You" : msg.from}</span>
                <span class="cd-chat-entry__arrow">→</span>
                <span class="cd-chat-entry__to">${msg.to}</span>
                <span class="cd-chat-entry__ts">${ts}</span>
              </div>
              <div class="cd-chat-entry__content">${msg.content}</div>
            </div>
          `;
              })
        }
      </div>

      <!-- Send message to company -->
      ${
        _onSendMessage
          ? html`
        <div class="cd-chats-compose">
          <textarea class="cd-form-textarea cd-chats-compose__input" rows="2"
            placeholder="Message to AI Director…"
            @input=${(e: Event) => {
              _chatInput = (e.target as HTMLTextAreaElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                const msg = _chatInput.trim();
                if (msg) {
                  _onSendMessage?.(msg);
                  _chatInput = "";
                  (e.target as HTMLTextAreaElement).value = "";
                }
              }
            }}></textarea>
          <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${(e: Event) => {
            const textarea = (e.target as HTMLElement)
              .previousElementSibling as HTMLTextAreaElement;
            const msg = textarea?.value.trim() ?? _chatInput.trim();
            if (msg) {
              _onSendMessage?.(msg);
              textarea.value = "";
              _chatInput = "";
            }
          }}>Send ⌘↵</button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ── Company profile sub-tab ────────────────────────────────────────────────
function renderProfile() {
  // Merge real profile into the active company object when available
  const baseCompany = _companies.find((c) => c.id === _activeCompanyId) ?? _companies[0];
  const co: CompanyProfile = _realProfile
    ? {
        ...baseCompany,
        name: _realProfile.name || baseCompany.name,
        mission: _realProfile.mission ?? baseCompany.mission,
        vision: _realProfile.vision ?? baseCompany.vision,
        businessModel: _realProfile.businessModel ?? baseCompany.businessModel,
        currentFocus: _realProfile.focusAreas ?? baseCompany.currentFocus,
        values:
          _realProfile.values && _realProfile.values.length
            ? _realProfile.values.map((v) => ({ emoji: "•", label: v, desc: "" }))
            : baseCompany.values,
      }
    : baseCompany;
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

        <!-- Orchestration Settings -->
        <div class="cd-profile-section" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border,#333)">
          <div class="cd-profile-section__label">Orchestration Settings</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
            <label style="font-size:12px;color:var(--muted-foreground)">Max Rounds</label>
            <input type="number" min="1" max="10" style="width:60px;padding:4px 8px;border-radius:6px;border:1px solid var(--border,#333);background:var(--bg,#1a1a2e);color:var(--text-strong,#fff);font-size:13px;text-align:center"
              .value=${String(_realProfile?.maxOrchestrationRounds ?? 5)}
              @change=${(e: Event) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                if (val >= 1 && val <= 10 && _onSaveProfile) {
                  _onSaveProfile({ maxOrchestrationRounds: val });
                }
              }} />
            <span style="font-size:11px;color:var(--muted-foreground)">
              How many plan→delegate→verify rounds before forcing final answer (1–10)
            </span>
          </div>
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
export type CompanyOverviewProps = {
  requestUpdate?: () => void;
  profile?: RealProfile | null;
  agents?: ClawDockAgent[];
  teams?: TeamConfig[];
  tasks?: RealTask[];
  messages?: AgentMessage[];
  onSaveProfile?: (partial: Partial<RealProfile>) => void;
  onSendMessage?: (content: string) => void;
  onCreateTeam?: (params: Omit<TeamConfig, "id">) => Promise<void>;
  onUpdateTeam?: (id: string, partial: Partial<Omit<TeamConfig, "id">>) => Promise<void>;
  onDeleteTeam?: (id: string) => Promise<void>;
  requestUpdate?: () => void;
};

export function renderCompanyOverview(props: CompanyOverviewProps) {
  // Update real data module vars from props each render
  _realProfile = props.profile ?? null;
  _realAgents = props.agents ?? [];
  _realTasks = props.tasks ?? [];
  _realMessages = props.messages ?? [];
  _realTeams = props.teams ?? [];
  _onSaveProfile = props.onSaveProfile;
  _onSendMessage = props.onSendMessage;
  _onCreateTeam = props.onCreateTeam;
  _onUpdateTeam = props.onUpdateTeam;
  _onDeleteTeam = props.onDeleteTeam;
  _requestUpdate = props.requestUpdate;
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
              triggerOverviewUpdate();
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
