import type { GatewayBroadcastFn } from "../gateway/server-broadcast.js";
import type { LogStore } from "./log-store.js";
import type { MessageBus } from "./message-bus.js";
import type { ProcessManager } from "./process-manager.js";
import type { AgentRegistry } from "./registry.js";
import type { TaskStore } from "./task-store.js";

// ── Types ────────────────────────────────────────────────────────────────

export type OrchestrationPhase =
  | "planning"
  | "delegating"
  | "synthesizing"
  | "verifying"
  | "executing"
  | "complete"
  | "failed";

export interface OrchestrationOpts {
  /** Max recursive delegation depth (default 3). */
  maxDepth?: number;
  /** Max orchestration rounds before forcing final synthesis (default 5). */
  maxRounds?: number;
  /** Per-agent timeout in ms (default 600 000). */
  timeoutMs?: number;
  /** Mission ID — groups all tasks from a single user message. Auto-generated if not provided. */
  missionId?: string;
}

export interface OrchestrationResult {
  agentId: string;
  missionId: string;
  content: string;
  tokensUsed: number;
  subtasks: OrchestrationResult[];
  phase: "leaf" | "orchestrated";
  durationMs: number;
  rounds: number;
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
    private readonly taskStore?: TaskStore,
  ) {}

  /**
   * Multi-round orchestration. Each round: plan → delegate → synthesize → verify.
   * The verifier decides if the result is sufficient or another round is needed.
   * Stops when verifier says "done" or maxRounds is reached.
   */
  async execute(
    agentId: string,
    prompt: string,
    opts?: OrchestrationOpts,
    depth = 0,
  ): Promise<OrchestrationResult> {
    const maxDepth = opts?.maxDepth ?? 3;
    const maxRounds = opts?.maxRounds ?? 5;
    const timeoutMs = opts?.timeoutMs ?? 600_000;
    const missionId =
      opts?.missionId ?? `mission_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
        missionId,
        content: result.content,
        tokensUsed: result.tokensUsed,
        subtasks: [],
        phase: "leaf",
        durationMs: Date.now() - start,
        rounds: 1,
      };
    }

    // ── Multi-round orchestrator path ──────────────────────────────────
    const meta = this.registry.getMeta(agentId);
    const agentRole = meta?.role ?? agentId;
    let totalTokens = 0;
    let allSubtasks: OrchestrationResult[] = [];
    let currentSynthesis = "";
    let round = 0;

    // Create a top-level mission task for the orchestrator itself
    let missionTaskId: string | undefined;
    if (this.taskStore && depth === 0) {
      const missionTitle = prompt.slice(0, 100) + (prompt.length > 100 ? "…" : "");
      const missionTask = await this.taskStore.create({
        title: missionTitle,
        description: prompt,
        status: "in_progress",
        priority: "high",
        agentId,
        assignee: agentId,
        assignedBy: "human",
        assignedAt: Date.now(),
        missionId,
        project: orchId,
      });
      missionTaskId = missionTask.id;
      this.broadcast("company.task.updated", { task: missionTask });
    }

    const subordinates = reports
      .map((id) => {
        const m = this.registry.getMeta(id);
        return { id, role: m?.role ?? id, description: m?.description ?? "" };
      })
      .filter((s) => s.id !== agentId);

    for (round = 1; round <= maxRounds; round++) {
      this.logSystem(agentId, orchId, `── Round ${round}/${maxRounds} ──`);

      // Phase 1: Plan
      this.emitPhase(orchId, agentId, "planning", depth);
      const context =
        round > 1
          ? `\n\nPREVIOUS ROUND RESULT (Round ${round - 1}):\n${currentSynthesis}\n\nIMPROVEMENT NEEDED: The verifier determined the result needs refinement. Please re-delegate with more specific instructions to fill gaps.`
          : "";
      const planPrompt = buildPlanPrompt(agentRole, prompt + context, subordinates);
      const planResult = await this.pm.runTaskAwait(agentId, planPrompt, { timeoutMs });
      totalTokens += planResult.tokensUsed;

      const plan = parseDelegationPlan(planResult.content, reports);

      if (plan.length === 0) {
        this.logSystem(agentId, orchId, "No delegation needed — executing directly.");
        this.emitPhase(orchId, agentId, "executing", depth);
        const directResult = await this.pm.runTaskAwait(agentId, prompt, { timeoutMs });
        totalTokens += directResult.tokensUsed;
        currentSynthesis = directResult.content;
        break;
      }

      // Phase 2: Delegate — create tasks and dispatch
      this.emitPhase(orchId, agentId, "delegating", depth);
      const subtaskIds: Map<string, string> = new Map(); // agentId → taskId
      for (const entry of plan) {
        this.messageBus.send(agentId, entry.agentId, entry.subtask, "task");
        this.logSystem(
          agentId,
          orchId,
          `Delegated to ${entry.agentId}: ${entry.subtask.slice(0, 100)}`,
        );
        // Auto-create and assign a Task for each subtask
        if (this.taskStore) {
          const taskTitle = entry.subtask.slice(0, 100) + (entry.subtask.length > 100 ? "…" : "");
          const task = await this.taskStore.create({
            title: taskTitle,
            description: entry.subtask,
            status: "in_progress",
            priority: "medium",
            agentId: entry.agentId,
            assignee: entry.agentId,
            assignedBy: agentId,
            assignedAt: Date.now(),
            reviewedBy: agentId, // assigner reviews by default
            roundCount: 0,
            maxRounds: 3,
            missionId,
            project: orchId,
          });
          subtaskIds.set(entry.agentId, task.id);
          this.broadcast("company.task.updated", { task });
          this.logSystem(
            entry.agentId,
            orchId,
            `[TASK_ASSIGNED] ${entry.agentId} picked up: ${taskTitle}`,
          );
        }
      }

      const subtaskResults = await Promise.all(
        plan.map(async (entry) => {
          const taskId = subtaskIds.get(entry.agentId);
          try {
            const result = await this.execute(
              entry.agentId,
              entry.subtask,
              { ...opts, missionId },
              depth + 1,
            );
            // Mark task as done on success
            if (taskId && this.taskStore) {
              const task = this.taskStore.get(taskId);
              const curRound = (task?.roundCount ?? 0) + 1;
              const updated = await this.taskStore.update(taskId, {
                status: "review",
                tokensUsed: result.tokensUsed,
                roundCount: curRound,
              });
              if (updated) {
                this.broadcast("company.task.updated", { task: updated });
                this.logSystem(
                  entry.agentId,
                  orchId,
                  `[TASK_REVIEW] ${entry.agentId} completed round ${curRound}: ${task?.title ?? taskId}`,
                );
                // Auto-approve to done for now (assigner reviews during synthesis)
                const approved = await this.taskStore.update(taskId, {
                  status: "done",
                  reviewNote: "Auto-approved after orchestration synthesis",
                });
                if (approved) {
                  this.broadcast("company.task.updated", { task: approved });
                  this.logSystem(
                    entry.agentId,
                    orchId,
                    `[TASK_DONE] ${agentId} reviewed and approved: ${task?.title ?? taskId}`,
                  );
                }
              }
            }
            return result;
          } catch (err) {
            // Mark task as done (failed) with review note
            if (taskId && this.taskStore) {
              const task = this.taskStore.get(taskId);
              const errMsg2 = err instanceof Error ? err.message : String(err);
              const updated = await this.taskStore.update(taskId, {
                status: "done",
                reviewNote: `Failed: ${errMsg2.slice(0, 200)}`,
              });
              if (updated) {
                this.broadcast("company.task.updated", { task: updated });
                this.logSystem(
                  entry.agentId,
                  orchId,
                  `[TASK_FAILED] ${entry.agentId} failed: ${task?.title ?? taskId}`,
                );
              }
            }
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logSystem(entry.agentId, orchId, `❌ Subtask failed: ${errMsg}`);
            return {
              agentId: entry.agentId,
              missionId,
              content: `[FAILED] ${errMsg}`,
              tokensUsed: 0,
              subtasks: [],
              phase: "leaf" as const,
              durationMs: 0,
              rounds: 0,
            };
          }
        }),
      );

      for (const sub of subtaskResults) {
        totalTokens += sub.tokensUsed;
        allSubtasks.push(sub);
        this.messageBus.send(sub.agentId, agentId, sub.content.slice(0, 300), "result");
      }

      // Phase 3: Synthesize
      this.emitPhase(orchId, agentId, "synthesizing", depth);
      const synthesizePrompt = buildSynthesizePrompt(agentRole, prompt, subtaskResults);
      const synthResult = await this.pm.runTaskAwait(agentId, synthesizePrompt, { timeoutMs });
      totalTokens += synthResult.tokensUsed;
      currentSynthesis = synthResult.content;

      // Phase 4: Verify — should we do another round?
      if (round < maxRounds) {
        this.emitPhase(orchId, agentId, "verifying", depth);
        this.logSystem(agentId, orchId, `Verifying result quality (Round ${round})…`);
        const verifyResult = await this.pm.runTaskAwait(
          agentId,
          buildVerifierPrompt(agentRole, prompt, currentSynthesis, round, maxRounds),
          { timeoutMs },
        );
        totalTokens += verifyResult.tokensUsed;

        const verdict = parseVerifierVerdict(verifyResult.content);
        if (verdict === "done") {
          this.logSystem(agentId, orchId, `✅ Verifier: result is sufficient. Finalizing.`);
          break;
        }
        this.logSystem(
          agentId,
          orchId,
          `🔄 Verifier: needs refinement. Starting round ${round + 1}.`,
        );
      }
    }

    // Mark mission task as done
    if (missionTaskId && this.taskStore) {
      const updated = await this.taskStore.update(missionTaskId, {
        status: "done",
        tokensUsed: totalTokens,
        reviewNote: `Completed in ${round} round(s)`,
      });
      if (updated) {
        this.broadcast("company.task.updated", { task: updated });
      }
    }

    this.emitPhase(orchId, agentId, "complete", depth, missionId);
    return {
      agentId,
      missionId,
      content: currentSynthesis,
      tokensUsed: totalTokens,
      subtasks: allSubtasks,
      phase: "orchestrated",
      durationMs: Date.now() - start,
      rounds: round,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private emitPhase(
    orchId: string,
    agentId: string,
    phase: OrchestrationPhase,
    depth: number,
    missionId?: string,
  ): void {
    this.broadcast("company.orchestration.phase", {
      orchestrationId: orchId,
      missionId,
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
    `You MUST respond with ONLY a valid JSON array. Do not use markdown tables or other formats — the system can only parse JSON.\n` +
    `Format: [{"agentId": "<agent-id-from-team-list>", "subtask": "description"}, ...]\n` +
    `Use the exact agent ids from YOUR TEAM above (e.g. researcher, legal-counsel, product-mgr, data-scientist).\n\n` +
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

function buildVerifierPrompt(
  role: string,
  originalTask: string,
  currentResult: string,
  round: number,
  maxRounds: number,
): string {
  return (
    `You are a quality verifier for ${role}. ` +
    `Review the following result against the original task.\n\n` +
    `ORIGINAL TASK:\n${originalTask}\n\n` +
    `CURRENT RESULT (Round ${round}/${maxRounds}):\n${currentResult}\n\n` +
    `Only request another round when there are SERIOUS problems: major gaps, critical errors, or the result clearly fails the task. ` +
    `If the result is acceptable, incomplete but usable, or only needs minor polish, approve it.\n\n` +
    `Respond with ONLY one word: "DONE" to approve and finish, or "REFINE" only if another round is strictly necessary.`
  );
}

function parseVerifierVerdict(raw: string): "done" | "refine" {
  const normalized = raw.trim().toUpperCase();
  if (normalized.includes("REFINE")) {
    return "refine";
  }
  return "done";
}

// ── JSON plan parser ───────────────────────────────────────────────────────
// Backend expects JSON only; the frontend formats [{"agentId","subtask"}] as a
// markdown table in the Execution Log (formatExecutionLogContent → jsonToDelegationMarkdown).

function parseDelegationPlan(raw: string, validAgentIds: string[]): DelegationEntry[] {
  const validSet = new Set(validAgentIds);
  if (validAgentIds.length === 0) {
    return [];
  }

  const candidates: Array<() => unknown> = [
    () => JSON.parse(raw.trim()),
    () => {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      return m ? JSON.parse(m[1].trim()) : null;
    },
    () => {
      const m = raw.match(/\[[\s\S]*?\]/);
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
      if (entries.length > 0) {
        return entries;
      }
    } catch {
      continue;
    }
  }
  return [];
}
