import { html } from "lit";
import { icons } from "../icons.ts";

// ── Mutable company registry ───────────────────────────────────────────────
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

type CompanyStatus = {
  employees: number;
  netWorth: number;
  cashBalance: number;
  monthlyRevenue: number;
  monthlyBurn: number;
  runwayMonths: number;
  mrr: number;
  arr: number;
  tasksToday: number;
  tokensToday: number;
  uptime: string;
  health: "healthy" | "degraded" | "critical";
  activeAgents: number;
  crashedAgents: number;
  idleAgents: number;
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

let _statuses: Record<string, CompanyStatus> = {
  acme: {
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
    health: "degraded",
    activeAgents: 6,
    crashedAgents: 1,
    idleAgents: 2,
  },
};

// ── UI state ───────────────────────────────────────────────────────────────
let _activeCompanyId = "acme";
let _editing = false;
let _editDraft: CompanyProfile | null = null;
let _showNewCompanyForm = false;
let _newCompanyName = "";
let _newCompanyIndustry = "";
let _newCompanyStage = "Pre-seed";

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

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, prefix = "") {
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
  children: Parameters<typeof renderAgentLeaf>[0][];
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

// ── Edit helpers ───────────────────────────────────────────────────────────
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
  _statuses[id] = {
    employees: 1,
    netWorth: 0,
    cashBalance: 0,
    monthlyRevenue: 0,
    monthlyBurn: 0,
    runwayMonths: 0,
    mrr: 0,
    arr: 0,
    tasksToday: 0,
    tokensToday: 0,
    uptime: "100%",
    health: "healthy",
    activeAgents: 0,
    crashedAgents: 0,
    idleAgents: 0,
  };
  _activeCompanyId = id;
  _showNewCompanyForm = false;
  _newCompanyName = "";
}

// ── Main render ────────────────────────────────────────────────────────────
export type CompanyOverviewProps = Record<string, never>;

