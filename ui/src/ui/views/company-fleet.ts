import { html, nothing } from "lit";
import type { ClawDockAgent, ClawDockRuntime, LogEntry } from "../company-types.ts";
import { icons } from "../icons.ts";
import type {
  AgentsFilesListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  SkillStatusReport,
  ToolsCatalogResult,
} from "../types.ts";
import type { AgentsListResult } from "../types.ts";
import { renderAgentFiles } from "./agents-panels-status-files.ts";
import { renderAgentChannels, renderAgentCron } from "./agents-panels-status-files.ts";
import { renderAgentTools, renderAgentSkills } from "./agents-panels-tools-skills.ts";
import { buildAgentContext } from "./agents-utils.ts";
import { renderCompanyAgentLogsPanel } from "./company-agent-logs.ts";

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

function renderFleetRow(agent: ClawDockAgent, props: CompanyFleetProps) {
  const row = toFleetAgent(agent);
  const isExpanded = _expandedAgentId === agent.id;
  return html`
    <tr
      class="cd-fleet-row ${row.status === "crashed" ? "cd-fleet-row--crashed" : ""} ${isExpanded ? "cd-fleet-row--expanded" : ""}"
      @click=${(e: Event) => {
        if ((e.target as HTMLElement).closest("button") == null) {
          toggleExpand(agent.id, agent, props);
        }
      }}
    >
      <td class="cd-fleet-cell cd-fleet-cell--name">
        <div class="cd-fleet-name-cell">
          <button
            type="button"
            class="cd-fleet-expand-btn"
            title=${isExpanded ? "Collapse config" : "Expand config"}
            @click=${(e: Event) => {
              e.stopPropagation();
              toggleExpand(agent.id, agent, props);
            }}
          >
            <span class="cd-fleet-expand-btn__chevron ${isExpanded ? "cd-fleet-expand-btn__chevron--open" : ""}">▸</span>
          </button>
          <span class="cd-pulse cd-pulse--${row.status}"></span>
          <div>
            <span class="cd-fleet-name-cell__name">${row.name}</span>
            <span class="cd-fleet-name-cell__team">${row.team}</span>
          </div>
        </div>
      </td>
      <td class="cd-fleet-cell">${row.role}</td>
      <td class="cd-fleet-cell cd-fleet-cell--model">
        <span class="cd-model-chip">${row.model}</span>
      </td>
      <td class="cd-fleet-cell">${statusPill(row.status)}</td>
      <td class="cd-fleet-cell">
        <div class="cd-tasks-cell">
          ${row.tasksRunning > 0 ? html`<span class="cd-tasks-cell__running">${row.tasksRunning}↑</span>` : ""}
          <span class="cd-tasks-cell__done">${row.tasksCompleted}</span>
        </div>
      </td>
      <td class="cd-fleet-cell cd-fleet-cell--resource">
        ${
          row.status !== "crashed"
            ? cpuBar(row.cpuPercent)
            : html`
                <span class="cd-muted">—</span>
              `
        }
      </td>
      <td class="cd-fleet-cell cd-fleet-cell--resource">
        ${
          row.status !== "crashed"
            ? memBar(row.memoryMb)
            : html`
                <span class="cd-muted">—</span>
              `
        }
      </td>
      <td class="cd-fleet-cell">${formatTokens(row.tokensUsed)}</td>
      <td class="cd-fleet-cell cd-fleet-cell--muted">${row.lastActivity}</td>
      <td class="cd-fleet-cell cd-fleet-cell--actions">
        <div class="cd-fleet-actions">
          ${
            row.status === "crashed"
              ? html`<button class="cd-btn cd-btn--xs cd-btn--danger" title="Restart" @click=${() => props.onRestart?.(agent.id)}>${icons.rotateCounterClockwise}</button>`
              : row.status === "running"
                ? html`
                    <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Pause" @click=${() => props.onPause?.(agent.id)}>${icons.pause}</button>
                    <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Stop" @click=${() => props.onStop?.(agent.id)}>${icons.stop}</button>
                  `
                : row.status === "stopped"
                  ? html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Start" @click=${() => props.onStart?.(agent.id)}>${icons.play}</button>`
                  : row.status === "starting"
                    ? html`
                        <span class="cd-muted">starting…</span>
                      `
                    : html`<button class="cd-btn cd-btn--xs cd-btn--ghost" title="Resume" @click=${() => props.onResume?.(agent.id)}>${icons.play}</button>`
          }
          <button class="cd-btn cd-btn--xs cd-btn--ghost" title="Config" @click=${(e: Event) => {
            e.stopPropagation();
            toggleExpand(agent.id, agent, props);
          }}>${icons.edit}</button>
          <button class="cd-btn cd-btn--xs cd-btn--ghost" title="View logs" @click=${() => {
            void openAgentLogs(agent, props);
          }}>${icons.terminal2}</button>
        </div>
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
let _editingAgentId: string | null = null;
let _editFormData = {
  role: "Agent",
  team: "general",
  runtime: "openclaw" as ClawDockRuntime,
  emoji: "🤖",
  description: "",
  reportTo: "",
};
let _updateLoading = false;
let _updateError: string | null = null;
let _selectedLogAgentId: string | null = null;
let _logsLoading = false;
/** Which agent row is expanded to show full config (click row or Edit to toggle). */
let _expandedAgentId: string | null = null;
/** Active config tab in the expanded panel (local state so tab switch responds immediately). */
let _companyConfigPanel: CompanyConfigPanel = "overview";

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

