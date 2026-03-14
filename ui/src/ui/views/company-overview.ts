import { html } from "lit";
import { icons } from "../icons.ts";

// ── Company Profile (editable in future) ─────────────────────────────────
const COMPANY_PROFILE = {
  name: "Acme AI Corp",
  tagline: "One founder. One fleet. Full output.",
  founded: "2025",
  stage: "Seed",
  industry: "AI Infrastructure",
  hq: "San Francisco, CA (remote-first)",
  mission: `Build the world's first self-operating AI company — where a single
human founder delegates all execution to a supervised fleet of specialized AI
agents, retaining only strategy, ethics review, and final approval rights.`,
  vision: `Every entrepreneur on Earth running a profitable company powered
entirely by their own curated agent fleet, with zero operational overhead.`,
  values: [
    { emoji: "⚡", label: "Speed", desc: "Ship every day. Agents never sleep." },
    { emoji: "🎯", label: "Focus", desc: "One north star. No distractions." },
    { emoji: "🔍", label: "Transparency", desc: "Every decision logged and auditable." },
    { emoji: "🔄", label: "Resilience", desc: "Crash, recover, keep running." },
  ],
  businessModel: `B2B SaaS — tiered subscriptions based on agent seats and
compute credits. Enterprise plans include custom agent fleet configuration,
dedicated supervision infrastructure, and human-in-the-loop SLA guarantees.`,
  currentFocus: [
    "Launch content pipeline product (Q1 2026)",
    "Close seed round — $3M target",
    "Onboard first 10 design-partner companies",
    "Build MCP marketplace integration",
  ],
};

// ── Financial & Operations Status ─────────────────────────────────────────
const COMPANY_STATUS = {
  employees: 9,
  netWorth: 2_400_000,
  cashBalance: 840_000,
  monthlyRevenue: 180_000,
  monthlyBurn: 95_000,
  runwayMonths: 8.8,
  mrr: 42_000,
  arr: 504_000,
  tasksToday: 142,
  tokensToday: 2_840_000,
  uptime: "99.4%",
  health: "degraded" as "healthy" | "degraded" | "critical",
  activeAgents: 6,
  crashedAgents: 1,
  idleAgents: 2,
};

// ── Supervision Tree demo data ─────────────────────────────────────────────
const DEMO_SUPERVISION_TREE = [
  {
    id: "root",
    label: "ClawDock Root Supervisor",
    role: "COO",
    status: "healthy" as const,
    children: [
      {
        id: "team-content",
        label: "content-pipeline",
        role: "Department Head",
        strategy: "one-for-one",
        status: "healthy" as const,
        children: [
          {
            id: "research-alpha",
            label: "research-alpha",
            role: "Researcher",
            status: "healthy" as const,
            model: "claude-opus-4-5",
            tasks: 12,
          },
          {
            id: "writing-beta",
            label: "writing-beta",
            role: "Writer",
            status: "healthy" as const,
            model: "claude-sonnet-4-5",
            tasks: 8,
          },
          {
            id: "review-gamma",
            label: "review-gamma",
            role: "Reviewer",
            status: "crashed" as const,
            model: "claude-haiku-4-5",
            tasks: 0,
          },
        ],
      },
      {
        id: "team-devops",
        label: "devops",
        role: "Department Head",
        strategy: "rest-for-one",
        status: "healthy" as const,
        children: [
          {
            id: "code-agent",
            label: "code-agent",
            role: "Engineer",
            status: "healthy" as const,
            model: "claude-opus-4-5",
            tasks: 34,
          },
          {
            id: "test-runner",
            label: "test-runner",
            role: "QA",
            status: "idle" as const,
            model: "gpt-4o",
            tasks: 0,
          },
        ],
      },
      {
        id: "pa",
        label: "nanoclaw-primary",
        role: "Personal Assistant",
        strategy: "singleton",
        status: "idle" as const,
        children: [],
      },
    ],
  },
];

