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
  /** Per-agent timeout in ms (default 1 800 000 = 30min). */
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

  private async runAgentTaskWithSessionLockRetry(
    agentId: string,
    prompt: string,
    opts: { timeoutMs: number; openclawAgentId: string },
  ) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.pm.runTaskAwait(agentId, prompt, {
          timeoutMs: opts.timeoutMs,
          openclawAgentId:
            attempt === 1 ? opts.openclawAgentId : `${opts.openclawAgentId}__r${attempt}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isLock = /session file locked/i.test(msg);
        if (!isLock || attempt === maxAttempts) {
          throw err;
        }
        // Small backoff; lock usually clears quickly if it was a concurrent run.
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    // Unreachable (loop always returns or throws)
    throw new Error("Unexpected retry loop fallthrough");
  }

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
    const timeoutMs = opts?.timeoutMs ?? 1_800_000;
    const missionId =
      opts?.missionId ?? `mission_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const start = Date.now();
    const orchId = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const openclawAgentId = `${agentId}__${orchId}`;

    const reports = this.registry.getDirectReports(agentId);

    // Leaf node or max depth reached — execute directly
    if (reports.length === 0 || depth >= maxDepth) {
      this.emitPhase(orchId, agentId, "executing", depth);
      const result = await this.runAgentTaskWithSessionLockRetry(agentId, prompt, {
        timeoutMs,
        openclawAgentId,
      });
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

    // Callback to stamp mission endTime on each process exit.
    // The last process to exit sets the final value.
    const updateMissionEndTime = missionTaskId
      ? () => {
          if (!this.taskStore) {
            return;
          }
          void this.taskStore.update(missionTaskId, { endTime: Date.now() }).catch(() => {});
        }
      : undefined;

    const onFinish = updateMissionEndTime ? () => updateMissionEndTime() : undefined;

    // Persist phase transitions on the mission task for the monitor timeline.
    const recordPhase = missionTaskId
      ? (phase: OrchestrationPhase) => {
          if (!this.taskStore) {
            return;
          }
          const task = this.taskStore.get(missionTaskId);
          const phases = [...(task?.phases ?? []), { phase, ts: Date.now() }];
          void this.taskStore.update(missionTaskId, { phases }).catch(() => {});
        }
      : undefined;

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
      recordPhase?.("planning");
      const context =
        round > 1
          ? `\n\nPREVIOUS ROUND RESULT (Round ${round - 1}):\n${currentSynthesis}\n\nIMPROVEMENT NEEDED: The verifier determined the result needs refinement. Please re-delegate with more specific instructions to fill gaps.`
          : "";
      const planPrompt = buildPlanPrompt(agentRole, prompt + context, subordinates);
      const planResult = await this.runAgentTaskWithSessionLockRetry(agentId, planPrompt, {
        timeoutMs,
        openclawAgentId,
        onFinish,
      });
      totalTokens += planResult.tokensUsed;

      const plan = parseDelegationPlan(planResult.content, reports);

      if (plan.length === 0) {
        this.logSystem(agentId, orchId, "No delegation needed — executing directly.");
        this.emitPhase(orchId, agentId, "executing", depth);
        recordPhase?.("executing");
        const directResult = await this.runAgentTaskWithSessionLockRetry(agentId, prompt, {
          timeoutMs,
          openclawAgentId,
          onFinish,
        });
        totalTokens += directResult.tokensUsed;
        currentSynthesis = directResult.content;
        break;
      }

      // Phase 2: Delegate — create tasks and dispatch
      this.emitPhase(orchId, agentId, "delegating", depth);
      recordPhase?.("delegating");
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
                endTime: Date.now(),
                tokensUsed: result.tokensUsed,
                roundCount: curRound,
                reviewNote: result.content.slice(0, 400).replace(/\s+/g, " ").trim() || undefined,
              });
              if (updated) {
                this.broadcast("company.task.updated", { task: updated });
                this.logSystem(
                  entry.agentId,
                  orchId,
                  `[TASK_REVIEW] ${entry.agentId} completed round ${curRound}: ${task?.title ?? taskId}`,
                );
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
      recordPhase?.("synthesizing");
      const synthesizePrompt = buildSynthesizePrompt({
        role: agentRole,
        originalTask: prompt,
        round,
        roundResults: subtaskResults,
        allResultsSoFar: allSubtasks,
      });
      const synthResult = await this.runAgentTaskWithSessionLockRetry(agentId, synthesizePrompt, {
        timeoutMs,
        openclawAgentId,
        onFinish,
      });
      totalTokens += synthResult.tokensUsed;
      currentSynthesis = synthResult.content;

      // Phase 4: Verify — should we do another round?
      if (round < maxRounds) {
        this.emitPhase(orchId, agentId, "verifying", depth);
        recordPhase?.("verifying");
        this.logSystem(agentId, orchId, `Verifying result quality (Round ${round})…`);

        // Coverage gate: avoid "first round ends early" for multi-part research tasks.
        // This keeps the orchestrator delegating until the output is actually sufficient.
        const forced = shouldForceAnotherRound({
          originalTask: prompt,
          subordinates,
          plan,
          subtaskResults,
        });
        if (forced) {
          this.logSystem(agentId, orchId, `🔄 Verifier: forced refinement (${forced}).`);
          continue;
        }

        const verifyPrompt = buildVerifierPrompt({
          role: agentRole,
          originalTask: prompt,
          currentResult: currentSynthesis,
          round,
          maxRounds,
          subordinates,
          plan,
          subtaskResults,
        });
        const verifyResult = await this.runAgentTaskWithSessionLockRetry(agentId, verifyPrompt, {
          timeoutMs,
          openclawAgentId,
          onFinish,
        });
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

    // Mark all subtasks still in "review" as done (orchestrator approved them)
    if (this.taskStore) {
      const missionTasks = this.taskStore.list({ missionId });
      for (const task of missionTasks) {
        if (task.status === "review") {
          const updated = await this.taskStore.update(task.id, {
            status: "done",
            endTime: Date.now(),
            reviewNote: task.reviewNote
              ? `${task.reviewNote} [Approved by orchestrator]`
              : `Approved by orchestrator (round ${round})`,
          });
          if (updated) {
            this.broadcast("company.task.updated", { task: updated });
          }
        }
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

    const trimmedFinal = currentSynthesis.trim();
    if (trimmedFinal) {
      const finalEntry = this.logStore.append({
        agentId,
        runId: orchId,
        type: "output",
        content: trimmedFinal,
        tokensUsed: totalTokens,
      });
      this.broadcast("company.agent.log", { agentId, runId: orchId, entry: finalEntry });
    }

    this.emitPhase(orchId, agentId, "complete", depth, missionId);
    recordPhase?.("complete");
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

// ── Prompt builders (exported for tests) ───────────────────────────────────

export function buildPlanPrompt(
  role: string,
  task: string,
  subordinates: Array<{ id: string; role: string; description: string }>,
): string {
  const subList = subordinates.map((s) => `- ${s.id} (${s.role}): ${s.description}`).join("\n");
  return (
    `You are ${role}. You have received a task and must delegate it to your team.\n\n` +
    `TASK:\n${task}\n\n` +
    `YOUR TEAM:\n${subList}\n\n` +
    `DELEGATION RULES:\n` +
    `- In this round, agents run in parallel and cannot talk to each other. All cross-agent context must be passed by you in the subtask text. If a subtask needs another agent's output (e.g. reading_analyst needs literature_scout's paper list), either (1) include that context in the subtask if you already have it from memory or a previous round, or (2) assign only the upstream agent this round and assign the downstream agent in a later round when you have the synthesis.\n` +
    `- HARD RULE (no same-round dependencies): In the SAME round, NO subtask may depend on another agent's output. Do NOT assign tasks that say or imply: "use results from X", "based on X's output", "read the papers found by X", "compare findings from Y", "use insights from Z", etc.\n` +
    `- If a downstream step requires upstream output, assign ONLY the upstream agent(s) this round. Then in the NEXT round, assign the downstream step and paste the needed upstream output into the subtask text.\n` +
    `- If you want parallelism in round 1, assign INDEPENDENT work only. Examples:\n` +
    `  - literature_scout: find 3–5 sources with links + abstracts.\n` +
    `  - reading_analyst: independently find and summarize 1–2 sources (do not wait for literature_scout).\n` +
    `  - comparison_analyst: define comparison rubric + what evidence/metrics to extract.\n` +
    `  - experiment_designer: draft an experiment template (objective/setup/metrics) without relying on other agents.\n` +
    `  - report_writer: draft report outline + synthesis checklist; do NOT claim final synthesis until inputs exist.\n` +
    `- Agents that do literature review or paper/source discovery (e.g. literature_scout) have web search (e.g. Gemini/Google). In their subtask, explicitly instruct them to use web search to find papers, articles, or references when the task involves research or literature.\n` +
    `- For EVERY assigned subtask, include a one-line assertion at the end: "Dependencies: none (must be solvable without other agents' outputs this round)".\n\n` +
    `- Agents that do literature review or paper/source discovery (e.g. literature_scout) have web search (e.g. Gemini/Google). In their subtask, explicitly instruct them to use web search to find papers, articles, or references when the task involves research or literature.\n\n` +
    `Create a delegation plan. For each team member, describe a specific subtask (include any context they need in the subtask text). Only assign subtasks that are genuinely needed — not every member must be assigned.\n\n` +
    `You MUST respond with ONLY a valid JSON array. Do not use markdown tables or other formats — the system can only parse JSON.\n` +
    `Format: [{"agentId": "<agent-id-from-team-list>", "subtask": "description"}, ...]\n` +
    `Use the exact agent ids from YOUR TEAM above.\n\n` +
    `If you can handle this entirely yourself without delegation, respond with: []`
  );
}

function shouldForceAnotherRound(params: {
  originalTask: string;
  subordinates: Array<{ id: string; role: string; description: string }>;
  plan: Array<{ agentId: string; subtask: string }>;
  subtaskResults: OrchestrationResult[];
}): string | null {
  const task = params.originalTask.toLowerCase();
  const isResearchy =
    /(literature|paper|survey|research|benchmark|compare|comparison|latency|factual|factuality|accuracy|evaluation|report)/i.test(
      task,
    );

  const uniqueAgents = new Set(params.subtaskResults.map((r) => r.agentId).filter(Boolean));

  // If anything failed, try at least one more round to recover.
  if (params.subtaskResults.some((r) => r.content.startsWith("[FAILED]"))) {
    return "subtask_failed";
  }

  // If the task looks like multi-part research and we only asked one agent,
  // do not finalize after round 1 — gather more perspectives.
  if (
    isResearchy &&
    params.subordinates.length >= 2 &&
    params.plan.length <= 1 &&
    uniqueAgents.size <= 1
  ) {
    return "insufficient_delegation_for_research_task";
  }

  return null;
}

function buildSynthesizePrompt(params: {
  role: string;
  originalTask: string;
  round: number;
  roundResults: OrchestrationResult[];
  allResultsSoFar: OrchestrationResult[];
}): string {
  const MAX_RESULT_CHARS_PER_AGENT = 8_000;

  const trimForContext = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length <= MAX_RESULT_CHARS_PER_AGENT) {
      return trimmed;
    }
    return `${trimmed.slice(0, MAX_RESULT_CHARS_PER_AGENT)}\n\n[TRUNCATED]`;
  };

  // Keep latest result per agentId (but preserve failures so they don't get overwritten).
  const byAgent = new Map<string, OrchestrationResult>();
  for (const r of params.allResultsSoFar) {
    const prev = byAgent.get(r.agentId);
    if (!prev) {
      byAgent.set(r.agentId, r);
      continue;
    }
    const prevFailed = prev.content.startsWith("[FAILED]");
    const nextFailed = r.content.startsWith("[FAILED]");
    if (prevFailed && !nextFailed) {
      // prefer a later success over an earlier failure
      byAgent.set(r.agentId, r);
      continue;
    }
    if (!prevFailed && nextFailed) {
      // keep the successful one
      continue;
    }
    // otherwise, keep the later one (by insertion order in allResultsSoFar)
    byAgent.set(r.agentId, r);
  }

  const allSections = Array.from(byAgent.values())
    .map((r) => `### ${r.agentId}:\n${trimForContext(r.content)}`)
    .join("\n\n");

  const roundSections = params.roundResults
    .map((r) => `### ${r.agentId}:\n${trimForContext(r.content)}`)
    .join("\n\n");

  return (
    `You are ${params.role}. You delegated a task to your team across multiple rounds.\n\n` +
    `ORIGINAL TASK:\n${params.originalTask}\n\n` +
    `TEAM RESULTS (ALL ROUNDS, latest per agent):\n${allSections}\n\n` +
    `TEAM RESULTS (THIS ROUND ${params.round}):\n${roundSections}\n\n` +
    `Synthesize these results into a single, cohesive final response. ` +
    `Integrate key findings, resolve contradictions, and present a clear, actionable answer.`
  );
}

function buildVerifierPrompt(params: {
  role: string;
  originalTask: string;
  currentResult: string;
  round: number;
  maxRounds: number;
  subordinates: Array<{ id: string; role: string; description: string }>;
  plan: Array<{ agentId: string; subtask: string }>;
  subtaskResults: OrchestrationResult[];
}): string {
  const team = params.subordinates.map((s) => `- ${s.id} (${s.role})`).join("\n");
  const used =
    Array.from(new Set(params.subtaskResults.map((r) => r.agentId))).join(", ") || "(none)";
  const planned = params.plan.map((p) => p.agentId).join(", ") || "(none)";
  return (
    `You are a strict quality verifier for ${params.role}. ` +
    `Review the following result against the original task.\n\n` +
    `ORIGINAL TASK:\n${params.originalTask}\n\n` +
    `TEAM (available specialists):\n${team}\n\n` +
    `PLANNED AGENTS THIS ROUND:\n${planned}\n\n` +
    `AGENTS THAT ACTUALLY PRODUCED RESULTS:\n${used}\n\n` +
    `CURRENT RESULT (Round ${params.round}/${params.maxRounds}):\n${params.currentResult}\n\n` +
    `VERIFICATION RULES:\n` +
    `- Approve ("DONE") ONLY if the result fully satisfies the task, including all key dimensions requested (e.g., literature + comparison + implications/next steps when applicable).\n` +
    `- If the task is research-oriented and only one specialist contributed, you should usually request another round ("REFINE") to delegate missing dimensions to other available specialists.\n` +
    `- If there are major gaps, missing evidence/citations where expected, or the output is only a partial slice (e.g., only literature scouting without synthesis/comparison), respond "REFINE".\n\n` +
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