function beginEditAgent(agent: ClawDockAgent, props: CompanyFleetProps) {
  _editingAgentId = agent.id;
  _editFormData = {
    role: agent.role,
    team: agent.team,
    runtime: agent.runtime,
    emoji: agent.emoji,
    description: agent.description ?? "",
    reportTo: agent.reportTo ?? "",
  };
  _updateError = null;
  props._requestUpdate?.();
}

function toggleExpand(agentId: string, agent: ClawDockAgent | undefined, props: CompanyFleetProps) {
  if (_expandedAgentId === agentId) {
    _expandedAgentId = null;
    props.onExpandedAgentChange?.(null);
  } else {
    _expandedAgentId = agentId;
    _companyConfigPanel = "overview";
    if (agent) {
      beginEditAgent(agent, props);
    }
    props.onExpandedAgentChange?.(agentId);
  }
  props._requestUpdate?.();
}

function _closeEditAgent(props: CompanyFleetProps) {
  _editingAgentId = null;
  _expandedAgentId = null;
  _updateLoading = false;
  _updateError = null;
  props.onExpandedAgentChange?.(null);
  props._requestUpdate?.();
}

function renderExpandedConfigRow(agent: ClawDockAgent, props: CompanyFleetProps) {
  return html`
    <tr class="cd-fleet-row-expanded">
      <td colspan="10" class="cd-fleet-expanded-cell">
        ${renderExpandedConfig(agent, props)}
      </td>
    </tr>
  `;
}

const CONFIG_TABS: { id: CompanyConfigPanel; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
  { id: "channels", label: "Channels" },
  { id: "cron", label: "Cron Jobs" },
];

