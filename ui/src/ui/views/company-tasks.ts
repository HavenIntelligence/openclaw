import { html } from "lit";
import type { ClawDockAgent, Task as RealTask } from "../company-types.ts";
import { icons } from "../icons.ts";

// ── Types ──────────────────────────────────────────────────────────────────
type Priority = "critical" | "high" | "medium" | "low";
type TaskStatus = "backlog" | "in_progress" | "review" | "done";

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string; // agent id — who executes
  assigneeEmoji: string;
  assignedBy: string; // agent id — who delegated
  assignedByEmoji: string;
  assignedAt?: string; // formatted timestamp
  reviewedBy: string; // agent id — who reviews
  reviewNote?: string;
  roundCount: number;
  maxRounds: number;
  missionId?: string;
  project: string;
  tags: string[];
  createdAt: string;
  dueAt?: string;
  tokensUsed?: number;
  blockedBy?: string;
};

/** Fill in new required fields with sensible defaults for demo data. */
function demoTask(
  partial: Omit<
    Task,
    "assignedBy" | "assignedByEmoji" | "reviewedBy" | "roundCount" | "maxRounds"
  > &
    Partial<Task>,
): Task {
  return {
    assignedBy: partial.assignedBy ?? "ai-director",
    assignedByEmoji: partial.assignedByEmoji ?? "👑",
    reviewedBy: partial.reviewedBy ?? partial.assignedBy ?? "ai-director",
    roundCount: partial.roundCount ?? (partial.status === "done" ? 1 : 0),
    maxRounds: partial.maxRounds ?? 3,
    ...partial,
  };
}

