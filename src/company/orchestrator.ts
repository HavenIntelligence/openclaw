import type { GatewayBroadcastFn } from "../gateway/server-broadcast.js";
import type { LogStore } from "./log-store.js";
import type { MessageBus } from "./message-bus.js";
import type { ProcessManager } from "./process-manager.js";
import type { AgentRegistry } from "./registry.js";

// ── Types ────────────────────────────────────────────────────────────────

export type OrchestrationPhase =
  | "planning"
  | "delegating"
  | "synthesizing"
  | "executing"
  | "complete"
  | "failed";

export interface OrchestrationOpts {
  /** Max recursive delegation depth (default 3). */
  maxDepth?: number;
  /** Per-agent timeout in ms (default 120 000). */
  timeoutMs?: number;
}

export interface OrchestrationResult {
  agentId: string;
  content: string;
  tokensUsed: number;
  subtasks: OrchestrationResult[];
  phase: "leaf" | "orchestrated";
  durationMs: number;
}

interface DelegationEntry {
  agentId: string;
  subtask: string;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

export class Orchestrator {
  constructor(
    private readonly pm: ProcessManager,
    private readonly registry: AgentRegistry,
    private readonly logStore: LogStore,
    private readonly messageBus: MessageBus,
    private readonly broadcast: GatewayBroadcastFn,
  ) {}