// ── Recent events ──────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  {
    time: "2m ago",
    icon: "💥",
    msg: "review-gamma crashed — supervisor restarting (attempt 2/3)",
    level: "error",
  },
  {
    time: "5m ago",
    icon: "✅",
    msg: "code-agent merged PR #42: add retry logic to MCP client",
    level: "ok",
  },
  {
    time: "11m ago",
    icon: "📄",
    msg: "writing-beta published: 'AI Agents in 2026' blog post",
    level: "ok",
  },
  {
    time: "18m ago",
    icon: "🔍",
    msg: "research-alpha completed competitor analysis (14 sources)",
    level: "ok",
  },
  {
    time: "32m ago",
    icon: "📊",
    msg: "ops-prime filed Q1 OKR report — 87% target completion",
    level: "ok",
  },
  {
    time: "1h ago",
    icon: "🚀",
    msg: "Project Alpha kicked off — 3 agents assigned",
    level: "info",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, prefix = ""): string {
  if (n >= 1_000_000) {
    return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${prefix}${(n / 1_000).toFixed(0)}K`;
  }
  return `${prefix}${n}`;
}

function statusColor(s: string) {
  if (s === "healthy") {
    return "var(--ok)";
  }
  if (s === "crashed") {
    return "var(--destructive)";
  }
  return "#f59e0b";
}

function strategyBadge(strategy?: string) {
  const map: Record<string, { label: string; cls: string }> = {
    "one-for-one": { label: "1:1", cls: "cd-badge--strategy-ofo" },
    "one-for-all": { label: "1:all", cls: "cd-badge--strategy-ofa" },
    "rest-for-one": { label: "rest:1", cls: "cd-badge--strategy-rfo" },
    singleton: { label: "singleton", cls: "cd-badge--strategy-sg" },
  };
  const s = map[strategy ?? ""] ?? { label: strategy ?? "", cls: "" };
  return html`<span class="cd-badge ${s.cls}">${s.label}</span>`;
}

// Recursive tree node
function renderAgentLeaf(agent: {
  id: string;
  label: string;
  role: string;
  status: string;
  model?: string;
  tasks?: number;
}) {
  return html`
    <div class="cd-sup-leaf">
      <span class="cd-sup-leaf__dot" style="background:${statusColor(agent.status)}"></span>
      <span class="cd-sup-leaf__name">${agent.label}</span>
      <span class="cd-sup-leaf__role">${agent.role}</span>
      ${agent.model ? html`<span class="cd-badge cd-badge--model">${agent.model}</span>` : ""}
      ${agent.tasks !== undefined ? html`<span class="cd-sup-leaf__tasks">${agent.tasks} tasks</span>` : ""}
    </div>
  `;
}

function renderTeamNode(team: {
  id: string;
  label: string;
  role: string;
  status: string;
  strategy?: string;
  children: Array<{
    id: string;
    label: string;
    role: string;
    status: string;
    model?: string;
    tasks?: number;
  }>;
}) {
  return html`
    <div class="cd-sup-team">
      <div class="cd-sup-team__header">
        <span class="cd-sup-team__dot" style="background:${statusColor(team.status)}"></span>
        <span class="cd-sup-team__name">${team.label}</span>
        <span class="cd-sup-team__role">${team.role}</span>
        ${team.strategy ? strategyBadge(team.strategy) : ""}
      </div>
      <div class="cd-sup-team__members">
        ${team.children.map(renderAgentLeaf)}
      </div>
    </div>
  `;
}

function renderSupervisionTree(tree: typeof DEMO_SUPERVISION_TREE) {
  return html`
    <div class="cd-sup-tree">
      ${tree.map(
        (root) => html`
        <div class="cd-sup-root">
          <div class="cd-sup-root__header">
            <span class="cd-sup-root__icon">${icons.network}</span>
            <span class="cd-sup-root__label">${root.label}</span>
            <span class="cd-badge cd-badge--ok">${root.role}</span>
          </div>
          <div class="cd-sup-root__teams">
            ${root.children.map((child) =>
              child.children.length > 0
                ? renderTeamNode(child as Parameters<typeof renderTeamNode>[0])
                : renderAgentLeaf(child),
            )}
          </div>
        </div>
      `,
      )}
    </div>
  `;
}

// ── Main Render ────────────────────────────────────────────────────────────
export type CompanyOverviewProps = Record<string, never>;

export function renderCompanyOverview(_props: CompanyOverviewProps) {
  const runway = COMPANY_STATUS.runwayMonths;
  const runwayColor = runway < 3 ? "var(--destructive)" : runway < 6 ? "#f59e0b" : "var(--ok)";

  return html`
    <div class="cd-page cd-page--overview">

      <!-- ── Company Profile Card (MD-style) ─────────────────── -->
      <div class="cd-profile-card">
        <div class="cd-profile-card__left">
          <div class="cd-profile-card__logo">🦀</div>
          <div class="cd-profile-card__meta">
            <h1 class="cd-profile-card__name">${COMPANY_PROFILE.name}</h1>
            <p class="cd-profile-card__tag">${COMPANY_PROFILE.tagline}</p>
            <div class="cd-profile-card__chips">
              <span class="cd-chip">${COMPANY_PROFILE.stage}</span>
              <span class="cd-chip">${COMPANY_PROFILE.industry}</span>
              <span class="cd-chip">Est. ${COMPANY_PROFILE.founded}</span>
              <span class="cd-chip">📍 ${COMPANY_PROFILE.hq}</span>
            </div>
          </div>
        </div>
        <div class="cd-profile-card__right">
          <div class="cd-profile-section">
            <div class="cd-profile-section__label">Mission</div>
            <p class="cd-profile-section__text">${COMPANY_PROFILE.mission}</p>
          </div>
          <div class="cd-profile-section">
            <div class="cd-profile-section__label">Vision</div>
            <p class="cd-profile-section__text">${COMPANY_PROFILE.vision}</p>
          </div>
        </div>
      </div>

      <!-- ── Values + Business Model ─────────────────────────── -->
      <div class="cd-overview-row">
        <div class="cd-values-card cd-card">
          <div class="cd-card__title">Core Values</div>
          <div class="cd-values-grid">
            ${COMPANY_PROFILE.values.map(
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
          <div class="cd-card__title">Current Focus (Q1 2026)</div>
          <ul class="cd-focus-list">
            ${COMPANY_PROFILE.currentFocus.map(
              (f) => html`
              <li class="cd-focus-list__item">
                <span class="cd-focus-list__dot"></span>${f}
              </li>
            `,
            )}
          </ul>
          <div class="cd-card__title" style="margin-top:14px">Business Model</div>
          <p class="cd-biz-model">${COMPANY_PROFILE.businessModel}</p>
        </div>
      </div>

      <!-- ── Company Status Dashboard ────────────────────────── -->
      <div class="cd-status-grid">
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">👥</div>
          <div class="cd-stat-tile__val">${COMPANY_STATUS.employees}</div>
          <div class="cd-stat-tile__label">AI Employees</div>
          <div class="cd-stat-tile__sub">${COMPANY_STATUS.activeAgents} active · ${COMPANY_STATUS.crashedAgents} crashed</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">💎</div>
          <div class="cd-stat-tile__val">${fmt(COMPANY_STATUS.netWorth, "$")}</div>
          <div class="cd-stat-tile__label">Net Worth</div>
          <div class="cd-stat-tile__sub">Company valuation est.</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">💵</div>
          <div class="cd-stat-tile__val">${fmt(COMPANY_STATUS.cashBalance, "$")}</div>
          <div class="cd-stat-tile__label">Cash Balance</div>
          <div class="cd-stat-tile__sub">Available runway funds</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">📈</div>
          <div class="cd-stat-tile__val">${fmt(COMPANY_STATUS.mrr, "$")}</div>
          <div class="cd-stat-tile__label">MRR</div>
          <div class="cd-stat-tile__sub">ARR ${fmt(COMPANY_STATUS.arr, "$")}</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">🔥</div>
          <div class="cd-stat-tile__val">${fmt(COMPANY_STATUS.monthlyBurn, "$")}</div>
          <div class="cd-stat-tile__label">Monthly Burn</div>
          <div class="cd-stat-tile__sub">Operating cost</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">⏳</div>
          <div class="cd-stat-tile__val" style="color:${runwayColor}">${runway.toFixed(1)}mo</div>
          <div class="cd-stat-tile__label">Runway</div>
          <div class="cd-stat-tile__sub" style="color:${runwayColor}">${runway < 6 ? "⚠️ Fundraise soon" : "✅ Healthy"}</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">⚡</div>
          <div class="cd-stat-tile__val">${COMPANY_STATUS.tasksToday}</div>
          <div class="cd-stat-tile__label">Tasks Today</div>
          <div class="cd-stat-tile__sub">${(COMPANY_STATUS.tokensToday / 1_000_000).toFixed(2)}M tokens</div>
        </div>
        <div class="cd-stat-tile">
          <div class="cd-stat-tile__icon">📡</div>
          <div class="cd-stat-tile__val">${COMPANY_STATUS.uptime}</div>
          <div class="cd-stat-tile__label">Uptime</div>
          <div class="cd-stat-tile__sub ${COMPANY_STATUS.health === "degraded" ? "cd-stat-tile__sub--warn" : ""}">
            ${COMPANY_STATUS.health === "degraded" ? "⚠️ Degraded" : "✅ Healthy"}
          </div>
        </div>
      </div>

      <!-- ── Alert banner ────────────────────────────────────── -->
      ${
        COMPANY_STATUS.health !== "healthy"
          ? html`
        <div class="cd-alert-banner">
          ${icons.alertTriangle}
          <strong>Degraded:</strong>&nbsp;review-gamma is crashed (restart attempt 2/3).
          Downstream writing pipeline may be impacted.
          <button class="cd-btn cd-btn--xs cd-btn--ghost" style="margin-left:auto">View Logs</button>
        </div>
      `
          : ""
      }

      <!-- ── Supervision Tree + Quick Actions ─────────────────── -->
      <div class="cd-overview-row">
        <div class="cd-card" style="flex:2">
          <div class="cd-card__title">Supervision Tree</div>
          ${renderSupervisionTree(DEMO_SUPERVISION_TREE)}
        </div>
        <div class="cd-card" style="flex:1">
          <div class="cd-card__title">Quick Actions</div>
          <div class="cd-quick-actions">
            <button class="cd-btn cd-btn--primary">${icons.play} Start All Agents</button>
            <button class="cd-btn cd-btn--outline">${icons.pause} Pause Fleet</button>
            <button class="cd-btn cd-btn--outline">${icons.rotateCounterClockwise} Restart Crashed</button>
            <button class="cd-btn cd-btn--outline">${icons.activity} View Logs</button>
            <button class="cd-btn cd-btn--outline">${icons.terminal2} Open Console</button>
          </div>
          <div class="cd-card__title" style="margin-top:20px">System Health</div>
          ${[
            { label: "Gateway", val: "Connected", ok: true },
            { label: "Scheduler", val: "Running", ok: true },
            { label: "Message Bus", val: "Running", ok: true },
            { label: "Supervisor", val: "Degraded (1 crash)", ok: false },
            { label: "Storage", val: "OK", ok: true },
          ].map(
            (row) => html`
            <div class="cd-health-row">
              <span class="cd-health-dot" style="background:${row.ok ? "var(--ok)" : "var(--destructive)"}"></span>
              <span class="cd-health-label">${row.label}</span>
              <span class="cd-health-val ${row.ok ? "" : "cd-health-val--err"}">${row.val}</span>
            </div>
          `,
          )}
        </div>
      </div>

      <!-- ── Recent Events ────────────────────────────────────── -->
      <div class="cd-card">
        <div class="cd-card__title">Recent Events</div>
        <div class="cd-event-feed">
          ${DEMO_EVENTS.map(
            (e) => html`
            <div class="cd-event-row cd-event-row--${e.level}">
              <span class="cd-event-icon">${e.icon}</span>
              <span class="cd-event-time">${e.time}</span>
              <span class="cd-event-msg">${e.msg}</span>
            </div>
          `,
          )}
        </div>
      </div>

    </div>
  `;
}
