import { html, nothing } from "lit";
import type { ClawDockAgent, TeamConfig } from "../company-types.ts";
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
  goal: string;
  leaderId: string;
  leaderName: string;
  strategy: SupervisionStrategy;
  agents: AgentEntry[];
  agentIds: string[];
  status: "healthy" | "degraded" | "stopped";
  tasksToday: number;
};

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

const STRATEGIES: { value: SupervisionStrategy; label: string }[] = [
  { value: "one-for-one", label: "One-for-One" },
  { value: "one-for-all", label: "One-for-All" },
  { value: "rest-for-one", label: "Rest-for-One" },
  { value: "singleton", label: "Singleton" },
];

// ── Form state ────────────────────────────────────────────────────────────
type TeamFormData = {
  name: string;
  description: string;
  goal: string;
  leaderId: string;
  strategy: SupervisionStrategy;
  agents: string[];
};

const DEFAULT_FORM: TeamFormData = {
  name: "",
  description: "",
  goal: "",
  leaderId: "",
  strategy: "one-for-one",
  agents: [],
};

let _showForm = false;
let _editingTeamId: string | null = null;
let _formData: TeamFormData = { ...DEFAULT_FORM };
let _formLoading = false;
let _confirmDeleteId: string | null = null;

function resetForm() {
  _showForm = false;
  _editingTeamId = null;
  _formData = { ...DEFAULT_FORM };
  _formLoading = false;
}

function openCreateForm() {
  resetForm();
  _showForm = true;
}

function openEditForm(team: TeamEntry) {
  _editingTeamId = team.id;
  _formData = {
    name: team.name,
    description: team.description,
    goal: team.goal,
    leaderId: team.leaderId,
    strategy: team.strategy,
    agents: [...team.agentIds],
  };
  _showForm = true;
}

// ── Rendering helpers ─────────────────────────────────────────────────────

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