export function renderCompanyOverview(_props: CompanyOverviewProps) {
  const co = _companies.find((c) => c.id === _activeCompanyId) ?? _companies[0];
  const st = _statuses[co.id] ?? _statuses["acme"];
  const runway = st.runwayMonths;
  const runwayColor = runway < 3 ? "var(--destructive)" : runway < 6 ? "#f59e0b" : "var(--ok)";
  const draft = _editDraft ?? co;

  return html`
    <div class="cd-page cd-page--overview">

      <!-- Company switcher bar -->
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
          ${icons.plus} New Company
        </button>
      </div>

      <!-- New company inline form -->
      ${
        _showNewCompanyForm
          ? html`
        <div class="cd-new-co-form">
          <input class="cd-form-input" placeholder="Company name…"
            .value=${_newCompanyName}
            @input=${(e: Event) => {
              _newCompanyName = (e.target as HTMLInputElement).value;
            }} />
          <input class="cd-form-input" placeholder="Industry…"
            .value=${_newCompanyIndustry}
            @input=${(e: Event) => {
              _newCompanyIndustry = (e.target as HTMLInputElement).value;
            }} />
          <select class="cd-form-select" @change=${(e: Event) => {
            _newCompanyStage = (e.target as HTMLSelectElement).value;
          }}>
            ${["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Public"].map((s) => html`<option value="${s}">${s}</option>`)}
          </select>
          <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${createCompany}>Create</button>
          <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${() => {
            _showNewCompanyForm = false;
          }}>Cancel</button>
        </div>
      `
          : ""
      }

      <!-- Company Profile Card -->
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
              <input class="cd-edit-input" placeholder="Tagline…" .value=${draft.tagline}
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
                <input class="cd-edit-input cd-edit-input--sm" placeholder="Founded" .value=${draft.founded}
                  @input=${(e: Event) => {
                    if (_editDraft) {
                      _editDraft.founded = (e.target as HTMLInputElement).value;
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
              <textarea class="cd-edit-textarea" rows="3"
                .value=${draft.mission}
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
              <textarea class="cd-edit-textarea" rows="2"
                .value=${draft.vision}
                @input=${(e: Event) => {
                  if (_editDraft) {
                    _editDraft.vision = (e.target as HTMLTextAreaElement).value;
                  }
                }}></textarea>
            `
                : html`<p class="cd-profile-section__text">${co.vision}</p>`
            }
          </div>
          <!-- Edit controls -->
          <div class="cd-profile-actions">
            ${
              _editing
                ? html`
              <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${saveEdit}>✅ Save</button>
              <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${cancelEdit}>Cancel</button>
            `
                : html`
              <button class="cd-btn cd-btn--outline cd-btn--sm" @click=${() => startEdit(co)}>✏️ Edit Company</button>
            `
            }
          </div>
        </div>
      </div>

      <!-- Values + Business Model -->
      <div class="cd-overview-row">
        <div class="cd-values-card cd-card">
          <div class="cd-card__title">Core Values</div>
          <div class="cd-values-grid">
            ${(_editing ? draft : co).values.map(
              (v, i) => html`
              <div class="cd-value-item">
                ${
                  _editing
                    ? html`
                  <input class="cd-edit-input cd-edit-input--sm" .value=${v.emoji}
                    @input=${(e: Event) => {
                      if (_editDraft) {
                        _editDraft.values[i].emoji = (e.target as HTMLInputElement).value;
                      }
                    }} style="width:40px" />
                  <input class="cd-edit-input cd-edit-input--sm" .value=${v.label}
                    @input=${(e: Event) => {
                      if (_editDraft) {
                        _editDraft.values[i].label = (e.target as HTMLInputElement).value;
                      }
                    }} />
                  <input class="cd-edit-input cd-edit-input--sm" .value=${v.desc}
                    @input=${(e: Event) => {
                      if (_editDraft) {
                        _editDraft.values[i].desc = (e.target as HTMLInputElement).value;
                      }
                    }} />
                `
                    : html`
                  <span class="cd-value-item__emoji">${v.emoji}</span>
                  <strong>${v.label}</strong>
                  <span>${v.desc}</span>
                `
                }
              </div>
            `,
            )}
          </div>
        </div>
        <div class="cd-focus-card cd-card">
          <div class="cd-card__title">Current Focus</div>
          ${
            _editing
              ? html`
            <textarea class="cd-edit-textarea" rows="4"
              .value=${draft.currentFocus.join("\n")}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.currentFocus = (e.target as HTMLTextAreaElement).value
                    .split("\n")
                    .filter(Boolean);
                }
              }}></textarea>
          `
              : html`
            <ul class="cd-focus-list">
              ${co.currentFocus.map(
                (f) => html`
                <li class="cd-focus-list__item"><span class="cd-focus-list__dot"></span>${f}</li>
              `,
              )}
            </ul>
          `
          }
          <div class="cd-card__title" style="margin-top:14px">Business Model</div>
          ${
            _editing
              ? html`
            <textarea class="cd-edit-textarea" rows="3"
              .value=${draft.businessModel}
              @input=${(e: Event) => {
                if (_editDraft) {
                  _editDraft.businessModel = (e.target as HTMLTextAreaElement).value;
                }
              }}></textarea>
          `
              : html`<p class="cd-biz-model">${co.businessModel}</p>`
          }
        </div>
      </div>

      <!-- Status Dashboard -->
      <div class="cd-status-grid">
        ${[
          {
            icon: "👥",
            val: `${st.employees}`,
            label: "AI Employees",
            sub: `${st.activeAgents} active · ${st.crashedAgents} crashed`,
          },
          { icon: "💎", val: fmt(st.netWorth, "$"), label: "Net Worth", sub: "Valuation est." },
          {
            icon: "💵",
            val: fmt(st.cashBalance, "$"),
            label: "Cash Balance",
            sub: "Available runway funds",
          },
          { icon: "📈", val: fmt(st.mrr, "$"), label: "MRR", sub: `ARR ${fmt(st.arr, "$")}` },
          {
            icon: "🔥",
            val: fmt(st.monthlyBurn, "$"),
            label: "Monthly Burn",
            sub: "Operating cost",
          },
          {
            icon: "⏳",
            val: runway > 0 ? `${runway.toFixed(1)}mo` : "—",
            label: "Runway",
            sub: runway < 3 ? "⚠️ Critical" : runway < 6 ? "⚠️ Fundraise soon" : "✅ Healthy",
            color: runwayColor,
          },
          {
            icon: "⚡",
            val: `${st.tasksToday}`,
            label: "Tasks Today",
            sub: `${(st.tokensToday / 1_000_000).toFixed(2)}M tokens`,
          },
          {
            icon: "📡",
            val: st.uptime,
            label: "Uptime",
            sub: st.health === "degraded" ? "⚠️ Degraded" : "✅ Healthy",
          },
        ].map(
          (s) => html`
          <div class="cd-stat-tile">
            <div class="cd-stat-tile__icon">${s.icon}</div>
            <div class="cd-stat-tile__val" style="${"color" in s && s.color ? `color:${s.color}` : ""}">${s.val}</div>
            <div class="cd-stat-tile__label">${s.label}</div>
            <div class="cd-stat-tile__sub">${s.sub}</div>
          </div>
        `,
        )}
      </div>

      <!-- Alert banner (only when degraded) -->
      ${
        st.health !== "healthy"
          ? html`
        <div class="cd-alert-banner">
          ${icons.alertTriangle}
          <strong>Degraded:</strong>&nbsp;review-gamma is crashed (restart 2/3). Writing pipeline impacted.
          <button class="cd-btn cd-btn--xs cd-btn--ghost" style="margin-left:auto">View Logs</button>
        </div>
      `
          : ""
      }

      <!-- Supervision Tree + Quick Actions -->
      <div class="cd-overview-row">
        <div class="cd-card" style="flex:2">
          <div class="cd-card__title">Supervision Tree</div>
          <div class="cd-sup-tree">
            ${DEMO_SUPERVISION_TREE.map(
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

      <!-- Recent Events -->
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