// ── Demo data ──────────────────────────────────────────────────────────────
const DEMO_TASKS: Task[] = [
  // Backlog
  {
    id: "t-01",
    title: "Research competitor AI pricing models",
    description:
      "Analyze 10 top AI B2B SaaS companies, compile pricing tiers, feature comparison, and positioning.",
    status: "backlog",
    priority: "high",
    assignee: "research-alpha",
    assigneeEmoji: "🔍",
    project: "Project Alpha",
    tags: ["research", "competitive", "strategy"],
    createdAt: "Mar 12",
    dueAt: "Mar 18",
    tokensUsed: 0,
  },
  {
    id: "t-02",
    title: "Set up GDPR compliance checklist",
    description:
      "Draft internal checklist for GDPR compliance including DPA templates, data inventory, and consent mechanisms.",
    status: "backlog",
    priority: "medium",
    assignee: "compliance-mgr",
    assigneeEmoji: "✅",
    project: "Legal",
    tags: ["compliance", "gdpr", "legal"],
    createdAt: "Mar 11",
    tokensUsed: 0,
  },
  {
    id: "t-03",
    title: "Design onboarding email sequence",
    description:
      "Create 5-email drip sequence for new signups: welcome, activation tips, social proof, feature highlight, check-in.",
    status: "backlog",
    priority: "medium",
    assignee: "email-marketer",
    assigneeEmoji: "📧",
    project: "Growth",
    tags: ["email", "marketing", "onboarding"],
    createdAt: "Mar 10",
    dueAt: "Mar 20",
    tokensUsed: 0,
  },
  {
    id: "t-04",
    title: "Build agent health monitoring dashboard",
    description:
      "Real-time dashboard showing uptime, error rates, token usage, and alert thresholds for all deployed agents.",
    status: "backlog",
    priority: "high",
    assignee: "code-agent",
    assigneeEmoji: "💻",
    project: "Project Alpha",
    tags: ["engineering", "monitoring", "infrastructure"],
    createdAt: "Mar 13",
    tokensUsed: 0,
  },
  {
    id: "t-05",
    title: "Q1 investor update slide deck",
    description:
      "Compile Q1 metrics, milestones, team updates, and Q2 roadmap into investor-ready presentation.",
    status: "backlog",
    priority: "critical",
    assignee: "ai-director",
    assigneeEmoji: "👑",
    project: "Fundraise",
    tags: ["fundraise", "investors", "strategy"],
    createdAt: "Mar 12",
    dueAt: "Mar 17",
  },
  {
    id: "t-06",
    title: "SEO audit of docs.acme.ai",
    description:
      "Full technical SEO audit: crawl errors, page speed, structured data, internal linking, keyword gaps.",
    status: "backlog",
    priority: "medium",
    assignee: "seo-specialist",
    assigneeEmoji: "🔍",
    project: "Growth",
    tags: ["seo", "marketing", "docs"],
    createdAt: "Mar 9",
  },

  // In Progress
  {
    id: "t-07",
    title: "Write 'AI Agents in 2026' blog post",
    description:
      "2,500-word thought leadership post covering state of AI agents, use cases, and future predictions. Optimized for SEO.",
    status: "in_progress",
    priority: "high",
    assignee: "writing-beta",
    assigneeEmoji: "✍️",
    project: "Content Pipeline",
    tags: ["content", "blog", "seo"],
    createdAt: "Mar 11",
    dueAt: "Mar 14",
    tokensUsed: 84_200,
  },
  {
    id: "t-08",
    title: "Refactor MCP client retry logic",
    description:
      "Add exponential backoff, circuit breaker, and dead letter queue to prevent cascading failures.",
    status: "in_progress",
    priority: "critical",
    assignee: "code-agent",
    assigneeEmoji: "💻",
    project: "Project Alpha",
    tags: ["engineering", "reliability", "mcp"],
    createdAt: "Mar 12",
    tokensUsed: 142_800,
  },
  {
    id: "t-09",
    title: "Analyze user onboarding funnel drop-offs",
    description:
      "Use Amplitude to identify where users drop in first 7 days, segment by acquisition channel.",
    status: "in_progress",
    priority: "high",
    assignee: "data-analyst",
    assigneeEmoji: "📊",
    project: "Growth",
    tags: ["analytics", "product", "retention"],
    createdAt: "Mar 10",
    tokensUsed: 38_600,
  },
  {
    id: "t-10",
    title: "Draft seed round pitch narrative",
    description:
      "Compelling narrative covering problem, solution, traction, team, and market opportunity for Series Seed raise.",
    status: "in_progress",
    priority: "critical",
    assignee: "ai-director",
    assigneeEmoji: "👑",
    project: "Fundraise",
    tags: ["fundraise", "strategy", "narrative"],
    createdAt: "Mar 13",
    dueAt: "Mar 16",
    tokensUsed: 67_400,
  },
  {
    id: "t-11",
    title: "Set up automated test suite for API",
    description:
      "Write E2E tests for all /api/v1 endpoints with happy path + error cases. Integrate with CI.",
    status: "in_progress",
    priority: "high",
    assignee: "test-runner",
    assigneeEmoji: "🧪",
    project: "Project Alpha",
    tags: ["testing", "engineering", "ci"],
    createdAt: "Mar 11",
    tokensUsed: 95_300,
  },

  // Review
  {
    id: "t-12",
    title: "Review competitor analysis report",
    description:
      "research-alpha completed competitor analysis. Review for accuracy, gaps, and strategic implications.",
    status: "review",
    priority: "high",
    assignee: "ai-director",
    assigneeEmoji: "👑",
    project: "Project Alpha",
    tags: ["strategy", "review", "research"],
    createdAt: "Mar 10",
    tokensUsed: 182_400,
    blockedBy: "research-alpha",
  },
  {
    id: "t-13",
    title: "QA staging environment for v1.2.0",
    description:
      "Full regression test of staging before production deploy. Focus on auth flows and MCP tool calls.",
    status: "review",
    priority: "critical",
    assignee: "test-runner",
    assigneeEmoji: "🧪",
    project: "Project Alpha",
    tags: ["testing", "release", "qa"],
    createdAt: "Mar 12",
    tokensUsed: 74_100,
  },
  {
    id: "t-14",
    title: "PR #42: MCP client retry logic",
    description:
      "Code review for the MCP retry refactor. Check error handling paths and test coverage.",
    status: "review",
    priority: "high",
    assignee: "cto",
    assigneeEmoji: "⚙️",
    project: "Project Alpha",
    tags: ["code-review", "engineering", "mcp"],
    createdAt: "Mar 13",
    tokensUsed: 28_900,
  },

  // Done
  {
    id: "t-15",
    title: "Competitive pricing analysis",
    description: "Completed 10-company pricing analysis with tier comparison matrix.",
    status: "done",
    priority: "high",
    assignee: "research-alpha",
    assigneeEmoji: "🔍",
    project: "Project Alpha",
    tags: ["research", "strategy"],
    createdAt: "Mar 8",
    tokensUsed: 241_600,
  },
  {
    id: "t-16",
    title: "Set up GitHub Actions CI pipeline",
    description: "Full CI/CD pipeline with test, lint, build, and preview deploy stages.",
    status: "done",
    priority: "high",
    assignee: "devops-eng",
    assigneeEmoji: "🔧",
    project: "Project Alpha",
    tags: ["ci", "devops", "engineering"],
    createdAt: "Mar 7",
    tokensUsed: 89_200,
  },
  {
    id: "t-17",
    title: "Write company values and culture doc",
    description: "Defined 4 core values with behavioral examples and hiring implications.",
    status: "done",
    priority: "medium",
    assignee: "hr-manager",
    assigneeEmoji: "🧑‍💼",
    project: "Culture",
    tags: ["culture", "hr", "docs"],
    createdAt: "Mar 5",
    tokensUsed: 34_800,
  },
  {
    id: "t-18",
    title: "OKR Q1 kickoff presentation",
    description: "All-hands OKR presentation with company, team, and agent-level objectives.",
    status: "done",
    priority: "medium",
    assignee: "coo",
    assigneeEmoji: "🏢",
    project: "Operations",
    tags: ["okr", "planning", "strategy"],
    createdAt: "Mar 1",
    tokensUsed: 52_300,
  },
].map((t) => demoTask(t as Task));