function renderTeamCard(team: TeamEntry, props: CompanyTeamsProps) {
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
            ${team.goal ? html`<p class="cd-team-card__goal">🎯 ${team.goal}</p>` : ""}
            ${team.leaderName ? html`<p class="cd-team-card__leader">👤 Lead: ${team.leaderName}</p>` : ""}
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
          ${
            props.onUpdateTeam
              ? html`
            <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Edit team"
              @click=${() => {
                openEditForm(team);
                props._requestUpdate?.();
              }}>
              ${icons.edit}
            </button>
          `
              : ""
          }
          ${
            props.onDeleteTeam
              ? html`
            <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Delete team"
              @click=${() => {
                _confirmDeleteId = team.id;
                props._requestUpdate?.();
              }}>
              ${icons.trash}
            </button>
          `
              : ""
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

// ── Delete confirmation dialog ────────────────────────────────────────────

function renderDeleteConfirm(props: CompanyTeamsProps, teamList: TeamEntry[]) {
  if (!_confirmDeleteId) {
    return nothing;
  }
  const team = teamList.find((t) => t.id === _confirmDeleteId);
  if (!team) {
    return nothing;
  }

  return html`
    <div class="cd-create-agent-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
        _confirmDeleteId = null;
        props._requestUpdate?.();
      }
    }}>
      <div class="cd-create-agent-panel" style="max-width:420px">
        <div class="cd-create-agent-panel__header">
          <h3>Delete Team</h3>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${() => {
            _confirmDeleteId = null;
            props._requestUpdate?.();
          }}>
            ${icons.x}
          </button>
        </div>

        <div class="cd-create-agent-panel__body">
          <p style="margin:0;color:var(--foreground)">
            Are you sure you want to delete team <strong>${team.name}</strong>?
          </p>
          <p style="margin:8px 0 0;color:var(--muted-foreground);font-size:0.9rem">
            This will remove the team configuration. Agents in this team will not be deleted.
          </p>
        </div>

        <div class="cd-create-agent-panel__footer">
          <button class="cd-btn cd-btn--sm cd-btn--ghost" @click=${() => {
            _confirmDeleteId = null;
            props._requestUpdate?.();
          }}>Cancel</button>
          <button class="cd-btn cd-btn--sm cd-btn--danger" @click=${async () => {
            props.onDeleteTeam?.(_confirmDeleteId!);
            _confirmDeleteId = null;
            props._requestUpdate?.();
          }}>Delete</button>
        </div>
      </div>
    </div>
  `;
}

// ── Create / Edit form ────────────────────────────────────────────────────

function renderTeamForm(props: CompanyTeamsProps) {
  if (!_showForm) {
    return nothing;
  }

  const isEditing = _editingTeamId !== null;
  const allAgents = props.agents ?? [];

  return html`
    <div class="cd-create-agent-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
        resetForm();
        props._requestUpdate?.();
      }
    }}>
      <div class="cd-create-agent-panel">
        <div class="cd-create-agent-panel__header">
          <h3>${isEditing ? "Edit Team" : "Create New Team"}</h3>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${() => {
            resetForm();
            props._requestUpdate?.();
          }}>
            ${icons.x}
          </button>
        </div>

        <div class="cd-create-agent-panel__body">
          <div class="cd-form-group">
            <label class="cd-form-label">Team Name *</label>
            <input
              class="cd-form-input"
              type="text"
              placeholder="e.g. engineering"
              .value=${_formData.name}
              @input=${(e: Event) => {
                _formData.name = (e.target as HTMLInputElement).value;
              }}
            />
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Description</label>
            <input
              class="cd-form-input"
              type="text"
              placeholder="What does this team do?"
              .value=${_formData.description}
              @input=${(e: Event) => {
                _formData.description = (e.target as HTMLInputElement).value;
              }}
            />
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Team Goal / Objective</label>
            <input
              class="cd-form-input"
              type="text"
              placeholder="e.g. Ship v2.0 by end of Q1"
              .value=${_formData.goal}
              @input=${(e: Event) => {
                _formData.goal = (e.target as HTMLInputElement).value;
              }}
            />
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Team Leader</label>
            <select class="cd-form-input" @change=${(e: Event) => {
              _formData.leaderId = (e.target as HTMLSelectElement).value;
              props._requestUpdate?.();
            }}>
              <option value="" ?selected=${!_formData.leaderId}>None</option>
              ${allAgents.map(
                (a) => html`
                <option value="${a.id}" ?selected=${a.id === _formData.leaderId}>
                  ${a.name || a.id} (${a.role})
                </option>
              `,
              )}
            </select>
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Supervision Strategy</label>
            <div class="cd-runtime-picker">
              ${STRATEGIES.map(
                (s) => html`
                <button
                  class="cd-runtime-chip ${s.value === _formData.strategy ? "cd-runtime-chip--active" : ""}"
                  @click=${() => {
                    _formData.strategy = s.value;
                    props._requestUpdate?.();
                  }}
                  title="${STRATEGY_INFO[s.value].description}"
                >${s.label}</button>
              `,
              )}
            </div>
            <p style="margin:4px 0 0;font-size:0.8rem;color:var(--muted-foreground)">
              ${STRATEGY_INFO[_formData.strategy].description}
            </p>
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Agents</label>
            ${
              allAgents.length > 0
                ? html`
              <div class="cd-agent-checklist">
                ${allAgents.map(
                  (a) => html`
                  <label class="cd-agent-check-item">
                    <input
                      type="checkbox"
                      .checked=${_formData.agents.includes(a.id)}
                      @change=${(e: Event) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        if (checked) {
                          _formData.agents = [..._formData.agents, a.id];
                        } else {
                          _formData.agents = _formData.agents.filter((id) => id !== a.id);
                        }
                        props._requestUpdate?.();
                      }}
                    />
                    <span class="cd-agent-check-item__name">${a.name || a.id}</span>
                    <span class="cd-agent-check-item__role">${a.role}</span>
                  </label>
                `,
                )}
              </div>
            `
                : html`
                    <p style="margin: 0; color: var(--muted-foreground); font-size: 0.9rem">
                      No agents available. Create agents in the Fleet tab first.
                    </p>
                  `
            }
          </div>
        </div>

        <div class="cd-create-agent-panel__footer">
          <button class="cd-btn cd-btn--sm cd-btn--ghost" @click=${() => {
            resetForm();
            props._requestUpdate?.();
          }}>Cancel</button>
          <button
            class="cd-btn cd-btn--sm cd-btn--primary"
            ?disabled=${!_formData.name.trim() || _formLoading}
            @click=${async () => {
              if (!_formData.name.trim() || _formLoading) {
                return;
              }
              _formLoading = true;
              props._requestUpdate?.();
              try {
                if (isEditing) {
                  props.onUpdateTeam?.(_editingTeamId!, {
                    name: _formData.name.trim(),
                    description: _formData.description.trim(),
                    goal: _formData.goal.trim() || undefined,
                    leaderId: _formData.leaderId || undefined,
                    strategy: _formData.strategy,
                    agents: _formData.agents,
                  });
                } else {
                  props.onCreateTeam?.({
                    name: _formData.name.trim(),
                    description: _formData.description.trim(),
                    goal: _formData.goal.trim() || undefined,
                    leaderId: _formData.leaderId || undefined,
                    strategy: _formData.strategy,
                    agents: _formData.agents,
                  });
                }
                resetForm();
              } finally {
                _formLoading = false;
                props._requestUpdate?.();
              }
            }}
          >
            ${_formLoading ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save Changes" : "Create Team"}
          </button>
        </div>
      </div>
    </div>
  `;
}

/** Convert real TeamConfig + ClawDockAgent data to internal TeamEntry format. */
function toTeamEntry(team: TeamConfig, allAgents: ClawDockAgent[]): TeamEntry {
  const memberAgents = allAgents.filter((a) => team.agents.includes(a.id));
  const entries: AgentEntry[] = memberAgents.map((a) => {
    const statusMap: Record<string, AgentEntry["status"]> = {
      active: "running",
      idle: "idle",
      crashed: "crashed",
      starting: "starting",
      stopping: "stopped",
      paused: "stopped",
    };
    const uptimeSecs = a.startedAt ? Math.floor((Date.now() - a.startedAt) / 1000) : 0;
    const uptimeH = Math.floor(uptimeSecs / 3600);
    const uptimeM = Math.floor((uptimeSecs % 3600) / 60);
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      model: a.model,
      status: statusMap[a.status] ?? "idle",
      tasksCompleted: a.tasksCompleted,
      tasksRunning: a.status === "active" ? 1 : 0,
      uptime: a.startedAt ? `${uptimeH}h ${uptimeM}m` : "—",
    };
  });
  const hasCrashed = entries.some((a) => a.status === "crashed");
  const leader = team.leaderId ? allAgents.find((a) => a.id === team.leaderId) : undefined;
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? "",
    goal: team.goal ?? "",
    leaderId: team.leaderId ?? "",
    leaderName: leader?.name ?? team.leaderId ?? "",
    strategy: team.strategy,
    agents: entries,
    agentIds: team.agents,
    status: hasCrashed ? "degraded" : "healthy",
    tasksToday: entries.reduce((s, a) => s + a.tasksCompleted, 0),
  };
}