function renderExpandedConfig(agent: ClawDockAgent, props: CompanyFleetProps) {
  const managerOptions = (props.agents ?? []).filter((entry) => entry.id !== agent.id);
  const agentRunning = agent.status === "active" || agent.status === "starting";
  const isEditingThis = _editingAgentId === agent.id;
  const panel = props.configPanel ?? _companyConfigPanel;
  // Treat as ready when parent state matches or this row is locally expanded (avoids one-frame "Loading…" and keeps panel usable)
  const dataReady = props.expandedDataAgentId === agent.id || _expandedAgentId === agent.id;
  const fileCount =
    dataReady && props.agentFiles?.list?.agentId === agent.id
      ? (props.agentFiles.list.files?.length ?? null)
      : null;
  const skillCount =
    dataReady && props.agentSkills?.agentId === agent.id
      ? (props.agentSkills.report?.skills?.length ?? null)
      : null;
  const channelCount = props.channels?.snapshot
    ? Object.keys(props.channels.snapshot.channelAccounts ?? {}).length
    : null;
  const cronCount = dataReady
    ? (props.cron?.jobs ?? []).filter((j) => j.agentId === agent.id).length
    : null;
  const tabCounts: Record<string, number | null> = {
    files: fileCount ?? null,
    skills: skillCount ?? null,
    channels: channelCount ?? null,
    cron: cronCount ?? null,
  };

  return html`
    <div class="cd-agent-config-panel">
      ${
        agentRunning
          ? html`
              <div class="cd-agent-config-running-banner">
                <span class="cd-agent-config-running-banner__icon">⏳</span>
                <span>Agent is running. Configuration cannot be modified until the agent is idle.</span>
              </div>
            `
          : nothing
      }
      ${
        _updateError && isEditingThis
          ? html`
              <div role="alert" class="cd-agent-config-error">
                <span class="cd-agent-config-error__icon">${icons.alertTriangle}</span>
                <span>${_updateError}</span>
              </div>
            `
          : nothing
      }

      <div class="cd-agent-config-tabs">
        ${CONFIG_TABS.map(
          (tab) => html`
            <button
              type="button"
              class="cd-agent-config-tab ${panel === tab.id ? "cd-agent-config-tab--active" : ""}"
              @click=${() => {
                _companyConfigPanel = tab.id;
                props.onConfigPanelChange?.(tab.id);
                props._requestUpdate?.();
              }}
            >
              ${tab.label}${tabCounts[tab.id] != null ? html`<span class="cd-agent-config-tab-count">${tabCounts[tab.id]}</span>` : nothing}
            </button>
          `,
        )}
      </div>

      ${panel === "overview" ? renderExpandedOverview(agent, props, isEditingThis, managerOptions, agentRunning) : nothing}
      ${panel === "files" ? renderExpandedPanelFiles(agent, props, dataReady) : nothing}
      ${panel === "tools" ? renderExpandedPanelTools(agent, props, dataReady) : nothing}
      ${panel === "skills" ? renderExpandedPanelSkills(agent, props, dataReady) : nothing}
      ${panel === "channels" ? renderExpandedPanelChannels(agent, props, dataReady) : nothing}
      ${panel === "cron" ? renderExpandedPanelCron(agent, props, dataReady) : nothing}

      <div class="cd-agent-config-panel__footer">
        <button
          type="button"
          class="cd-btn cd-btn--sm cd-btn--ghost"
          @click=${() => {
            _expandedAgentId = null;
            props.onExpandedAgentChange?.(null);
            props._requestUpdate?.();
          }}
        >
          Collapse
        </button>
        ${
          panel === "overview"
            ? html`
                <button
                  type="button"
                  class="cd-btn cd-btn--sm cd-btn--primary"
                  ?disabled=${agentRunning || _updateLoading || !(isEditingThis ? _editFormData.role : agent.role).trim() || !(isEditingThis ? _editFormData.team : agent.team).trim()}
                  @click=${async () => {
                    if (_updateLoading) {
                      return;
                    }
                    _updateLoading = true;
                    _updateError = null;
                    props._requestUpdate?.();
                    try {
                      await props.onUpdate?.(agent.id, {
                        role: (isEditingThis ? _editFormData.role : agent.role).trim(),
                        team: (isEditingThis ? _editFormData.team : agent.team).trim(),
                        runtime: isEditingThis ? _editFormData.runtime : agent.runtime,
                        emoji: isEditingThis ? _editFormData.emoji : agent.emoji,
                        description: (isEditingThis
                          ? _editFormData.description
                          : (agent.description ?? "")
                        ).trim(),
                        reportTo:
                          (isEditingThis ? _editFormData.reportTo : (agent.reportTo ?? "")) || null,
                      });
                      _expandedAgentId = null;
                      props.onExpandedAgentChange?.(null);
                    } catch (err) {
                      _updateError = err instanceof Error ? err.message : String(err);
                    } finally {
                      _updateLoading = false;
                      props._requestUpdate?.();
                    }
                  }}
                >
                  ${_updateLoading ? "Saving…" : "Save Changes"}
                </button>
              `
            : nothing
        }
      </div>
    </div>
  `;
}

