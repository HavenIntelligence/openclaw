import { html } from "lit";
import { icons } from "../icons.ts";

// Simulated demo data for ClawDock Company Overview
const DEMO_COMPANY = {
  name: "Acme AI Corp",
  motto: "One founder. One fleet. Full output.",
  founded: "2025",
  teams: 3,
  totalAgents: 8,
  activeAgents: 6,
  crashedAgents: 1,
  idleAgents: 1,
  tasksToday: 142,
  tokensToday: 2_840_000,
  uptime: "99.4%",
  health: "degraded" as "healthy" | "degraded" | "critical",
};

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
            tasks: 28,
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
            tasks: 47,
          },
          {
            id: "test-runner",
            label: "test-runner",
            role: "QA",
            status: "healthy" as const,
            model: "gpt-4o",
            tasks: 31,
          },
        ],
      },
      {
        id: "singleton-pa",
        label: "personal-assistant",
        role: "Executive Assistant",
        strategy: "singleton",
        status: "healthy" as const,
        children: [
          {
            id: "nanoclaw-primary",
            label: "nanoclaw-primary",
            role: "Personal AI",
            status: "idle" as const,
            model: "claude-sonnet-4-5",
            tasks: 24,
          },
        ],
      },
    ],
  },
];

type AgentLeaf = {
  id: string;
  label: string;
  role: string;
  status: "healthy" | "crashed" | "idle" | "starting";
  model: string;
  tasks: number;
};

type TeamNode = {
  id: string;
  label: string;
  role: string;
  strategy: string;
  status: "healthy" | "degraded" | "crashed";
  children: AgentLeaf[];
};

type RootNode = {
  id: string;
  label: string;
  role: string;
  status: "healthy" | "degraded" | "crashed";
  children: TeamNode[];
};

function statusBadge(status: string) {
  if (status === "healthy") {
    return html`
      <span class="cd-badge cd-badge--ok">healthy</span>
    `;
  }
  if (status === "crashed") {
    return html`
      <span class="cd-badge cd-badge--danger">crashed</span>
    `;
  }
  if (status === "idle") {
    return html`
      <span class="cd-badge cd-badge--muted">idle</span>
    `;
  }
  if (status === "degraded") {
    return html`
      <span class="cd-badge cd-badge--warn">degraded</span>
    `;
  }
  return html`<span class="cd-badge cd-badge--muted">${status}</span>`;
}

function strategyLabel(strategy: string) {
  if (strategy === "one-for-one") {
    return html`
      <span class="cd-strategy" title="One agent crashes → only that agent restarts">1:1</span>
    `;
  }
  if (strategy === "one-for-all") {
    return html`
      <span class="cd-strategy" title="One crashes → entire team restarts">1:all</span>
    `;
  }
  if (strategy === "rest-for-one") {
    return html`
      <span class="cd-strategy" title="One crashes → all downstream restart">rest:1</span>
    `;
  }
  return html`<span class="cd-strategy">${strategy}</span>`;
}

function renderAgentLeaf(agent: AgentLeaf) {
  return html`
    <div class="cd-agent-leaf ${agent.status === "crashed" ? "cd-agent-leaf--crashed" : ""} ${agent.status === "idle" ? "cd-agent-leaf--idle" : ""}">
      <div class="cd-agent-leaf__header">
        <span class="cd-agent-leaf__pulse cd-pulse--${agent.status}"></span>
        <span class="cd-agent-leaf__name">${agent.label}</span>
        ${statusBadge(agent.status)}
      </div>
      <div class="cd-agent-leaf__meta">
        <span class="cd-agent-leaf__role">${agent.role}</span>
        <span class="cd-agent-leaf__model">${agent.model}</span>
      </div>
      <div class="cd-agent-leaf__stats">
        <span class="cd-agent-leaf__tasks">${agent.tasks} tasks</span>
        ${agent.status === "crashed" ? html`<button class="cd-btn cd-btn--xs cd-btn--danger" title="Restart agent">${icons.rotateCounterClockwise} Restart</button>` : ""}
      </div>
    </div>
  `;
}

function renderTeamNode(team: TeamNode) {
  return html`
    <div class="cd-team-node">
      <div class="cd-team-node__header">
        <span class="cd-team-node__icon">${icons.users}</span>
        <div class="cd-team-node__info">
          <span class="cd-team-node__name">${team.label}</span>
          <span class="cd-team-node__role">${team.role}</span>
        </div>
        <div class="cd-team-node__badges">
          ${strategyLabel(team.strategy)}
          ${statusBadge(team.status)}
        </div>
      </div>
      <div class="cd-team-node__agents">
        ${team.children.map(renderAgentLeaf)}
      </div>
    </div>
  `;
}

function renderSupervisionTree(tree: RootNode[]) {
  const root = tree[0];
  if (!root) {
    return html``;
  }
  return html`
    <div class="cd-sup-tree">
      <div class="cd-sup-root">
        <span class="cd-sup-root__icon">${icons.building}</span>
        <div class="cd-sup-root__info">
          <span class="cd-sup-root__name">${root.label}</span>
          <span class="cd-sup-root__role">${root.role}</span>
        </div>
        ${statusBadge(root.status)}
      </div>
      <div class="cd-sup-tree__teams">
        ${root.children.map(renderTeamNode)}
      </div>
    </div>
  `;
}

export type CompanyOverviewProps = Record<string, never>;

