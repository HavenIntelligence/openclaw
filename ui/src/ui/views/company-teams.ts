import { html } from "lit";
import { icons } from "../icons.ts";

type SupervisionStrategy = "one-for-one" | "one-for-all" | "rest-for-one" | "singleton";

type AgentEntry = {
  id: string;
  name: string;
  role: string;
  model: string;
  status: "running" | "idle" | "crashed" | "starting" | "stopped";
  tasksCompleted: number;
  tasksRunning: number;
  uptime: string;
};

type TeamEntry = {
  id: string;
  name: string;
  description: string;
  strategy: SupervisionStrategy;
  agents: AgentEntry[];
  status: "healthy" | "degraded" | "stopped";
  tasksToday: number;
};

const DEMO_TEAMS: TeamEntry[] = [
  {
    id: "content-pipeline",
    name: "content-pipeline",
    description: "Research → Write → Review assembly line for content production.",
    strategy: "one-for-one",
    status: "degraded",
    tasksToday: 40,
    agents: [
      {
        id: "research-alpha",
        name: "research-alpha",
        role: "Researcher",
        model: "claude-opus-4-5",
        status: "running",
        tasksCompleted: 12,
        tasksRunning: 1,
        uptime: "4h 22m",
      },
      {
        id: "writing-beta",
        name: "writing-beta",
        role: "Writer",
        model: "claude-sonnet-4-5",
        status: "running",
        tasksCompleted: 28,
        tasksRunning: 2,
        uptime: "4h 22m",
      },
      {
        id: "review-gamma",
        name: "review-gamma",
        role: "Reviewer",
        model: "claude-haiku-4-5",
        status: "crashed",
        tasksCompleted: 0,
        tasksRunning: 0,
        uptime: "—",
      },
    ],
  },
  {
    id: "devops",
    name: "devops",
    description: "CI/CD automation: code generation, testing, and deployment pipelines.",
    strategy: "rest-for-one",
    status: "healthy",
    tasksToday: 78,
    agents: [
      {
        id: "code-agent",
        name: "code-agent",
        role: "Engineer",
        model: "claude-opus-4-5",
        status: "running",
        tasksCompleted: 47,
        tasksRunning: 3,
        uptime: "6h 10m",
      },
      {
        id: "test-runner",
        name: "test-runner",
        role: "QA",
        model: "gpt-4o",
        status: "running",
        tasksCompleted: 31,
        tasksRunning: 1,
        uptime: "6h 10m",
      },
    ],
  },
  {
    id: "personal-assistant",
    name: "personal-assistant",
    description: "Singleton executive assistant for direct founder interaction.",
    strategy: "singleton",
    status: "healthy",
    tasksToday: 24,
    agents: [
      {
        id: "nanoclaw-primary",
        name: "nanoclaw-primary",
        role: "Personal AI",
        model: "claude-sonnet-4-5",
        status: "idle",
        tasksCompleted: 24,
        tasksRunning: 0,
        uptime: "8h 00m",
      },
    ],
  },
];

const STRATEGY_INFO: Record<
  SupervisionStrategy,
  { label: string; color: string; description: string }
> = {
  "one-for-one": {
    label: "1:1",
    color: "blue",
    description: "One crash → only that agent restarts. Best for independent workers.",
  },
  "one-for-all": {
    label: "1:all",
    color: "purple",
    description: "One crash → entire team stops and restarts. For tightly coupled agents.",
  },
  "rest-for-one": {
    label: "rest:1",
    color: "teal",
    description: "One crash → all downstream agents restart. For pipeline structures.",
  },
  singleton: {
    label: "singleton",
    color: "amber",
    description: "Single instance, auto-restarted on failure. For executive assistants.",
  },
};

function agentStatusIcon(status: string) {
  if (status === "running") {
    return html`
      <span class="cd-pulse cd-pulse--running" title="Running"></span>
    `;
  }
  if (status === "idle") {
    return html`
      <span class="cd-pulse cd-pulse--idle" title="Idle"></span>
    `;
  }
  if (status === "crashed") {
    return html`
      <span class="cd-pulse cd-pulse--crashed" title="Crashed"></span>
    `;
  }
  if (status === "starting") {
    return html`
      <span class="cd-pulse cd-pulse--starting" title="Starting"></span>
    `;
  }
  return html`
    <span class="cd-pulse cd-pulse--stopped" title="Stopped"></span>
  `;
}