function renderExpandedOverview(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  isEditingThis: boolean,
  managerOptions: ClawDockAgent[],
  agentRunning: boolean,
) {
  return html`
      <section class="cd-agent-config-section">
        <h4 class="cd-agent-config-section__title">Overview</h4>
        <p class="cd-agent-config-section__sub">Workspace, model, and skills. Edit in main Agent page or below.</p>
        <div class="cd-agent-config-kv-grid">
          <div class="cd-agent-config-kv">
            <span class="cd-agent-config-kv__label">Workspace</span>
            <span class="cd-mono cd-agent-config-kv__val">${props.agentFiles?.list?.agentId === agent.id ? (props.agentFiles.list.workspace ?? "—") : "—"}</span>
          </div>
          <div class="cd-agent-config-kv">
            <span class="cd-agent-config-kv__label">Primary Model</span>
            <span class="cd-mono cd-agent-config-kv__val">${agent.model || "—"}</span>
          </div>
          <div class="cd-agent-config-kv">
            <span class="cd-agent-config-kv__label">Skills Filter</span>
            <span class="cd-agent-config-kv__val">${agent.skills?.length ? agent.skills.join(", ") : "all skills"}</span>
          </div>
          <div class="cd-agent-config-kv">
            <span class="cd-agent-config-kv__label">Fallbacks</span>
            <span class="cd-muted cd-agent-config-kv__val">—</span>
          </div>
        </div>
      </section>

      <section class="cd-agent-config-section">
        <h4 class="cd-agent-config-section__title">Identity & Role</h4>
        <p class="cd-agent-config-section__sub">${agent.emoji} ${agent.name} <span class="cd-mono">(${agent.id})</span></p>
        <div class="cd-agent-config-form">
          <div class="cd-form-row">
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Role</label>
              <input
                class="cd-form-input"
                type="text"
                .value=${isEditingThis ? _editFormData.role : agent.role}
                ?disabled=${agentRunning}
                @input=${(e: Event) => {
                  _editFormData.role = (e.target as HTMLInputElement).value;
                  if (!_editingAgentId) {
                    _editingAgentId = agent.id;
                  }
                  props._requestUpdate?.();
                }}
              />
            </div>
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Team</label>
              <input
                class="cd-form-input"
                type="text"
                .value=${isEditingThis ? _editFormData.team : agent.team}
                ?disabled=${agentRunning}
                @input=${(e: Event) => {
                  _editFormData.team = (e.target as HTMLInputElement).value;
                  if (!_editingAgentId) {
                    _editingAgentId = agent.id;
                  }
                  props._requestUpdate?.();
                }}
              />
            </div>
          </div>
          <div class="cd-form-row">
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Manager</label>
              <select
                class="cd-form-input"
                ?disabled=${agentRunning}
                .value=${isEditingThis ? _editFormData.reportTo : (agent.reportTo ?? "")}
                @change=${(e: Event) => {
                  _editFormData.reportTo = (e.target as HTMLSelectElement).value;
                  _editingAgentId = agent.id;
                  props._requestUpdate?.();
                }}
              >
                <option value="">None</option>
                ${managerOptions.map(
                  (entry) => html`
                    <option value=${entry.id} ?selected=${(isEditingThis ? _editFormData.reportTo : (agent.reportTo ?? "")) === entry.id}>
                      ${entry.emoji} ${entry.name}
                    </option>
                  `,
                )}
              </select>
            </div>
            <div class="cd-form-group cd-form-group--half">
              <label class="cd-form-label">Runtime</label>
              <select
                class="cd-form-input"
                ?disabled=${agentRunning}
                .value=${isEditingThis ? _editFormData.runtime : agent.runtime}
                @change=${(e: Event) => {
                  _editFormData.runtime = (e.target as HTMLSelectElement).value as ClawDockRuntime;
                  _editingAgentId = agent.id;
                  props._requestUpdate?.();
                }}
              >
                ${RUNTIMES.map(
                  (rt) => html`
                    <option value=${rt.value} ?selected=${(isEditingThis ? _editFormData.runtime : agent.runtime) === rt.value}>
                      ${rt.label}
                    </option>
                  `,
                )}
              </select>
            </div>
          </div>
          <div class="cd-form-group">
            <label class="cd-form-label">Emoji</label>
            <div class="cd-emoji-picker">
              ${PRESET_EMOJIS.map(
                (emoji) => html`
                  <button
                    type="button"
                    class="cd-emoji-chip ${(isEditingThis ? _editFormData.emoji : agent.emoji) === emoji ? "cd-emoji-chip--active" : ""}"
                    ?disabled=${agentRunning}
                    @click=${() => {
                      _editFormData.emoji = emoji;
                      _editingAgentId = agent.id;
                      props._requestUpdate?.();
                    }}
                  >${emoji}</button>
                `,
              )}
            </div>
          </div>
          <div class="cd-form-group">
            <label class="cd-form-label">Description</label>
            <textarea
              class="cd-form-input"
              rows="3"
              .value=${isEditingThis ? _editFormData.description : (agent.description ?? "")}
              ?disabled=${agentRunning}
              @input=${(e: Event) => {
                _editFormData.description = (e.target as HTMLTextAreaElement).value;
                _editingAgentId = agent.id;
                props._requestUpdate?.();
              }}
            ></textarea>
          </div>
        </div>
      </section>
  `;
}

