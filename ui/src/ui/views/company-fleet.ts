import { html } from "lit";
import type { ClawDockAgent } from "../company-types.ts";
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

const DEMO_FLEET: FleetAgent[] = [
  {
    id: "research-alpha",
    name: "research-alpha",
    team: "content-pipeline",
    role: "Researcher",
    model: "claude-opus-4-5",
    status: "running",
    tasksCompleted: 12,
    tasksRunning: 1,
    tokensUsed: 480_000,
    cpuPercent: 12,
    memoryMb: 320,
    uptime: "4h 22m",
    lastActivity: "30s ago",
  },
  {
    id: "writing-beta",
    name: "writing-beta",
    team: "content-pipeline",
    role: "Writer",
    model: "claude-sonnet-4-5",
    status: "running",
    tasksCompleted: 28,
    tasksRunning: 2,
    tokensUsed: 920_000,
    cpuPercent: 28,
    memoryMb: 410,
    uptime: "4h 22m",
    lastActivity: "12s ago",
  },
  {
    id: "review-gamma",
    name: "review-gamma",
    team: "content-pipeline",
    role: "Reviewer",
    model: "claude-haiku-4-5",
    status: "crashed",
    tasksCompleted: 0,
    tasksRunning: 0,
    tokensUsed: 0,
    cpuPercent: 0,
    memoryMb: 0,
    uptime: "—",
    lastActivity: "7m ago (crash)",
  },
  {
    id: "code-agent",
    name: "code-agent",
    team: "devops",
    role: "Engineer",
    model: "claude-opus-4-5",
    status: "running",
    tasksCompleted: 47,
    tasksRunning: 3,
    tokensUsed: 1_040_000,
    cpuPercent: 44,
    memoryMb: 680,
    uptime: "6h 10m",
    lastActivity: "5s ago",
  },
  {
    id: "test-runner",
    name: "test-runner",
    team: "devops",
    role: "QA",
    model: "gpt-4o",
    status: "running",
    tasksCompleted: 31,
    tasksRunning: 1,
    tokensUsed: 320_000,
    cpuPercent: 18,
    memoryMb: 290,
    uptime: "6h 10m",
    lastActivity: "1m ago",
  },
  {
    id: "nanoclaw-primary",
    name: "nanoclaw-primary",
    team: "personal-assistant",
    role: "Personal AI",
    model: "claude-sonnet-4-5",
    status: "idle",
    tasksCompleted: 24,
    tasksRunning: 0,
    tokensUsed: 80_000,
    cpuPercent: 0,
    memoryMb: 140,
    uptime: "8h 00m",
    lastActivity: "22m ago",
  },
];

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

/** Map ClawDockAgent to the internal FleetAgent shape. */
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

export type CompanyFleetProps = {
  agents?: ClawDockAgent[];
  onStart?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
  onRestart?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onResume?: (agentId: string) => void;
  onLoadLogs?: (agentId: string) => void;
};

export function renderCompanyFleet(props: CompanyFleetProps) {
  const fleet =
    props.agents && props.agents.length > 0 ? props.agents.map(toFleetAgent) : DEMO_FLEET;
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
          <button class="cd-btn cd-btn--sm cd-btn--outline" @click=${() => {
            fleet.filter((a) => a.status === "crashed").forEach((a) => props.onRestart?.(a.id));
          }}>
            ${icons.rotateCounterClockwise} Restart crashed
          </button>
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
    </div>
  `;
}
