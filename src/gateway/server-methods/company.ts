import { getCompanyService } from "../../company/company-service.js";
import type { GatewayRequestHandlers } from "./types.js";

/** Type-safe extraction of a string param field. */
function strParam(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * Gateway RPC handlers for the company.* namespace.
 *
 * All handlers delegate to CompanyService which must be initialized
 * before these handlers are invoked.
 */
export const companyHandlers: GatewayRequestHandlers = {
  // ── Agent list / CRUD ───────────────────────────────────────────────────
  "company.agents.list": ({ respond }) => {
    const svc = getCompanyService();
    const agents = svc.registry.getAgents();
    // Merge runtime state into each agent
    const states = svc.processManager.getAllStates();
    const stateById = new Map(states.map((s) => [s.agentId, s]));
    const result = agents.map((a) => {
      const s = stateById.get(a.id);
      if (!s) {
        return a;
      }
      return {
        ...a,
        status: s.status,
        pid: s.pid,
        startedAt: s.startedAt,
        lastActiveAt: s.lastActiveAt,
        cpuPercent: s.cpuPercent,
        memoryMb: s.memoryMb,
        tokensUsed: s.tokensUsed,
        tasksCompleted: s.tasksCompleted,
        currentTask: s.currentTask,
      };
    });
    respond(true, result, undefined);
  },

  "company.agents.get": ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    const agent = svc.registry.getAgent(id);
    if (!agent) {
      respond(false, undefined, { code: "NOT_FOUND", message: `agent "${id}" not found` });
      return;
    }
    const s = svc.processManager.getState(id);
    respond(true, mergeState(agent, s), undefined);
  },

  "company.agents.update": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    const meta = await svc.registry.upsertMeta(id, {
      role: typeof params.role === "string" ? params.role : undefined,
      team: typeof params.team === "string" ? params.team : undefined,
      emoji: typeof params.emoji === "string" ? params.emoji : undefined,
      color: typeof params.color === "string" ? params.color : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
      runtime: typeof params.runtime === "string" ? (params.runtime as never) : undefined,
      reportTo: typeof params.reportTo === "string" ? params.reportTo : undefined,
      directReports: Array.isArray(params.directReports)
        ? (params.directReports as string[])
        : undefined,
    });
    const agent = svc.registry.getAgent(id);
    respond(true, agent ?? meta, undefined);
  },

  "company.agents.delete": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.registry.deleteMeta(id);
    respond(true, { ok: true }, undefined);
  },

  // ── Process control ────────────────────────────────────────────────────
  "company.agents.start": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    const task = typeof params.task === "string" ? params.task : "Start and await tasks";
    try {
      const runId = await svc.processManager.runTask(id, task);
      respond(true, { ok: true, runId }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  "company.agents.stop": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.processManager.stop(id);
    respond(true, { ok: true }, undefined);
  },

  "company.agents.restart": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.processManager.restart(id);
    respond(true, { ok: true }, undefined);
  },

  "company.agents.pause": ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    svc.processManager.pause(id);
    respond(true, { ok: true }, undefined);
  },

  "company.agents.resume": ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    svc.processManager.resume(id);
    respond(true, { ok: true }, undefined);
  },

  "company.agents.run": async ({ params, respond }) => {
    const id = strParam(params.id);
    const prompt = strParam(params.prompt);
    if (!id || !prompt) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id and prompt required" });
      return;
    }
    const svc = getCompanyService();
    try {
      const runId = await svc.processManager.runTask(id, prompt);
      respond(true, { runId }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  "company.agents.logs": ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const limit = typeof params.limit === "number" ? params.limit : 100;
    const sinceTs = typeof params.sinceTs === "number" ? params.sinceTs : undefined;
    const svc = getCompanyService();
    const logs = svc.logStore.get(id, { limit, sinceTs });
    respond(true, logs, undefined);
  },

  // ── Fleet ──────────────────────────────────────────────────────────────
  "company.fleet.snapshot": ({ respond }) => {
    const svc = getCompanyService();
    const snapshot = svc.fleetMonitor.getSnapshot();
    if (!snapshot) {
      // Return empty snapshot before first poll
      respond(
        true,
        {
          agents: [],
          totalRunning: 0,
          totalIdle: 0,
          totalCrashed: 0,
          totalTasks: 0,
          ts: Date.now(),
        },
        undefined,
      );
      return;
    }
    respond(true, snapshot, undefined);
  },

  // ── Profile ────────────────────────────────────────────────────────────
  "company.profile.get": ({ respond }) => {
    const svc = getCompanyService();
    respond(true, svc.profileStore.get(), undefined);
  },

  "company.profile.set": async ({ params, respond }) => {
    const svc = getCompanyService();
    const updated = await svc.profileStore.set({
      name: typeof params.name === "string" ? params.name : undefined,
      mission: typeof params.mission === "string" ? params.mission : undefined,
      vision: typeof params.vision === "string" ? params.vision : undefined,
      values: Array.isArray(params.values) ? (params.values as string[]) : undefined,
      businessModel: typeof params.businessModel === "string" ? params.businessModel : undefined,
      focusAreas: Array.isArray(params.focusAreas) ? (params.focusAreas as string[]) : undefined,
    });
    respond(true, updated, undefined);
  },

  // ── Teams ──────────────────────────────────────────────────────────────
  "company.teams.list": ({ respond }) => {
    const svc = getCompanyService();
    respond(true, svc.teamStore.list(), undefined);
  },

  "company.teams.create": async ({ params, respond }) => {
    const svc = getCompanyService();
    const team = await svc.teamStore.create({
      name: typeof params.name === "string" ? params.name : "New Team",
      agents: Array.isArray(params.agents) ? (params.agents as string[]) : [],
      strategy: (params.strategy as never) ?? "one-for-one",
      color: typeof params.color === "string" ? params.color : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
    });
    svc.broadcast("company.team.updated", { team });
    respond(true, team, undefined);
  },

  "company.teams.update": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    const team = await svc.teamStore.update(id, {
      name: typeof params.name === "string" ? params.name : undefined,
      agents: Array.isArray(params.agents) ? (params.agents as string[]) : undefined,
      strategy: params.strategy as never,
      color: typeof params.color === "string" ? params.color : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
    });
    if (!team) {
      respond(false, undefined, { code: "NOT_FOUND", message: `team "${id}" not found` });
      return;
    }
    svc.broadcast("company.team.updated", { team });
    respond(true, team, undefined);
  },

  "company.teams.delete": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.teamStore.delete(id);
    respond(true, { ok: true }, undefined);
  },

  // ── Tasks ──────────────────────────────────────────────────────────────
  "company.tasks.list": ({ params, respond }) => {
    const svc = getCompanyService();
    const tasks = svc.taskStore.list({
      status: typeof params.status === "string" ? (params.status as never) : undefined,
      assignee: typeof params.assignee === "string" ? params.assignee : undefined,
      project: typeof params.project === "string" ? params.project : undefined,
    });
    respond(true, tasks, undefined);
  },

  "company.tasks.create": async ({ params, respond }) => {
    const svc = getCompanyService();
    const task = await svc.taskStore.create({
      title: typeof params.title === "string" ? params.title : "New Task",
      description: typeof params.description === "string" ? params.description : undefined,
      status: (params.status as never) ?? "backlog",
      priority: (params.priority as never) ?? "medium",
      assignee: typeof params.assignee === "string" ? params.assignee : undefined,
      project: typeof params.project === "string" ? params.project : undefined,
      tags: Array.isArray(params.tags) ? (params.tags as string[]) : undefined,
      dueAt: typeof params.dueAt === "number" ? params.dueAt : undefined,
    });
    svc.broadcast("company.task.updated", { task });
    respond(true, task, undefined);
  },

  "company.tasks.update": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    const task = await svc.taskStore.update(id, {
      title: typeof params.title === "string" ? params.title : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
      status: params.status as never,
      priority: params.priority as never,
      assignee: typeof params.assignee === "string" ? params.assignee : undefined,
      project: typeof params.project === "string" ? params.project : undefined,
      tags: Array.isArray(params.tags) ? (params.tags as string[]) : undefined,
      dueAt: typeof params.dueAt === "number" ? params.dueAt : undefined,
    });
    if (!task) {
      respond(false, undefined, { code: "NOT_FOUND", message: `task "${id}" not found` });
      return;
    }
    svc.broadcast("company.task.updated", { task });
    respond(true, task, undefined);
  },

  "company.tasks.delete": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.taskStore.delete(id);
    respond(true, { ok: true }, undefined);
  },

  "company.tasks.assign": async ({ params, respond }) => {
    const taskId = strParam(params.taskId);
    const agentId = strParam(params.agentId);
    if (!taskId || !agentId) {
      respond(false, undefined, {
        code: "INVALID_REQUEST",
        message: "taskId and agentId required",
      });
      return;
    }
    const svc = getCompanyService();
    const task = await svc.taskStore.assign(taskId, agentId);
    if (!task) {
      respond(false, undefined, { code: "NOT_FOUND", message: `task "${taskId}" not found` });
      return;
    }
    svc.broadcast("company.task.updated", { task });
    respond(true, task, undefined);
  },

  // ── Human → Company message ───────────────────────────────────────────
  "company.message.send": async ({ params, respond }) => {
    if (typeof params.content !== "string" || !params.content.trim()) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "content required" });
      return;
    }
    const content = params.content;
    const svc = getCompanyService();
    // Record the human message on the bus so WS clients see it
    const msg = svc.messageBus.send("human", "company", content, "task");
    // Dispatch to AI Director (first active or first known agent)
    const agents = svc.registry.getAgents();
    const director =
      agents.find((a) => a.role?.toLowerCase().includes("director")) ??
      agents.find((a) => a.id === "ai-director") ??
      agents[0];
    if (director) {
      try {
        const runId = await svc.processManager.runTask(director.id, content);
        respond(true, { ok: true, runId, msgId: msg.id }, undefined);
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: String(err instanceof Error ? err.message : err),
        });
      }
    } else {
      // No agents configured — still acknowledge the message
      respond(true, { ok: true, msgId: msg.id }, undefined);
    }
  },

  "company.messages.list": ({ params, respond }) => {
    const svc = getCompanyService();
    const limit = typeof params.limit === "number" ? params.limit : 100;
    const history = svc.messageBus.getHistory({ limit });
    respond(true, history, undefined);
  },
};

// ── Helper: merge runtime state into agent snapshot ─────────────────────
function mergeState(
  agent: import("../../company/types.js").ClawDockAgent,
  s: import("../../company/types.js").AgentRuntimeState,
): import("../../company/types.js").ClawDockAgent {
  return {
    ...agent,
    status: s.status,
    pid: s.pid,
    startedAt: s.startedAt,
    lastActiveAt: s.lastActiveAt,
    cpuPercent: s.cpuPercent,
    memoryMb: s.memoryMb,
    tokensUsed: s.tokensUsed,
    tasksCompleted: s.tasksCompleted,
    currentTask: s.currentTask,
  };
}