function renderExpandedPanelFiles(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  dataReady: boolean,
) {
  if (!dataReady || !props.onLoadFiles || !props.onSelectFile) {
    return html`
      <div class="cd-agent-config-section">
        <p class="cd-muted">Loading workspace files…</p>
      </div>
    `;
  }
  const af = props.agentFiles;
  return html`
    <div class="cd-agent-config-panel-content">
      ${renderAgentFiles({
        agentId: agent.id,
        agentFilesList: af?.list ?? null,
        agentFilesLoading: af?.loading ?? false,
        agentFilesError: af?.error ?? null,
        agentFileActive: af?.active ?? null,
        agentFileContents: af?.contents ?? {},
        agentFileDrafts: af?.drafts ?? {},
        agentFileSaving: af?.saving ?? false,
        onLoadFiles: props.onLoadFiles,
        onSelectFile: props.onSelectFile,
        onFileDraftChange: props.onFileDraftChange ?? (() => {}),
        onFileReset: props.onFileReset ?? (() => {}),
        onFileSave: props.onFileSave ?? (() => {}),
      })}
    </div>
  `;
}

function renderExpandedPanelTools(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  dataReady: boolean,
) {
  if (!dataReady) {
    return html`
      <div class="cd-agent-config-section"><p class="cd-muted">Loading tools…</p></div>
    `;
  }
  const tc = props.toolsCatalog;
  return html`
    <div class="cd-agent-config-panel-content">
      ${renderAgentTools({
        agentId: agent.id,
        configForm: props.configForm ?? null,
        configLoading: props.configLoading ?? false,
        configSaving: props.configSaving ?? false,
        configDirty: props.configDirty ?? false,
        toolsCatalogLoading: tc?.loading ?? false,
        toolsCatalogError: tc?.error ?? null,
        toolsCatalogResult: tc?.result ?? null,
        onProfileChange: props.onToolsProfileChange ?? (() => {}),
        onOverridesChange: props.onToolsOverridesChange ?? (() => {}),
        onConfigReload: props.onConfigReload ?? (() => {}),
        onConfigSave: props.onConfigSave ?? (() => {}),
      })}
    </div>
  `;
}

function renderExpandedPanelSkills(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  dataReady: boolean,
) {
  if (!dataReady) {
    return html`
      <div class="cd-agent-config-section"><p class="cd-muted">Loading skills…</p></div>
    `;
  }
  const sk = props.agentSkills;
  return html`
    <div class="cd-agent-config-panel-content">
      ${renderAgentSkills({
        agentId: agent.id,
        report: sk?.report ?? null,
        loading: sk?.loading ?? false,
        error: sk?.error ?? null,
        activeAgentId: sk?.agentId ?? null,
        configForm: props.configForm ?? null,
        configLoading: props.configLoading ?? false,
        configSaving: props.configSaving ?? false,
        configDirty: props.configDirty ?? false,
        filter: sk?.filter ?? "",
        onFilterChange: props.onSkillsFilterChange ?? (() => {}),
        onRefresh: () => props.onSkillsRefresh?.(agent.id),
        onToggle: props.onAgentSkillToggle ?? (() => {}),
        onClear: props.onAgentSkillsClear ?? (() => {}),
        onDisableAll: props.onAgentSkillsDisableAll ?? (() => {}),
        onConfigReload: props.onConfigReload ?? (() => {}),
        onConfigSave: props.onConfigSave ?? (() => {}),
      })}
    </div>
  `;
}

function renderExpandedPanelChannels(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  _dataReady: boolean,
) {
  const ch = props.channels;
  const agentForContext = agent as unknown as AgentsListResult["agents"][number];
  const context = buildAgentContext(
    agentForContext,
    props.configForm ?? null,
    props.agentFiles?.list ?? null,
    null,
    null,
  );
  return html`
    <div class="cd-agent-config-panel-content">
      ${renderAgentChannels({
        context,
        configForm: props.configForm ?? null,
        snapshot: ch?.snapshot ?? null,
        loading: ch?.loading ?? false,
        error: ch?.error ?? null,
        lastSuccess: ch?.lastSuccess ?? null,
        onRefresh: props.onChannelsRefresh ?? (() => {}),
      })}
    </div>
  `;
}

function renderExpandedPanelCron(
  agent: ClawDockAgent,
  props: CompanyFleetProps,
  _dataReady: boolean,
) {
  const cr = props.cron;
  const agentForContext = agent as unknown as AgentsListResult["agents"][number];
  const context = buildAgentContext(
    agentForContext,
    props.configForm ?? null,
    props.agentFiles?.list ?? null,
    null,
    null,
  );
  return html`
    <div class="cd-agent-config-panel-content">
      ${renderAgentCron({
        context,
        agentId: agent.id,
        jobs: cr?.jobs ?? [],
        status: cr?.status ?? null,
        loading: cr?.loading ?? false,
        error: cr?.error ?? null,
        onRefresh: props.onCronRefresh ?? (() => {}),
        onRunNow: props.onCronRunNow ?? (() => {}),
      })}
    </div>
  `;
}