// ── UI State ───────────────────────────────────────────────────────────────
let _filter = "All";
let _filterAgent = "All";
let _newTaskOpen = false;
let _newTask = {
  title: "",
  description: "",
  priority: "medium" as Priority,
  assignee: "",
  project: "",
  status: "backlog" as TaskStatus,
};

// ── Callbacks from props (module-level) ────────────────────────────────────
let _onCreateTask: CompanyTasksProps["onCreateTask"];
let _onUpdateTask: CompanyTasksProps["onUpdateTask"];
let _onDeleteTask: CompanyTasksProps["onDeleteTask"];
let _onNavigateToMission: CompanyTasksProps["onNavigateToMission"];

function navigateToMission(missionId: string, target: EventTarget | null) {
  // Try callback first
  if (_onNavigateToMission) {
    _onNavigateToMission(missionId);
    return;
  }
  // Direct fallback: set pending mission + find host element to switch tab
  (window as unknown as Record<string, unknown>).__openclawPendingMissionId = missionId;
  const el = target instanceof HTMLElement ? target : null;
  const host = el?.closest("openclaw-app") as
    | (HTMLElement & { setTab?: (tab: string) => void })
    | null;
  if (host?.setTab) {
    host.setTab("companyMonitor");
  }
}

let _dragging: string | null = null;
let _detailTaskId: string | null = null; // clicked task to show detail panel

/** Trigger a Lit re-render by finding the host element from an event target. */
function requestHostRender(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  const host = el?.closest("openclaw-app");
  if (host && "requestUpdate" in host) {
    (host as HTMLElement & { requestUpdate: () => void }).requestUpdate();
  }
}
// Active task list — set on each render from props or demo data.
let _activeTasks: Task[] = DEMO_TASKS;
// Active agent list for filter UI — lazily initialized from AGENTS on first render
let _activeAgents: { id: string; name: string; emoji: string }[] = [];

const COLUMNS: { id: TaskStatus; label: string; color: string; headerClass: string }[] = [
  { id: "backlog", label: "Backlog", color: "#94a3b8", headerClass: "cd-kb-col--backlog" },
  { id: "in_progress", label: "In Progress", color: "#60a5fa", headerClass: "cd-kb-col--progress" },
  { id: "review", label: "Review", color: "#fb923c", headerClass: "cd-kb-col--review" },
  { id: "done", label: "Done", color: "#22c55e", headerClass: "cd-kb-col--done" },
];

const PROJECTS = [
  "All",
  "Project Alpha",
  "Project Beta",
  "Content Pipeline",
  "Growth",
  "Fundraise",
  "Legal",
  "Operations",
  "Culture",
];

const _AGENTS = [
  { id: "ai-director", name: "ai-director", emoji: "👑" },
  { id: "ops-prime", name: "ops-prime", emoji: "🏢" },
  { id: "code-agent", name: "code-agent", emoji: "💻" },
  { id: "test-runner", name: "test-runner", emoji: "🧪" },
  { id: "research-alpha", name: "research-alpha", emoji: "🔍" },
  { id: "writing-beta", name: "writing-beta", emoji: "✍️" },
  { id: "review-gamma", name: "review-gamma", emoji: "📝" },
];

function priorityColor(p: Priority): string {
  return p === "critical"
    ? "#ef4444"
    : p === "high"
      ? "#f97316"
      : p === "medium"
        ? "#60a5fa"
        : "#94a3b8";
}