export function renderCompanyOverview(_props: CompanyOverviewProps) {
  const company = DEMO_COMPANY;

  return html`
    <div class="cd-page">
      <!-- Company hero banner -->
      <div class="cd-company-hero">
        <div class="cd-company-hero__left">
          <div class="cd-company-logo">
            <span class="cd-company-logo__icon">${icons.building}</span>
          </div>
          <div class="cd-company-hero__copy">
            <h1 class="cd-company-hero__name">${company.name}</h1>
            <p class="cd-company-hero__motto">${company.motto}</p>
          </div>
        </div>
        <div class="cd-company-hero__stats">
          <div class="cd-stat-chip">
            <span class="cd-stat-chip__value">${company.teams}</span>
            <span class="cd-stat-chip__label">Teams</span>
          </div>
          <div class="cd-stat-chip">
            <span class="cd-stat-chip__value">${company.activeAgents}<span class="cd-stat-chip__sub">/${company.totalAgents}</span></span>
            <span class="cd-stat-chip__label">Agents Active</span>
          </div>
          <div class="cd-stat-chip cd-stat-chip--accent">
            <span class="cd-stat-chip__value">${company.tasksToday}</span>
            <span class="cd-stat-chip__label">Tasks Today</span>
          </div>
          <div class="cd-stat-chip">
            <span class="cd-stat-chip__value">${(company.tokensToday / 1_000_000).toFixed(2)}M</span>
            <span class="cd-stat-chip__label">Tokens Today</span>
          </div>
          <div class="cd-stat-chip ${company.health === "degraded" ? "cd-stat-chip--warn" : "cd-stat-chip--ok"}">
            <span class="cd-stat-chip__value">${company.health}</span>
            <span class="cd-stat-chip__label">Health</span>
          </div>
        </div>
      </div>

      <!-- Alert banner: crashed agent -->
      ${
        company.crashedAgents > 0
          ? html`
        <div class="cd-alert cd-alert--warn">
          <span class="cd-alert__icon">${icons.alertTriangle}</span>
          <div class="cd-alert__body">
            <strong>${company.crashedAgents} agent crashed</strong> — review-gamma in content-pipeline is down.
            Supervision strategy: one-for-one — other team members are unaffected.
          </div>
          <button class="cd-btn cd-btn--sm cd-btn--outline">View details</button>
        </div>
      `
          : ""
      }

      <div class="cd-page__grid">
        <!-- Left: Supervision tree -->
        <section class="cd-section cd-section--wide">
          <div class="cd-section__header">
            <span class="cd-section__title">Supervision Tree</span>
            <span class="cd-section__sub">Erlang/OTP-inspired hierarchy — agents restart automatically when they crash</span>
          </div>
          ${renderSupervisionTree(DEMO_SUPERVISION_TREE as unknown as RootNode[])}
        </section>

        <!-- Right: Quick actions + metrics -->
        <div class="cd-sidebar-col">
          <section class="cd-section">
            <div class="cd-section__header">
              <span class="cd-section__title">Quick Actions</span>
            </div>
            <div class="cd-quick-actions">
              <button class="cd-quick-action">
                <span class="cd-quick-action__icon cd-quick-action__icon--green">${icons.play}</span>
                <span>Start all agents</span>
              </button>
              <button class="cd-quick-action">
                <span class="cd-quick-action__icon cd-quick-action__icon--amber">${icons.pause}</span>
                <span>Pause fleet</span>
              </button>
              <button class="cd-quick-action">
                <span class="cd-quick-action__icon cd-quick-action__icon--blue">${icons.rotateCounterClockwise}</span>
                <span>Restart crashed</span>
              </button>
              <button class="cd-quick-action">
                <span class="cd-quick-action__icon cd-quick-action__icon--red">${icons.stop}</span>
                <span>Emergency stop</span>
              </button>
            </div>
          </section>

          <section class="cd-section">
            <div class="cd-section__header">
              <span class="cd-section__title">System Health</span>
            </div>
            <div class="cd-health-rows">
              <div class="cd-health-row">
                <span>${icons.cpu}</span>
                <span class="cd-health-row__label">Control Plane</span>
                <span class="cd-badge cd-badge--ok">online</span>
              </div>
              <div class="cd-health-row">
                <span>${icons.network}</span>
                <span class="cd-health-row__label">Message Bus</span>
                <span class="cd-badge cd-badge--ok">online</span>
              </div>
              <div class="cd-health-row">
                <span>${icons.activity}</span>
                <span class="cd-health-row__label">Supervision</span>
                <span class="cd-badge cd-badge--warn">1 fault</span>
              </div>
              <div class="cd-health-row">
                <span>${icons.scrollText}</span>
                <span class="cd-health-row__label">Event Log</span>
                <span class="cd-badge cd-badge--ok">live</span>
              </div>
            </div>
          </section>

          <section class="cd-section">
            <div class="cd-section__header">
              <span class="cd-section__title">Recent Events</span>
            </div>
            <div class="cd-event-feed">
              <div class="cd-event-feed__item cd-event-feed__item--danger">
                <span class="cd-event-feed__time">09:41</span>
                <span class="cd-event-feed__msg">review-gamma crashed (exit code 1)</span>
              </div>
              <div class="cd-event-feed__item cd-event-feed__item--info">
                <span class="cd-event-feed__time">09:38</span>
                <span class="cd-event-feed__msg">writing-beta completed task #28</span>
              </div>
              <div class="cd-event-feed__item cd-event-feed__item--info">
                <span class="cd-event-feed__time">09:35</span>
                <span class="cd-event-feed__msg">code-agent delegated subtask to test-runner</span>
              </div>
              <div class="cd-event-feed__item cd-event-feed__item--ok">
                <span class="cd-event-feed__time">09:30</span>
                <span class="cd-event-feed__msg">Pipeline run #142 completed in 2m 14s</span>
              </div>
              <div class="cd-event-feed__item cd-event-feed__item--info">
                <span class="cd-event-feed__time">09:27</span>
                <span class="cd-event-feed__msg">research-alpha started task #12</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}