async function openAgentLogs(agent: ClawDockAgent, props: CompanyFleetProps) {
  _selectedLogAgentId = agent.id;
  _logsLoading = true;
  props._requestUpdate?.();
  try {
    await Promise.resolve(props.onLoadLogs?.(agent.id));
  } finally {
    _logsLoading = false;
    props._requestUpdate?.();
  }
}

function closeAgentLogs(props: CompanyFleetProps) {
  _selectedLogAgentId = null;
  _logsLoading = false;
  props._requestUpdate?.();
}

function renderAgentLogs(props: CompanyFleetProps) {
  const agent = props.agents?.find((entry) => entry.id === _selectedLogAgentId) ?? null;
  if (!agent) {
    _selectedLogAgentId = null;
    return nothing;
  }
  const logs = props.logs?.get(agent.id) ?? [];
  return renderCompanyAgentLogsPanel({
    agent,
    logs,
    loading: _logsLoading,
    onClose: () => closeAgentLogs(props),
    onRefresh: async () => {
      _logsLoading = true;
      props._requestUpdate?.();
      try {
        await Promise.resolve(props.onLoadLogs?.(agent.id));
      } finally {
        _logsLoading = false;
        props._requestUpdate?.();
      }
    },
  });
}

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

export type CompanyConfigPanel = "overview" | "files" | "tools" | "skills" | "channels" | "cron";

export type CompanyFleetProps = {
  agents?: ClawDockAgent[];
  logs?: Map<string, LogEntry[]>;
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
  onUpdate?: (
    agentId: string,
    params: {
      role?: string;
      team?: string;
      runtime?: string;
      emoji?: string;
      description?: string;
      reportTo?: string | null;
    },
  ) => Promise<void>;
  _requestUpdate?: () => void;
  /** When expand/collapse a row, notify parent to load panel data for this agent. */
  onExpandedAgentChange?: (agentId: string | null) => void;
  /** Agent id for which the panel data below was loaded. */
  expandedDataAgentId?: string | null;
  configPanel?: CompanyConfigPanel;
  onConfigPanelChange?: (panel: CompanyConfigPanel) => void;
  configForm?: Record<string, unknown> | null;
  agentFiles?: {
    list: AgentsFilesListResult | null;
    loading: boolean;
    error: string | null;
    active: string | null;
    contents: Record<string, string>;
    drafts: Record<string, string>;
    saving: boolean;
  };
  agentSkills?: {
    report: SkillStatusReport | null;
    loading: boolean;
    error: string | null;
    agentId: string | null;
    filter: string;
  };
  toolsCatalog?: {
    loading: boolean;
    error: string | null;
    result: ToolsCatalogResult | null;
  };
  channels?: {
    snapshot: ChannelsStatusSnapshot | null;
    loading: boolean;
    error: string | null;
    lastSuccess: number | null;
  };
  cron?: {
    jobs: CronJob[];
    status: CronStatus | null;
    loading: boolean;
    error: string | null;
  };
  configLoading?: boolean;
  configSaving?: boolean;
  configDirty?: boolean;
  onLoadFiles?: (agentId: string) => void;
  onSelectFile?: (name: string) => void;
  onFileDraftChange?: (name: string, content: string) => void;
  onFileReset?: (name: string) => void;
  onFileSave?: (name: string) => void;
  onLoadFileContent?: (agentId: string, name: string) => void;
  onSkillsRefresh?: (agentId: string) => void;
  onSkillsFilterChange?: (filter: string) => void;
  onAgentSkillToggle?: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear?: (agentId: string) => void;
  onAgentSkillsDisableAll?: (agentId: string) => void;
  onConfigReload?: () => void;
  onConfigSave?: () => void;
  onToolsProfileChange?: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange?: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onChannelsRefresh?: () => void;
  onCronRefresh?: () => void;
  onCronRunNow?: (jobId: string) => void;
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
            ${(props.agents ?? []).map(
              (a) =>
                html`${renderFleetRow(a, props)}${_expandedAgentId === a.id ? renderExpandedConfigRow(a, props) : nothing}`,
            )}
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
      ${renderAgentLogs(props)}
    </div>
  `;
}
