import fs from "node:fs/promises";
import path from "node:path";
import { getCompanyService } from "../../company/company-service.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveConfigDir } from "../../utils.js";
import type { GatewayRequestHandlers } from "./types.js";

/** Type-safe extraction of a string param field. */
function strParam(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArrayParam(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of v) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function formatErrorMessage(err: unknown): string {
  return String(err instanceof Error ? err.message : err);
}

function selectCompanyDirector(
  agents: import("../../company/types.js").ClawDockAgent[],
): import("../../company/types.js").ClawDockAgent | undefined {
  return (
    agents.find((a) => a.role?.toLowerCase().includes("orchestrator")) ??
    agents.find((a) => a.id === "orchestrator") ??
    // CEO is the top-level director when no explicit orchestrator exists
    agents.find((a) => a.role?.toLowerCase() === "ceo") ??
    agents.find((a) => a.id === "ceo") ??
    // Fall back to the agent with the most direct reports (likely the leader)
    agents.reduce<import("../../company/types.js").ClawDockAgent | undefined>((best, a) => {
      const reps = a.directReports?.length ?? 0;
      return reps > (best?.directReports?.length ?? 0) ? a : best;
    }, undefined) ??
    agents[0]
  );
}

function emitAgentLog(
  svc: ReturnType<typeof getCompanyService>,
  params: {
    agentId: string;
    runId: string;
    type: "system" | "error";
    content: string;
  },
): void {
  const entry = svc.logStore.append(params);
  svc.broadcast("company.agent.log", {
    agentId: params.agentId,
    runId: params.runId,
    entry,
  });
}

function sendFinalCompanyReply(
  svc: ReturnType<typeof getCompanyService>,
  agentId: string,
  content: string,
): void {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }
  svc.messageBus.send(agentId, "human", trimmed, "result");
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
    const metaPartial: Record<string, unknown> = {};
    if (typeof params.role === "string") {
      metaPartial.role = params.role;
    }
    if (typeof params.team === "string") {
      metaPartial.team = params.team;
    }
    if (typeof params.emoji === "string") {
      metaPartial.emoji = params.emoji;
    }
    if (typeof params.color === "string") {
      metaPartial.color = params.color;
    }
    if (typeof params.description === "string") {
      metaPartial.description = params.description;
    }
    if (typeof params.runtime === "string") {
      metaPartial.runtime = params.runtime;
    }
    if (typeof params.reportTo === "string") {
      const reportTo = params.reportTo.trim();
      metaPartial.reportTo = reportTo || undefined;
    } else if (params.reportTo === null) {
      metaPartial.reportTo = undefined;
    }
    if (Array.isArray(params.directReports)) {
      metaPartial.directReports = params.directReports;
    }
    const meta = await svc.registry.upsertMeta(id, metaPartial);
    const agent = svc.registry.getAgent(id);
    respond(true, agent ?? meta, undefined);
  },

  "company.agents.create": async ({ params, respond }) => {
    const name = strParam(params.name);
    if (!name) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "name required" });
      return;
    }
    const id = strParam(params.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const svc = getCompanyService();
    const existing = svc.registry.getAgent(id);
    if (existing) {
      respond(false, undefined, { code: "CONFLICT", message: `agent "${id}" already exists` });
      return;
    }
    const metaPartial: Record<string, unknown> = {
      role: strParam(params.role, "Agent"),
      team: strParam(params.team, "general"),
      emoji: strParam(params.emoji, "🤖"),
      color: strParam(params.color, "#3b82f6"),
      description: strParam(params.description, ""),
      runtime: strParam(
        params.runtime,
        "openclaw",
      ) as import("../../company/types.js").ClawDockRuntime,
    };
    if (typeof params.reportTo === "string") {
      metaPartial.reportTo = params.reportTo.trim() || undefined;
    }
    const meta = await svc.registry.upsertMeta(id, metaPartial);

    // Add agent to openclaw.json agents.list so it's fully recognized by the CLI
    try {
      const cfg = loadConfig();
      const list = Array.isArray(cfg.agents?.list) ? [...cfg.agents.list] : [];
      if (!list.some((entry) => entry?.id === id)) {
        const model = cfg.agents?.defaults?.model ?? { primary: "anthropic/claude-sonnet-4-5" };
        list.push({ id, name, model });
        const updatedCfg = { ...cfg, agents: { ...cfg.agents, list } };
        await writeConfigFile(updatedCfg);
      }
    } catch {
      // Best-effort — agent meta is already saved; config write failure is non-fatal
    }

    // Copy auth profiles from the default agent so the new agent can authenticate
    try {
      const configDir = resolveConfigDir();
      const defaultAuthPath = path.join(configDir, "agents", "main", "agent", "auth-profiles.json");
      const newAgentDir = path.join(configDir, "agents", id, "agent");
      const newAuthPath = path.join(newAgentDir, "auth-profiles.json");
      const defaultAuth = await fs.readFile(defaultAuthPath, "utf-8").catch(() => null);
      if (defaultAuth) {
        await fs.mkdir(newAgentDir, { recursive: true });
        // Only copy if no auth file exists yet
        await fs.access(newAuthPath).catch(async () => {
          await fs.writeFile(newAuthPath, defaultAuth, "utf-8");
        });
      }
    } catch {
      // Best-effort — auth copy failure is non-fatal
    }

    const agent = svc.registry.getAgent(id) ?? meta;
    svc.broadcast("company.agent.status", { agentId: id, status: "idle", updatedAt: Date.now() });
    respond(true, agent, undefined);
  },

  "company.agents.delete": async ({ params, respond }) => {
    const id = strParam(params.id);
    if (!id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id required" });
      return;
    }
    const svc = getCompanyService();
    await svc.registry.deleteMeta(id);

    // Remove from openclaw.json agents.list
    try {
      const cfg = loadConfig();
      const list = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
      const filtered = list.filter((entry) => entry?.id !== id);
      if (filtered.length !== list.length) {
        const updatedCfg = { ...cfg, agents: { ...cfg.agents, list: filtered } };
        await writeConfigFile(updatedCfg);
      }
    } catch {
      // Best-effort
    }

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
    const profilePartial: Record<string, unknown> = {};
    if (typeof params.name === "string") {
      profilePartial.name = params.name;
    }
    if (typeof params.mission === "string") {
      profilePartial.mission = params.mission;
    }
    if (typeof params.vision === "string") {
      profilePartial.vision = params.vision;
    }
    if (Array.isArray(params.values)) {
      profilePartial.values = params.values;
    }
    if (typeof params.businessModel === "string") {
      profilePartial.businessModel = params.businessModel;
    }
    if (Array.isArray(params.focusAreas)) {
      profilePartial.focusAreas = params.focusAreas;
    }
    const updated = await svc.profileStore.set(profilePartial);
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
    const partial: Record<string, unknown> = {};
    if (typeof params.title === "string") {
      partial.title = params.title;
    }
    if (typeof params.description === "string") {
      partial.description = params.description;
    }
    if (typeof params.status === "string") {
      partial.status = params.status;
    }
    if (typeof params.priority === "string") {
      partial.priority = params.priority;
    }
    if (typeof params.assignee === "string") {
      partial.assignee = params.assignee;
    }
    if (typeof params.project === "string") {
      partial.project = params.project;
    }
    if (Array.isArray(params.tags)) {
      partial.tags = params.tags;
    }
    if (typeof params.dueAt === "number") {
      partial.dueAt = params.dueAt;
    }
    const task = await svc.taskStore.update(id, partial);
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
    const content = params.content.trim();
    const svc = getCompanyService();
    const targetAgentId = strParam(params.targetAgentId).trim();
    const explicitTarget = targetAgentId ? svc.registry.getAgent(targetAgentId) : undefined;
    if (targetAgentId && !explicitTarget) {
      respond(false, undefined, {
        code: "NOT_FOUND",
        message: `agent "${targetAgentId}" not found`,
      });
      return;
    }
    const msg = svc.messageBus.send("human", explicitTarget?.id ?? "company", content, "task");
    const director = explicitTarget ?? selectCompanyDirector(svc.registry.getAgents());
    if (director) {
      const orchestrationRunId = `msg_${msg.id}`;
      // Immediately broadcast the director as active so the frontend animation reacts.
      svc.broadcast("company.agent.status", {
        agentId: director.id,
        status: "active",
        updatedAt: Date.now(),
      });
      emitAgentLog(svc, {
        agentId: director.id,
        runId: orchestrationRunId,
        type: "system",
        content: `[Human → ${director.id}] ${content.slice(0, 120)}${content.length > 120 ? "…" : ""}`,
      });
      // Check if director has subordinates — if so, orchestrate automatically
      const directReports = svc.registry.getDirectReports(director.id);
      if (directReports.length > 0) {
        // Fire-and-forget orchestration (long-running; broadcasts progress via WS)
        respond(true, { ok: true, orchestrating: true, msgId: msg.id }, undefined);

        void (async () => {
          let orchTask: Awaited<ReturnType<(typeof svc.taskStore)["create"]>> | null | undefined;
          try {
            orchTask = await svc.taskStore.create({
              title: content.slice(0, 100) + (content.length > 100 ? "…" : ""),
              description: content,
              status: "in_progress",
              priority: "high",
              assignee: director.id,
              project: "Orchestration",
            });
            svc.broadcast("company.task.updated", { task: orchTask });

            const maxRounds = svc.profileStore.get().maxOrchestrationRounds ?? 5;
            const result = await svc.orchestrator.execute(director.id, content, { maxRounds });
            sendFinalCompanyReply(svc, director.id, result.content);

            if (orchTask) {
              const updated = await svc.taskStore.update(orchTask.id, {
                status: "done",
                tokensUsed: result.tokensUsed,
              });
              if (updated) {
                svc.broadcast("company.task.updated", { task: updated });
              }
            }
          } catch (err) {
            emitAgentLog(svc, {
              agentId: director.id,
              runId: orchestrationRunId,
              type: "error",
              content: `Orchestration failed: ${formatErrorMessage(err)}`,
            });
            if (orchTask) {
              const updated = await svc.taskStore.update(orchTask.id, { status: "backlog" });
              if (updated) {
                svc.broadcast("company.task.updated", { task: updated });
              }
            }
          }
        })();
        return;
      } else {
        // Leaf director — run directly
        try {
          const result = await svc.processManager.runTaskAwait(director.id, content);
          sendFinalCompanyReply(svc, director.id, result.content);
          respond(true, { ok: true, runId: result.runId, msgId: msg.id }, undefined);
        } catch (err) {
          svc.broadcast("company.agent.status", {
            agentId: director.id,
            status: "idle",
            updatedAt: Date.now(),
          });
          emitAgentLog(svc, {
            agentId: director.id,
            runId: `msg_${msg.id}`,
            type: "error",
            content: `Task failed: ${formatErrorMessage(err)}`,
          });
          respond(false, undefined, {
            code: "INTERNAL_ERROR",
            message: formatErrorMessage(err),
          });
        }
      }
    } else {
      // No agents configured — still acknowledge the message
      respond(true, { ok: true, msgId: msg.id }, undefined);
    }
  },

  // ── Orchestration ────────────────────────────────────────────────────
  "company.orchestrate.run": async ({ params, respond }) => {
    const id = strParam(params.id);
    const prompt = strParam(params.prompt);
    const maxDepth = typeof params.maxDepth === "number" ? params.maxDepth : 3;
    if (!id || !prompt) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "id and prompt required" });
      return;
    }
    const svc = getCompanyService();
    try {
      const result = await svc.orchestrator.execute(id, prompt, { maxDepth });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  "company.messages.list": ({ params, respond }) => {
    const svc = getCompanyService();
    const limit = typeof params.limit === "number" ? params.limit : 100;
    const agentIds = strArrayParam(params.agentIds);
    const history = svc.messageBus.getHistory({
      limit,
      participants: agentIds.length > 0 ? agentIds : undefined,
    });
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