export type CompanyTeamsProps = {
  teams?: TeamConfig[];
  agents?: ClawDockAgent[];
  onCreateTeam?: (params: Omit<TeamConfig, "id">) => void;
  onUpdateTeam?: (id: string, partial: Partial<Omit<TeamConfig, "id">>) => void;
  onDeleteTeam?: (id: string) => void;
  _requestUpdate?: () => void;
};

export function renderCompanyTeams(props: CompanyTeamsProps) {
  const teamList =
    props.teams && props.teams.length > 0
      ? props.teams.map((t) => toTeamEntry(t, props.agents ?? []))
      : [];

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
        ${
          teamList.length > 0
            ? teamList.map((team) => renderTeamCard(team, props))
            : html`
            <div class="cd-office-empty" style="padding:48px 24px;text-align:center">
              <div style="font-size:2rem;margin-bottom:12px">${icons.users}</div>
              <div style="font-size:1.1rem;font-weight:600;margin-bottom:8px">No teams configured yet</div>
              <div style="color:var(--muted-foreground);margin-bottom:16px">
                Teams group agents with a supervision strategy that controls restart behavior.
                Create a team and assign agents from your fleet.
              </div>
              ${
                props.onCreateTeam
                  ? html`
                <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
                  openCreateForm();
                  props._requestUpdate?.();
                }}>
                  ${icons.plus} Create First Team
                </button>
              `
                  : ""
              }
            </div>
          `
        }
      </div>

      <!-- Add team button -->
      ${
        props.onCreateTeam && teamList.length > 0
          ? html`
        <div style="margin-top:16px">
          <button class="cd-btn cd-btn--sm cd-btn--outline" @click=${() => {
            openCreateForm();
            props._requestUpdate?.();
          }}>
            ${icons.plus} Add Team
          </button>
        </div>
      `
          : ""
      }

      ${renderTeamForm(props)}
      ${renderDeleteConfirm(props, teamList)}
    </div>
  `;
}