function fmtTokens(n: number): string {
  if (!n) {
    return "";
  }
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K tk` : `${n} tk`;
}

function filterTasks(tasks: Task[]): Task[] {
  let filtered = tasks;
  if (_filter !== "All") {
    filtered = filtered.filter((t) => t.project === _filter);
  }
  if (_filterAgent !== "All") {
    filtered = filtered.filter((t) => t.assignee === _filterAgent);
  }
  return filtered;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Map real Task + agent list to the internal display Task shape. */
function mapRealTask(rt: RealTask, agents: ClawDockAgent[]): Task {
  const agent = agents.find((a) => a.id === rt.assignee);
  const assigner = agents.find((a) => a.id === rt.assignedBy);
  const _reviewer = agents.find((a) => a.id === (rt.reviewedBy ?? rt.assignedBy));
  return {
    id: rt.id,
    title: rt.title,
    description: rt.description ?? "",
    status: rt.status,
    priority: rt.priority,
    assignee: rt.assignee ?? "unassigned",
    assigneeEmoji: agent?.emoji ?? "❓",
    assignedBy: rt.assignedBy ?? "system",
    assignedByEmoji: assigner?.emoji ?? "🔧",
    assignedAt: rt.assignedAt ? fmtDate(rt.assignedAt) : undefined,
    reviewedBy: rt.reviewedBy ?? rt.assignedBy ?? "system",
    reviewNote: rt.reviewNote,
    roundCount: rt.roundCount ?? 0,
    maxRounds: rt.maxRounds ?? 3,
    missionId: rt.missionId,
    project: rt.project ?? "Unassigned",
    tags: rt.tags ?? [],
    createdAt: fmtDate(rt.createdAt),
    dueAt: rt.dueAt ? fmtDate(rt.dueAt) : undefined,
    tokensUsed: rt.tokensUsed,
    blockedBy: rt.blockedBy?.[0],
  };
}

function isErrorTask(task: Task): boolean {
  return !!(
    task.reviewNote &&
    (task.reviewNote.startsWith("Failed") ||
      task.reviewNote.startsWith("Error") ||
      task.reviewNote.startsWith("Crashed") ||
      task.reviewNote.includes("error") ||
      task.reviewNote.includes("exception") ||
      task.reviewNote.includes("timed out"))
  );
}

function renderTask(task: Task) {
  const roundLabel = task.roundCount > 0 ? `R${task.roundCount}/${task.maxRounds}` : "";
  const hasError = isErrorTask(task);
  return html`
    <div class="cd-kb-task" style="${hasError ? "border-left:3px solid #f43f5e;" : ""}"
      draggable="true"
      @dragstart=${() => {
        _dragging = task.id;
      }}
      @dragend=${() => {
        _dragging = null;
      }}
      @click=${(e: Event) => {
        // Don't open detail when clicking action buttons
        if ((e.target as HTMLElement).closest(".cd-kb-task__actions")) {
          return;
        }
        _detailTaskId = _detailTaskId === task.id ? null : task.id;
        requestHostRender(e.target);
      }}
    >
      <!-- Priority + Project + Round -->
      <div class="cd-kb-task__meta">
        <span class="cd-kb-priority" style="background:${priorityColor(task.priority)}20;color:${priorityColor(task.priority)};border-color:${priorityColor(task.priority)}40">
          ${task.priority}
        </span>
        <span class="cd-kb-project">${task.project}</span>
        ${roundLabel ? html`<span class="cd-kb-round">${roundLabel}</span>` : ""}
        ${task.dueAt ? html`<span class="cd-kb-due">📅 ${task.dueAt}</span>` : ""}
      </div>

      <!-- Mission -->
      ${
        task.missionId
          ? html`<div class="cd-kb-task__mission" title="Open in Monitor: ${task.missionId}" style="cursor:pointer" @click=${(
              e: Event,
            ) => {
              e.stopPropagation();
              navigateToMission(task.missionId!, e.target);
            }}>🎯 ${task.missionId.replace(/^mission_/, "").slice(0, 16)}</div>`
          : ""
      }

      <!-- Title -->
      <div class="cd-kb-task__title" style="${hasError ? "display:flex;align-items:center;gap:6px" : ""}">
        ${task.title}
        ${hasError ? html`<span style="display:inline-flex;align-items:center;justify-content:center;background:#f43f5e;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;padding:0 4px;flex-shrink:0" title="${task.reviewNote}">!</span>` : ""}
      </div>

      <!-- Description (truncated) -->
      <div class="cd-kb-task__desc">${task.description}</div>

      <!-- Tags -->
      ${
        task.tags.length
          ? html`
        <div class="cd-kb-task__tags">
          ${task.tags.map((tag) => html`<span class="cd-kb-tag">${tag}</span>`)}
        </div>
      `
          : ""
      }

      <!-- Assignment info: assigned by → assignee, review by -->
      <div class="cd-kb-task__assign-row">
        <span class="cd-kb-assign-by" title="Assigned by ${task.assignedBy}">
          ${task.assignedByEmoji} <span class="cd-kb-assign-label">by</span>
        </span>
        <span class="cd-kb-assign-arrow">→</span>
        <span class="cd-kb-assignee" title="Assigned to ${task.assignee}">
          ${task.assigneeEmoji} <span>${task.assignee}</span>
        </span>
        ${task.assignedAt ? html`<span class="cd-kb-assign-ts">${task.assignedAt}</span>` : ""}
      </div>

      <!-- Footer: tokens + blocker + review info -->
      <div class="cd-kb-task__footer">
        ${task.tokensUsed ? html`<span class="cd-kb-tokens">${fmtTokens(task.tokensUsed)}</span>` : ""}
        ${task.blockedBy ? html`<span class="cd-kb-blocked">⛔ ${task.blockedBy}</span>` : ""}
        ${task.reviewNote ? html`<span class="cd-kb-review-note" title="${task.reviewNote}">💬</span>` : ""}
      </div>

      <!-- Status actions on hover -->
      <div class="cd-kb-task__actions">
        ${
          task.status === "review"
            ? html`
          <button class="cd-btn cd-btn--ghost cd-btn--xs cd-btn--ok" title="Approve → Done"
            @click=${() => {
              if (_onUpdateTask) {
                _onUpdateTask(task.id, { status: "done", reviewNote: "Approved" });
              }
            }}>✅</button>
          <button class="cd-btn cd-btn--ghost cd-btn--xs cd-btn--warn" title="Return → In Progress"
            @click=${() => {
              if (_onUpdateTask) {
                _onUpdateTask(task.id, { status: "in_progress", roundCount: task.roundCount + 1 });
              }
            }}>🔄</button>
        `
            : ""
        }
        <button class="cd-btn cd-btn--ghost cd-btn--xs" title="Assign">${icons.users}</button>
        <button class="cd-btn cd-btn--ghost cd-btn--xs" title="Delete"
          @click=${() => {
            if (_onDeleteTask) {
              _onDeleteTask(task.id);
            }
          }}>${icons.trash}</button>
      </div>
    </div>
  `;
}

function renderColumn(col: (typeof COLUMNS)[0]) {
  const tasks = filterTasks(_activeTasks.filter((t) => t.status === col.id));
  const totalTokens = tasks.reduce((s, t) => s + (t.tokensUsed ?? 0), 0);

  return html`
    <div class="cd-kb-col ${col.headerClass}"
      @dragover=${(e: DragEvent) => {
        e.preventDefault();
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        if (_dragging) {
          const task = _activeTasks.find((t) => t.id === _dragging);
          if (task && task.status !== col.id) {
            task.status = col.id;
            _onUpdateTask?.(_dragging, { status: col.id as RealTask["status"] });
          }
          _dragging = null;
        }
      }}
    >
      <!-- Column header -->
      <div class="cd-kb-col__header">
        <div class="cd-kb-col__title">
          <span class="cd-kb-col__dot" style="background:${col.color}"></span>
          ${col.label}
          <span class="cd-kb-col__count">${tasks.length}</span>
        </div>
        ${totalTokens ? html`<span class="cd-kb-col__tokens">${fmtTokens(totalTokens)}</span>` : ""}
        <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
          _newTask.status = col.id;
          _newTaskOpen = true;
        }}>${icons.plus}</button>
      </div>

      <!-- Tasks -->
      <div class="cd-kb-col__body">
        ${tasks.map(renderTask)}
        ${
          tasks.length === 0
            ? html`
                <div class="cd-kb-col__empty">Drop tasks here</div>
              `
            : ""
        }
      </div>
    </div>
  `;
}

export type CompanyTasksProps = {
  tasks?: RealTask[];
  agents?: ClawDockAgent[];
  onCreateTask?: (params: Omit<RealTask, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateTask?: (id: string, partial: Partial<RealTask>) => void;
  onDeleteTask?: (id: string) => void;
  onAssignTask?: (taskId: string, agentId: string) => void;
  onNavigateToMission?: (missionId: string) => void;
  /** @deprecated use onCreateTask */
  onCreate?: (params: Omit<RealTask, "id" | "createdAt" | "updatedAt">) => Promise<void>;
};

export function renderCompanyTasks(props: CompanyTasksProps) {
  // Update module-level active lists from props each render — no demo data fallback
  _activeTasks =
    props.tasks && props.tasks.length > 0
      ? props.tasks.map((t) => mapRealTask(t, props.agents ?? []))
      : [];
  _activeAgents =
    props.agents && props.agents.length > 0
      ? props.agents.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }))
      : [];
  _onCreateTask = props.onCreateTask;
  _onUpdateTask = props.onUpdateTask;
  _onDeleteTask = props.onDeleteTask;
  _onNavigateToMission = props.onNavigateToMission;

  const total = filterTasks(_activeTasks);
  const done = total.filter((t) => t.status === "done").length;
  const inFlight = total.filter((t) => t.status === "in_progress").length;
  const criticals = total.filter((t) => t.priority === "critical").length;
  const totalTokens = total.reduce((s, t) => s + (t.tokensUsed ?? 0), 0);

  return html`
    <div class="cd-page cd-tasks-page">

      <!-- Header -->
      <div class="cd-tasks-header">
        <div class="cd-tasks-header__left">
          <h2 class="cd-tasks-title">${icons.activity} Tasks</h2>
          <span class="cd-tasks-sub">Assign and track work across agents</span>
        </div>
        <div class="cd-tasks-header__right">
          <!-- Project filter -->
          <select class="cd-tasks-select"
            .value=${_filter}
            @change=${(e: Event) => {
              _filter = (e.target as HTMLSelectElement).value;
            }}>
            ${PROJECTS.map((p) => html`<option value="${p}">${p}</option>`)}
          </select>
          <button class="cd-btn cd-btn--primary" @click=${() => {
            _newTaskOpen = true;
          }}>
            ${icons.plus} New Task
          </button>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="cd-tasks-stats">
        <div class="cd-tasks-stat"><span>${total.length}</span><span>Total</span></div>
        <div class="cd-tasks-stat"><span style="color:var(--ok)">${done}</span><span>Done</span></div>
        <div class="cd-tasks-stat"><span style="color:#60a5fa">${inFlight}</span><span>In Progress</span></div>
        <div class="cd-tasks-stat"><span style="color:#ef4444">${criticals}</span><span>Critical</span></div>
        <div class="cd-tasks-stat"><span style="color:#a78bfa">${(totalTokens / 1000).toFixed(0)}K</span><span>Tokens Used</span></div>
        <div class="cd-tasks-stat">
          <span style="color:var(--ok)">${Math.round((done / (total.length || 1)) * 100)}%</span>
          <span>Complete</span>
        </div>
      </div>

      <!-- Agent filter row -->
      <div class="cd-tasks-agent-filter">
        <span class="cd-tasks-agent-filter__label">Filter by agent:</span>
        <button class="cd-log-af-btn ${_filterAgent === "All" ? "cd-log-af-btn--active" : ""}"
          @click=${() => {
            _filterAgent = "All";
          }}>All</button>
        ${_activeAgents.map(
          (a) => html`
            <button class="cd-log-af-btn ${_filterAgent === a.id ? "cd-log-af-btn--active" : ""}"
              @click=${() => {
                _filterAgent = _filterAgent === a.id ? "All" : a.id;
              }}>
              ${a.emoji} ${a.name}
            </button>
          `,
        )}
      </div>

      <!-- Kanban board -->
      <div class="cd-kb-board">
        ${COLUMNS.map(renderColumn)}
      </div>

      <!-- New Task modal -->
      ${
        _newTaskOpen
          ? html`
        <div class="cd-modal-overlay" @click=${(e: Event) => {
          if ((e.target as HTMLElement).classList.contains("cd-modal-overlay")) {
            _newTaskOpen = false;
          }
        }}>
          <div class="cd-modal">
            <div class="cd-modal__header">
              <span class="cd-modal__title">New Task</span>
              <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
                _newTaskOpen = false;
              }}>${icons.x}</button>
            </div>
            <div class="cd-modal__body">
              <label class="cd-form-label">Title</label>
              <input class="cd-form-input" type="text" placeholder="What needs to be done?"
                .value=${_newTask.title}
                @input=${(e: Event) => {
                  _newTask.title = (e.target as HTMLInputElement).value;
                }} />

              <label class="cd-form-label">Description</label>
              <textarea class="cd-form-textarea" placeholder="Detailed brief for the agent…" rows="3"
                .value=${_newTask.description}
                @input=${(e: Event) => {
                  _newTask.description = (e.target as HTMLTextAreaElement).value;
                }}></textarea>

              <div class="cd-form-row">
                <div>
                  <label class="cd-form-label">Priority</label>
                  <select class="cd-form-select"
                    .value=${_newTask.priority}
                    @change=${(e: Event) => {
                      _newTask.priority = (e.target as HTMLSelectElement).value as Priority;
                    }}>
                    <option value="critical">🔴 Critical</option>
                    <option value="high">🟠 High</option>
                    <option value="medium" selected>🔵 Medium</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>
                <div>
                  <label class="cd-form-label">Assign to</label>
                  <select class="cd-form-select"
                    @change=${(e: Event) => {
                      _newTask.assignee = (e.target as HTMLSelectElement).value;
                    }}>
                    <option value="">Select agent…</option>
                    ${_activeAgents.map((a) => html`<option value="${a.id}">${a.emoji} ${a.name}</option>`)}
                  </select>
                </div>
                <div>
                  <label class="cd-form-label">Project</label>
                  <select class="cd-form-select"
                    @change=${(e: Event) => {
                      _newTask.project = (e.target as HTMLSelectElement).value;
                    }}>
                    ${PROJECTS.filter((p) => p !== "All").map((p) => html`<option value="${p}">${p}</option>`)}
                  </select>
                </div>
              </div>

              <label class="cd-form-label">Status column</label>
              <div class="cd-form-status-tabs">
                ${COLUMNS.map(
                  (c) => html`
                  <button class="cd-btn ${_newTask.status === c.id ? "cd-btn--primary" : "cd-btn--outline"} cd-btn--sm"
                    @click=${() => {
                      _newTask.status = c.id;
                    }}>
                    ${c.label}
                  </button>
                `,
                )}
              </div>
            </div>
            <div class="cd-modal__footer">
              <button class="cd-btn cd-btn--ghost" @click=${() => {
                _newTaskOpen = false;
              }}>Cancel</button>
              <button class="cd-btn cd-btn--primary" @click=${() => {
                if (!_newTask.title.trim()) {
                  return;
                }
                const now = Date.now();
                const draft: Task = demoTask({
                  id: `t-${now}`,
                  title: _newTask.title,
                  description: _newTask.description,
                  status: _newTask.status,
                  priority: _newTask.priority,
                  assignee: _newTask.assignee || "unassigned",
                  assigneeEmoji:
                    _activeAgents.find((a) => a.id === _newTask.assignee)?.emoji ?? "❓",
                  project: _newTask.project || "Unassigned",
                  tags: [],
                  createdAt: fmtDate(now),
                  tokensUsed: 0,
                });
                _activeTasks.unshift(draft);
                const createParams = {
                  title: _newTask.title,
                  description: _newTask.description || undefined,
                  status: _newTask.status,
                  priority: _newTask.priority,
                  assignee: _newTask.assignee || undefined,
                  project: _newTask.project || undefined,
                };
                if (_onCreateTask) {
                  _onCreateTask(createParams);
                } else if (props.onCreate) {
                  void props.onCreate(createParams);
                }
                _newTask = {
                  title: "",
                  description: "",
                  priority: "medium",
                  assignee: "",
                  project: "",
                  status: "backlog",
                };
                _newTaskOpen = false;
              }}>Create Task</button>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Task detail panel (slide-in) -->
      ${(() => {
        if (!_detailTaskId) {
          return "";
        }
        const task = _activeTasks.find((t) => t.id === _detailTaskId);
        if (!task) {
          return "";
        }
        return html`
          <div class="cd-task-detail-overlay" @click=${(e: Event) => {
            if ((e.target as HTMLElement).classList.contains("cd-task-detail-overlay")) {
              _detailTaskId = null;
              requestHostRender(e.target);
            }
          }}>
            <div class="cd-task-detail">
              <div class="cd-task-detail__header">
                <span class="cd-kb-priority" style="background:${priorityColor(task.priority)}20;color:${priorityColor(task.priority)};border-color:${priorityColor(task.priority)}40">
                  ${task.priority}
                </span>
                <span class="cd-task-detail__title">${task.title}</span>
                <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${(e: Event) => {
                  _detailTaskId = null;
                  requestHostRender(e.target);
                }}>
                  ${icons.x}
                </button>
              </div>

              <div class="cd-task-detail__body">
                <!-- Status -->
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Status</span>
                  <span class="cd-task-detail__value cd-task-detail__status--${task.status}">
                    ${task.status.replace("_", " ")}
                  </span>
                </div>

                <!-- Description -->
                ${
                  task.description
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Description</span>
                    <p class="cd-task-detail__desc">${task.description}</p>
                  </div>
                `
                    : ""
                }

                <!-- Assignment -->
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Assigned to</span>
                  <span class="cd-task-detail__value">${task.assigneeEmoji} ${task.assignee}</span>
                </div>
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Assigned by</span>
                  <span class="cd-task-detail__value">${task.assignedByEmoji} ${task.assignedBy}</span>
                </div>

                <!-- Time info -->
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Created</span>
                  <span class="cd-task-detail__value">${task.createdAt}</span>
                </div>
                ${
                  task.assignedAt
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Assigned</span>
                    <span class="cd-task-detail__value">${task.assignedAt}</span>
                  </div>
                `
                    : ""
                }

                <!-- Review info -->
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Reviewer</span>
                  <span class="cd-task-detail__value">${task.reviewedBy}</span>
                </div>
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Round</span>
                  <span class="cd-task-detail__value">${task.roundCount} / ${task.maxRounds}</span>
                </div>
                ${
                  task.reviewNote
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Review note</span>
                    <p class="cd-task-detail__desc">${task.reviewNote}</p>
                  </div>
                `
                    : ""
                }

                ${
                  isErrorTask(task)
                    ? html`
                  <div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.25);border-radius:8px;padding:10px 12px;margin:4px 0">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                      <span style="color:#f43f5e;font-size:14px">⚠</span>
                      <span style="color:#f43f5e;font-size:12px;font-weight:600">Abnormal Termination</span>
                    </div>
                    <p style="color:#fca5a5;font-size:11px;line-height:1.5;margin:0;white-space:pre-wrap">${task.reviewNote}</p>
                  </div>
                `
                    : ""
                }

                <!-- Mission + Project + Tokens -->
                ${
                  task.missionId
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Mission</span>
                    <a
                      class="cd-task-detail__value"
                      href="javascript:void(0)"
                      style="color:#60a5fa;font-family:monospace;font-size:11px;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(96,165,250,0.3);text-underline-offset:2px"
                      title="Open in Monitor"
                      @click=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigateToMission(task.missionId!, e.target);
                      }}
                    >${task.missionId}</a>
                  </div>
                `
                    : ""
                }
                <div class="cd-task-detail__field">
                  <span class="cd-task-detail__label">Project</span>
                  <span class="cd-task-detail__value">${task.project}</span>
                </div>
                ${
                  task.tokensUsed
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Tokens used</span>
                    <span class="cd-task-detail__value" style="color:#a78bfa">${fmtTokens(task.tokensUsed)}</span>
                  </div>
                `
                    : ""
                }

                <!-- Tags -->
                ${
                  task.tags.length
                    ? html`
                  <div class="cd-task-detail__field">
                    <span class="cd-task-detail__label">Tags</span>
                    <div class="cd-kb-task__tags">
                      ${task.tags.map((tag) => html`<span class="cd-kb-tag">${tag}</span>`)}
                    </div>
                  </div>
                `
                    : ""
                }
              </div>

              <!-- Actions -->
              <div class="cd-task-detail__actions">
                ${
                  task.status === "review"
                    ? html`
                  <button class="cd-btn cd-btn--sm cd-btn--primary" @click=${() => {
                    if (_onUpdateTask) {
                      _onUpdateTask(task.id, { status: "done", reviewNote: "Approved" });
                    }
                    _detailTaskId = null;
                  }}>Approve</button>
                  <button class="cd-btn cd-btn--sm cd-btn--outline" @click=${() => {
                    if (_onUpdateTask) {
                      _onUpdateTask(task.id, {
                        status: "in_progress",
                        roundCount: task.roundCount + 1,
                      });
                    }
                    _detailTaskId = null;
                  }}>Return to WIP</button>
                `
                    : ""
                }
                <button class="cd-btn cd-btn--sm cd-btn--ghost" style="margin-left:auto;color:var(--destructive)" @click=${() => {
                  if (_onDeleteTask) {
                    _onDeleteTask(task.id);
                  }
                  _detailTaskId = null;
                }}>Delete</button>
              </div>
            </div>
          </div>
        `;
      })()}
    </div>
  `;
}