function renderTeamAgent(agent: AgentEntry) {
  return html`
    <tr class="cd-team-table__row ${agent.status === "crashed" ? "cd-team-table__row--crashed" : ""}">
      <td class="cd-team-table__cell cd-team-table__cell--name">
        ${agentStatusIcon(agent.status)}
        <span>${agent.name}</span>
      </td>
      <td class="cd-team-table__cell">${agent.role}</td>
      <td class="cd-team-table__cell cd-team-table__cell--model">${agent.model}</td>
      <td class="cd-team-table__cell">
        ${agent.tasksRunning > 0 ? html`<span class="cd-task-count cd-task-count--active">${agent.tasksRunning} running</span>` : ""}
        <span class="cd-task-count">${agent.tasksCompleted} done</span>
      </td>
      <td class="cd-team-table__cell">${agent.uptime}</td>
      <td class="cd-team-table__cell cd-team-table__cell--actions">
        ${
          agent.status === "crashed"
            ? html`<button class="cd-btn cd-btn--xs cd-btn--danger" title="Restart this agent">${icons.rotateCounterClockwise}</button>`
            : agent.status === "running"
              ? html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Pause agent">${icons.pause}</button>`
              : html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Start agent">${icons.play}</button>`
        }
      </td>
    </tr>
  `;
}

function renderTeamCard(team: TeamEntry) {
  const info = STRATEGY_INFO[team.strategy];
  const crashedCount = team.agents.filter((a) => a.status === "crashed").length;
  const runningCount = team.agents.filter((a) => a.status === "running").length;

  return html`
    <div class="cd-team-card ${team.status === "degraded" ? "cd-team-card--degraded" : ""}">
      <div class="cd-team-card__header">
        <div class="cd-team-card__title-row">
          <span class="cd-team-card__icon">${icons.users}</span>
          <div>
            <span class="cd-team-card__name">${team.name}</span>
            <p class="cd-team-card__desc">${team.description}</p>
          </div>
        </div>
        <div class="cd-team-card__meta">
          <span class="cd-strategy-badge cd-strategy-badge--${info.color}" title="${info.description}">
            ${info.label}
          </span>
          ${
            team.status === "degraded"
              ? html`
                  <span class="cd-badge cd-badge--warn">degraded</span>
                `
              : html`
                  <span class="cd-badge cd-badge--ok">healthy</span>
                `
          }
        </div>
      </div>

      <div class="cd-team-card__stats-row">
        <div class="cd-team-mini-stat">
          <span class="cd-team-mini-stat__val">${runningCount}/${team.agents.length}</span>
          <span class="cd-team-mini-stat__lbl">running</span>
        </div>
        ${
          crashedCount > 0
            ? html`
          <div class="cd-team-mini-stat cd-team-mini-stat--danger">
            <span class="cd-team-mini-stat__val">${crashedCount}</span>
            <span class="cd-team-mini-stat__lbl">crashed</span>
          </div>
        `
            : ""
        }
        <div class="cd-team-mini-stat">
          <span class="cd-team-mini-stat__val">${team.tasksToday}</span>
          <span class="cd-team-mini-stat__lbl">tasks today</span>
        </div>
        <div class="cd-team-card__strategy-info">
          <span class="cd-team-card__strategy-label">Strategy:</span>
          <span class="cd-team-card__strategy-value" title="${info.description}">${info.label} — ${team.strategy}</span>
        </div>
      </div>

      <table class="cd-team-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Model</th>
            <th>Tasks</th>
            <th>Uptime</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${team.agents.map(renderTeamAgent)}
        </tbody>
      </table>

      ${
        crashedCount > 0
          ? html`
        <div class="cd-team-card__footer cd-team-card__footer--warn">
          <span>${icons.alertTriangle}</span>
          <span>${crashedCount} agent(s) crashed. Supervision will restart automatically — or use the button to force restart now.</span>
          <button class="cd-btn cd-btn--sm cd-btn--danger">Restart all crashed</button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

export type CompanyTeamsProps = Record<string, never>;

export function renderCompanyTeams(_props: CompanyTeamsProps) {
  return html`
    <div class="cd-page">
      <!-- Strategy legend -->
      <div class="cd-strategy-legend">
        ${Object.entries(STRATEGY_INFO).map(
          ([key, info]) => html`
          <div class="cd-strategy-legend__item">
            <span class="cd-strategy-badge cd-strategy-badge--${info.color}">${info.label}</span>
            <div>
              <span class="cd-strategy-legend__name">${key}</span>
              <span class="cd-strategy-legend__desc">${info.description}</span>
            </div>
          </div>
        `,
        )}
      </div>

      <!-- Team cards -->
      <div class="cd-teams-list">
        ${DEMO_TEAMS.map(renderTeamCard)}
      </div>
    </div>
  `;
}