  /**
   * Execute a task on `agentId`. If the agent has subordinates (directReports),
   * the agent will plan subtasks, delegate them recursively, then synthesize
   * the results. Leaf agents execute directly.
   */
  async execute(
    agentId: string,
    prompt: string,
    opts?: OrchestrationOpts,
    depth = 0,
  ): Promise<OrchestrationResult> {
    const maxDepth = opts?.maxDepth ?? 3;
    const timeoutMs = opts?.timeoutMs ?? 120_000;
    const start = Date.now();
    const orchId = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const reports = this.registry.getDirectReports(agentId);

    // Leaf node or max depth reached — execute directly
    if (reports.length === 0 || depth >= maxDepth) {
      this.emitPhase(orchId, agentId, "executing", depth);
      const result = await this.pm.runTaskAwait(agentId, prompt, { timeoutMs });
      this.emitPhase(orchId, agentId, "complete", depth);
      return {
        agentId,
        content: result.content,
        tokensUsed: result.tokensUsed,
        subtasks: [],
        phase: "leaf",
        durationMs: Date.now() - start,
      };
    }

    // ── Orchestrator path ─────────────────────────────────────────────────
    const meta = this.registry.getMeta(agentId);
    const agentRole = meta?.role ?? agentId;
    let totalTokens = 0;

    // Phase 1: Plan — ask the agent to delegate
    this.emitPhase(orchId, agentId, "planning", depth);
    const subordinates = reports
      .map((id) => {
        const m = this.registry.getMeta(id);
        return { id, role: m?.role ?? id, description: m?.description ?? "" };
      })
      .filter((s) => s.id !== agentId);

    const planPrompt = buildPlanPrompt(agentRole, prompt, subordinates);
    const planResult = await this.pm.runTaskAwait(agentId, planPrompt, { timeoutMs });
    totalTokens += planResult.tokensUsed;

    const plan = parseDelegationPlan(planResult.content, reports);

    // Empty plan or parse failure → run directly as leaf
    if (plan.length === 0) {
      this.logSystem(agentId, orchId, "No delegation needed — executing directly.");
      this.emitPhase(orchId, agentId, "executing", depth);
      const directResult = await this.pm.runTaskAwait(agentId, prompt, { timeoutMs });
      totalTokens += directResult.tokensUsed;
      this.emitPhase(orchId, agentId, "complete", depth);
      return {
        agentId,
        content: directResult.content,
        tokensUsed: totalTokens,
        subtasks: [],
        phase: "orchestrated",
        durationMs: Date.now() - start,
      };
    }

    // Phase 2: Delegate — dispatch subtasks to subordinates in parallel
    this.emitPhase(orchId, agentId, "delegating", depth);
    for (const entry of plan) {
      this.messageBus.send(agentId, entry.agentId, entry.subtask, "task");
      this.logSystem(
        agentId,
        orchId,
        `Delegated to ${entry.agentId}: ${entry.subtask.slice(0, 100)}`,
      );
    }

    const subtaskResults = await Promise.all(
      plan.map((entry) => this.execute(entry.agentId, entry.subtask, opts, depth + 1)),
    );

    for (const sub of subtaskResults) {
      totalTokens += sub.tokensUsed;
      this.messageBus.send(sub.agentId, agentId, sub.content.slice(0, 300), "result");
    }

    // Phase 3: Synthesize — feed subordinate results back to orchestrator
    this.emitPhase(orchId, agentId, "synthesizing", depth);
    const synthesizePrompt = buildSynthesizePrompt(agentRole, prompt, subtaskResults);
    const synthResult = await this.pm.runTaskAwait(agentId, synthesizePrompt, { timeoutMs });
    totalTokens += synthResult.tokensUsed;

    this.emitPhase(orchId, agentId, "complete", depth);
    return {
      agentId,
      content: synthResult.content,
      tokensUsed: totalTokens,
      subtasks: subtaskResults,
      phase: "orchestrated",
      durationMs: Date.now() - start,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private emitPhase(
    orchId: string,
    agentId: string,
    phase: OrchestrationPhase,
    depth: number,
  ): void {
    this.broadcast("company.orchestration.phase", {
      orchestrationId: orchId,
      agentId,
      phase,
      depth,
      ts: Date.now(),
    });
  }

  private logSystem(agentId: string, orchId: string, content: string): void {
    const entry = this.logStore.append({ agentId, runId: orchId, type: "system", content });
    this.broadcast("company.agent.log", { agentId, runId: orchId, entry });
  }
}

// ── Prompt builders ──────────────────────────────────────────────────────

function buildPlanPrompt(
  role: string,
  task: string,
  subordinates: Array<{ id: string; role: string; description: string }>,
): string {
  const subList = subordinates.map((s) => `- ${s.id} (${s.role}): ${s.description}`).join("\n");
  return (
    `You are ${role}. You have received a task and must delegate it to your team.\n\n` +
    `TASK:\n${task}\n\n` +
    `YOUR TEAM:\n${subList}\n\n` +
    `Create a delegation plan. For each team member, describe a specific subtask they should work on. ` +
    `Only assign subtasks that are genuinely needed — not every member must be assigned.\n\n` +
    `Respond with ONLY a JSON array, no markdown fences, no explanation:\n` +
    `[{"agentId": "id", "subtask": "description"}, ...]\n\n` +
    `If you can handle this entirely yourself without delegation, respond with: []`
  );
}

function buildSynthesizePrompt(
  role: string,
  originalTask: string,
  results: OrchestrationResult[],
): string {
  const sections = results
    .map((r) => {
      const subRole = r.agentId;
      return `### ${subRole}:\n${r.content}`;
    })
    .join("\n\n");

  return (
    `You are ${role}. You delegated a task to your team and received their results.\n\n` +
    `ORIGINAL TASK:\n${originalTask}\n\n` +
    `TEAM RESULTS:\n${sections}\n\n` +
    `Synthesize these results into a single, cohesive final response. ` +
    `Integrate key findings, resolve contradictions, and present a clear, actionable answer.`
  );
}

// ── JSON plan parser (robust) ────────────────────────────────────────────

function parseDelegationPlan(raw: string, validAgentIds: string[]): DelegationEntry[] {
  const validSet = new Set(validAgentIds);
  const candidates = [
    () => JSON.parse(raw),
    // Extract from markdown code fence
    () => {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      return m ? JSON.parse(m[1]) : null;
    },
    // Find first [...] in the text
    () => {
      const m = raw.match(/\[[\s\S]*\]/);
      return m ? JSON.parse(m[0]) : null;
    },
  ];

  for (const tryParse of candidates) {
    try {
      const parsed = tryParse();
      if (!Array.isArray(parsed)) {
        continue;
      }
      const entries: DelegationEntry[] = [];
      for (const item of parsed) {
        if (
          typeof item === "object" &&
          item !== null &&
          typeof item.agentId === "string" &&
          typeof item.subtask === "string" &&
          validSet.has(item.agentId)
        ) {
          entries.push({ agentId: item.agentId, subtask: item.subtask });
        }
      }
      return entries;
    } catch {
      continue;
    }
  }
  return [];
}
