import { html } from "lit";
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
  assignee: string; // agent id
  assigneeEmoji: string;
  project: string;
  tags: string[];
  createdAt: string;
  dueAt?: string;
  tokensUsed?: number;
  blockedBy?: string;
};

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
];

// ── UI State ───────────────────────────────────────────────────────────────
let _filter = "All";
let _newTaskOpen = false;
let _newTask = {
  title: "",
  description: "",
  priority: "medium" as Priority,
  assignee: "",
  project: "",
  status: "backlog" as TaskStatus,
};
let _dragging: string | null = null;

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

const AGENTS = [
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
  if (_filter === "All") {
    return tasks;
  }
  return tasks.filter((t) => t.project === _filter);
}

function renderTask(task: Task) {
  return html`
    <div class="cd-kb-task"
      draggable="true"
      @dragstart=${() => {
        _dragging = task.id;
      }}
      @dragend=${() => {
        _dragging = null;
      }}
    >
      <!-- Priority + Project -->
      <div class="cd-kb-task__meta">
        <span class="cd-kb-priority" style="background:${priorityColor(task.priority)}20;color:${priorityColor(task.priority)};border-color:${priorityColor(task.priority)}40">
          ${task.priority}
        </span>
        <span class="cd-kb-project">${task.project}</span>
        ${task.dueAt ? html`<span class="cd-kb-due">📅 ${task.dueAt}</span>` : ""}
      </div>

      <!-- Title -->
      <div class="cd-kb-task__title">${task.title}</div>

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

      <!-- Footer: assignee + tokens + blocker -->
      <div class="cd-kb-task__footer">
        <span class="cd-kb-assignee" title="${task.assignee}">
          ${task.assigneeEmoji} <span>${task.assignee}</span>
        </span>
        ${task.tokensUsed ? html`<span class="cd-kb-tokens">${fmtTokens(task.tokensUsed)}</span>` : ""}
        ${task.blockedBy ? html`<span class="cd-kb-blocked">⛔ ${task.blockedBy}</span>` : ""}
      </div>

      <!-- Status actions on hover -->
      <div class="cd-kb-task__actions">
        <button class="cd-btn cd-btn--ghost cd-btn--xs" title="Open task">${icons.activity}</button>
        <button class="cd-btn cd-btn--ghost cd-btn--xs" title="Assign">${icons.users}</button>
        <button class="cd-btn cd-btn--ghost cd-btn--xs" title="Delete">${icons.trash}</button>
      </div>
    </div>
  `;
}

function renderColumn(col: (typeof COLUMNS)[0]) {
  const tasks = filterTasks(DEMO_TASKS.filter((t) => t.status === col.id));
  const totalTokens = tasks.reduce((s, t) => s + (t.tokensUsed ?? 0), 0);

  return html`
    <div class="cd-kb-col ${col.headerClass}"
      @dragover=${(e: DragEvent) => {
        e.preventDefault();
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        if (_dragging) {
          const task = DEMO_TASKS.find((t) => t.id === _dragging);
          if (task) {
            task.status = col.id;
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

export type CompanyTasksProps = Record<string, never>;

export function renderCompanyTasks(_props: CompanyTasksProps) {
  const total = filterTasks(DEMO_TASKS);
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
                    ${AGENTS.map((a) => html`<option value="${a.id}">${a.emoji} ${a.name}</option>`)}
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
                DEMO_TASKS.unshift({
                  id: `t-${Date.now()}`,
                  title: _newTask.title,
                  description: _newTask.description,
                  status: _newTask.status,
                  priority: _newTask.priority,
                  assignee: _newTask.assignee || "unassigned",
                  assigneeEmoji: AGENTS.find((a) => a.id === _newTask.assignee)?.emoji ?? "❓",
                  project: _newTask.project || "Unassigned",
                  tags: [],
                  createdAt: "Now",
                  tokensUsed: 0,
                });
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
    </div>
  `;
}
