import { html, nothing } from "lit";
import type { ClawDockAgent, ClawDockRuntime } from "../company-types.ts";
import { icons } from "../icons.ts";

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(0)}K`;
  }
  return `${n}`;
}

type FleetAgent = {
  id: string;
  name: string;
  team: string;
  role: string;
  model: string;
  status: "running" | "idle" | "crashed" | "starting" | "stopped";
  tasksCompleted: number;
  tasksRunning: number;
  tokensUsed: number;
  cpuPercent: number;
  memoryMb: number;
  uptime: string;
  lastActivity: string;
};

function cpuBar(pct: number) {
  const color =
    pct > 70 ? "var(--destructive)" : pct > 40 ? "var(--warning, #f59e0b)" : "var(--ok)";
  return html`
    <div class="cd-resource-bar" title="${pct}% CPU">
      <div class="cd-resource-bar__fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="cd-resource-bar__label">${pct}%</span>
  `;
}

function memBar(mb: number) {
  const max = 1024;
  const pct = Math.min(100, Math.round((mb / max) * 100));
  const color =
    pct > 80 ? "var(--destructive)" : pct > 50 ? "var(--warning, #f59e0b)" : "var(--accent-2)";
  return html`
    <div class="cd-resource-bar" title="${mb} MB">
      <div class="cd-resource-bar__fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="cd-resource-bar__label">${mb}MB</span>
  `;
}

function statusPill(status: string) {
  const cls: Record<string, string> = {
    running: "cd-pill--running",
    idle: "cd-pill--idle",
    crashed: "cd-pill--crashed",
    starting: "cd-pill--starting",
    stopped: "cd-pill--stopped",
  };
  return html`<span class="cd-pill ${cls[status] ?? ""}">${status}</span>`;
}

function renderFleetRow(agent: FleetAgent, props: CompanyFleetProps) {
  return html`
    <tr class="cd-fleet-row ${agent.status === "crashed" ? "cd-fleet-row--crashed" : ""}">
      <td class="cd-fleet-cell cd-fleet-cell--name">
        <div class="cd-fleet-name-cell">
          <span class="cd-pulse cd-pulse--${agent.status}"></span>
          <div>
            <span class="cd-fleet-name-cell__name">${agent.name}</span>
            <span class="cd-fleet-name-cell__team">${agent.team}</span>
          </div>
        </div>
      </td>
      <td class="cd-fleet-cell">${agent.role}</td>
      <td class="cd-fleet-cell cd-fleet-cell--model">
        <span class="cd-model-chip">${agent.model}</span>
      </td>
      <td class="cd-fleet-cell">${statusPill(agent.status)}</td>
      <td class="cd-fleet-cell">
        <div class="cd-tasks-cell">
          ${agent.tasksRunning > 0 ? html`<span class="cd-tasks-cell__running">${agent.tasksRunning}↑</span>` : ""}
          <span class="cd-tasks-cell__done">${agent.tasksCompleted}</span>
        </div>
      </td>
      <td class="cd-fleet-cell cd-fleet-cell--resource">
        ${
          agent.status !== "crashed"
            ? cpuBar(agent.cpuPercent)
            : html`
                <span class="cd-muted">—</span>
              `
        }
      </td>
      <td class="cd-fleet-cell cd-fleet-cell--resource">
        ${
          agent.status !== "crashed"
            ? memBar(agent.memoryMb)
            : html`
                <span class="cd-muted">—</span>
              `
        }
      </td>
      <td class="cd-fleet-cell">${formatTokens(agent.tokensUsed)}</td>
      <td class="cd-fleet-cell cd-fleet-cell--muted">${agent.lastActivity}</td>
      <td class="cd-fleet-cell cd-fleet-cell--actions">
        ${
          agent.status === "crashed"
            ? html`<button class="cd-btn cd-btn--xs cd-btn--danger" title="Restart" @click=${() => props.onRestart?.(agent.id)}>${icons.rotateCounterClockwise}</button>`
            : agent.status === "running"
              ? html`
                  <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Pause" @click=${() => props.onPause?.(agent.id)}>${icons.pause}</button>
                  <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Stop" @click=${() => props.onStop?.(agent.id)}>${icons.stop}</button>
                `
              : agent.status === "stopped"
                ? html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Start" @click=${() => props.onStart?.(agent.id)}>${icons.play}</button>`
                : agent.status === "starting"
                  ? html`
                      <span class="cd-muted">starting…</span>
                    `
                  : html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Resume" @click=${() => props.onResume?.(agent.id)}>${icons.play}</button>`
        }
        <button class="cd-btn cd-btn--xs cd-btn--ghost" title="View logs" @click=${() => props.onLoadLogs?.(agent.id)}>${icons.terminal2}</button>
      </td>
    </tr>
  `;
}

function toFleetAgent(a: ClawDockAgent): FleetAgent {
  const statusMap: Record<string, FleetAgent["status"]> = {
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
  const uptime = a.startedAt ? `${uptimeH}h ${uptimeM}m` : "—";
  const lastActivity = a.lastActiveAt
    ? (() => {
        const secs = Math.floor((Date.now() - a.lastActiveAt) / 1000);
        return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
      })()
    : "—";
  return {
    id: a.id,
    name: a.name,
    team: a.team,
    role: a.role,
    model: a.model,
    status: statusMap[a.status] ?? "idle",
    tasksCompleted: a.tasksCompleted,
    tasksRunning: a.status === "active" ? 1 : 0,
    tokensUsed: a.tokensUsed,
    cpuPercent: a.cpuPercent ?? 0,
    memoryMb: a.memoryMb ?? 0,
    uptime,
    lastActivity,
  };
}

// ── Create Agent form state ────────────────────────────────────────────────
let _showCreateForm = false;
let _createFormData = {
  name: "",
  role: "Agent",
  team: "general",
  runtime: "openclaw" as ClawDockRuntime,
  emoji: "🤖",
};
let _createLoading = false;

const RUNTIMES: { value: ClawDockRuntime; label: string }[] = [
  { value: "openclaw", label: "OpenClaw" },
  { value: "claude-code", label: "Claude Code" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "codex", label: "Codex CLI" },
  { value: "aider", label: "Aider" },
];

const PRESET_ROLES = [
  "Agent",
  "Engineer",
  "Researcher",
  "Writer",
  "Reviewer",
  "QA",
  "Personal AI",
  "Manager",
];
const PRESET_EMOJIS = ["🤖", "🧠", "✍️", "🔍", "🛠️", "🎯", "📊", "🚀", "💡", "🔧"];

function renderCreateForm(props: CompanyFleetProps) {
  if (!_showCreateForm) {
    return nothing;
  }

  return html`
    <div class="cd-create-agent-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
        _showCreateForm = false;
        props._requestUpdate?.();
      }
    }}>
      <div class="cd-create-agent-panel">
        <div class="cd-create-agent-panel__header">
          <h3>Create New Agent</h3>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${() => {
            _showCreateForm = false;
            props._requestUpdate?.();
          }}>
            ${icons.x}
          </button>
        </div>

        <div class="cd-create-agent-panel__body">
          <div class="cd-form-group">
            <label class="cd-form-label">Agent Name *</label>
            <input
              class="cd-form-input"
              type="text"
              placeholder="e.g. research-alpha"
              .value=${_createFormData.name}
              @input=${(e: Event) => {
                _createFormData.name = (e.target as HTMLInputElement).value;
              }}
            />
          </div>

          <div class="cd-form-row">
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Role</label>
              <select class="cd-form-input" @change=${(e: Event) => {
                _createFormData.role = (e.target as HTMLSelectElement).value;
              }}>
                ${PRESET_ROLES.map((r) => html`<option value=${r} ?selected=${r === _createFormData.role}>${r}</option>`)}
              </select>
            </div>
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Team</label>
              <input
                class="cd-form-input"
                type="text"
                placeholder="general"
                .value=${_createFormData.team}
                @input=${(e: Event) => {
                  _createFormData.team = (e.target as HTMLInputElement).value;
                }}
              />
            </div>
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Runtime</label>
            <div class="cd-runtime-picker">
              ${RUNTIMES.map(
                (rt) => html`
                <button
                  class="cd-runtime-chip ${rt.value === _createFormData.runtime ? "cd-runtime-chip--active" : ""}"
                  @click=${() => {
                    _createFormData.runtime = rt.value;
                    props._requestUpdate?.();
                  }}
                >${rt.label}</button>
              `,
              )}
            </div>
          </div>

          <div class="cd-form-group">
            <label class="cd-form-label">Emoji</label>
            <div class="cd-emoji-picker">
              ${PRESET_EMOJIS.map(
                (e) => html`
                <button
                  class="cd-emoji-chip ${e === _createFormData.emoji ? "cd-emoji-chip--active" : ""}"
                  @click=${() => {
                    _createFormData.emoji = e;
                    props._requestUpdate?.();
                  }}
                >${e}</button>
              `,
              )}
            </div>
          </div>
        </div>

        <div class="cd-create-agent-panel__footer">
          <button class="cd-btn cd-btn--sm cd-btn--ghost" @click=${() => {
            _showCreateForm = false;
            props._requestUpdate?.();
          }}>Cancel</button>
          <button
            class="cd-btn cd-btn--sm cd-btn--primary"
            ?disabled=${!_createFormData.name.trim() || _createLoading}
            @click=${async () => {
              if (!_createFormData.name.trim() || _createLoading) {
                return;
              }
              _createLoading = true;
              props._requestUpdate?.();
              try {
                await props.onCreate?.({
                  name: _createFormData.name.trim(),
                  role: _createFormData.role,
                  team: _createFormData.team,
                  runtime: _createFormData.runtime,
                  emoji: _createFormData.emoji,
                });
                _showCreateForm = false;
                _createFormData = {
                  name: "",
                  role: "Agent",
                  team: "general",
                  runtime: "openclaw",
                  emoji: "🤖",
                };
              } finally {
                _createLoading = false;
                props._requestUpdate?.();
              }
            }}
          >
            ${_createLoading ? "Creating…" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyState(props: CompanyFleetProps) {
  return html`
    <div class="cd-fleet-empty">
      <div class="cd-fleet-empty__icon">
        <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="12" y="20" width="56" height="40" rx="4" />
          <circle cx="30" cy="40" r="6" />
          <circle cx="50" cy="40" r="6" />
          <path d="M30 40v-4m20 4v-4" />
          <path d="M24 54h32" stroke-dasharray="3 3" />
        </svg>
      </div>
      <h3 class="cd-fleet-empty__title">No agents in your fleet</h3>
      <p class="cd-fleet-empty__desc">
        Create your first AI agent to get started. Each agent runs as an independent process
        and can use different runtimes (OpenClaw, Claude Code, Gemini, etc.).
      </p>
      <div class="cd-fleet-empty__actions">
        <button class="cd-btn cd-btn--sm cd-btn--primary" @click=${() => {
          _showCreateForm = true;
          props._requestUpdate?.();
        }}>
          ${icons.plus} Create First Agent
        </button>
      </div>
      <div class="cd-fleet-empty__hints">
        <div class="cd-fleet-empty__hint">
          <span class="cd-fleet-empty__hint-icon">1</span>
          <span>Create an agent with a name, role, and runtime</span>
        </div>
        <div class="cd-fleet-empty__hint">
          <span class="cd-fleet-empty__hint-icon">2</span>
          <span>Start the agent — it spawns as a managed child process</span>
        </div>
        <div class="cd-fleet-empty__hint">
          <span class="cd-fleet-empty__hint-icon">3</span>
          <span>Assign tasks, monitor resources, view logs in real time</span>
        </div>
      </div>
    </div>
  `;
}

export type CompanyFleetProps = {
  agents?: ClawDockAgent[];
  onStart?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
  onRestart?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onResume?: (agentId: string) => void;
  onLoadLogs?: (agentId: string) => void;
  onCreate?: (params: {
    name: string;
    role?: string;
    team?: string;
    runtime?: string;
    emoji?: string;
  }) => Promise<void>;
  _requestUpdate?: () => void;
};

export function renderCompanyFleet(props: CompanyFleetProps) {
  const hasRealAgents = props.agents && props.agents.length > 0;
  const fleet = hasRealAgents ? props.agents!.map(toFleetAgent) : [];

  if (!hasRealAgents) {
    return html`
      <div class="cd-page">
        ${renderEmptyState(props)}
        ${renderCreateForm(props)}
      </div>
    `;
  }

  const runningCount = fleet.filter((a) => a.status === "running").length;
  const crashedCount = fleet.filter((a) => a.status === "crashed").length;
  const idleCount = fleet.filter((a) => a.status === "idle").length;
  const totalTokens = fleet.reduce((sum, a) => sum + a.tokensUsed, 0);
  const totalTasks = fleet.reduce((sum, a) => sum + a.tasksCompleted, 0);

  return html`
    <div class="cd-page">
      <!-- Fleet summary bar -->
      <div class="cd-fleet-summary">
        <div class="cd-fleet-summary__chip cd-fleet-summary__chip--running">
          <span class="cd-pulse cd-pulse--running"></span>
          <span>${runningCount} running</span>
        </div>
        <div class="cd-fleet-summary__chip cd-fleet-summary__chip--idle">
          <span class="cd-pulse cd-pulse--idle"></span>
          <span>${idleCount} idle</span>
        </div>
        ${
          crashedCount > 0
            ? html`
          <div class="cd-fleet-summary__chip cd-fleet-summary__chip--crashed">
            <span class="cd-pulse cd-pulse--crashed"></span>
            <span>${crashedCount} crashed</span>
          </div>
        `
            : ""
        }
        <div class="cd-fleet-summary__divider"></div>
        <div class="cd-fleet-summary__stat">
          <span class="cd-fleet-summary__stat-val">${totalTasks}</span>
          <span class="cd-fleet-summary__stat-lbl">total tasks</span>
        </div>
        <div class="cd-fleet-summary__stat">
          <span class="cd-fleet-summary__stat-val">${formatTokens(totalTokens)}</span>
          <span class="cd-fleet-summary__stat-lbl">tokens used</span>
        </div>
        <div class="cd-fleet-summary__actions">
          <button class="cd-btn cd-btn--sm cd-btn--primary" @click=${() => {
            _showCreateForm = true;
            props._requestUpdate?.();
          }}>
            ${icons.plus} Add Agent
          </button>
          ${
            crashedCount > 0
              ? html`<button class="cd-btn cd-btn--sm cd-btn--outline" @click=${() => {
                  fleet
                    .filter((a) => a.status === "crashed")
                    .forEach((a) => props.onRestart?.(a.id));
                }}>
                ${icons.rotateCounterClockwise} Restart crashed
              </button>`
              : ""
          }
        </div>
      </div>

      <!-- Fleet table -->
      <div class="cd-fleet-table-wrap">
        <table class="cd-fleet-table">
          <thead>
            <tr>
              <th>Agent / Team</th>
              <th>Role</th>
              <th>Model</th>
              <th>Status</th>
              <th>Tasks</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Tokens</th>
              <th>Last Activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${fleet.map((a) => renderFleetRow(a, props))}
          </tbody>
        </table>
      </div>

      <!-- Architecture callout -->
      <div class="cd-arch-callout">
        <div class="cd-arch-callout__icon">${icons.cpu}</div>
        <div class="cd-arch-callout__body">
          <strong>ClawDock Control Plane</strong> manages this fleet — scheduling, health monitoring,
          auto-recovery, and inter-agent messaging. Like Kubernetes for containers, but for AI agents.
        </div>
      </div>

      ${renderCreateForm(props)}
    </div>
  `;
}
