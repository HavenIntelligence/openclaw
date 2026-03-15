import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { GatewayBroadcastFn } from "../gateway/server-broadcast.js";
import type { LogStore } from "./log-store.js";
import type { AgentRegistry } from "./registry.js";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./runners/base.js";
import { createOpenClawLineParser } from "./runners/openclaw-runner.js";
import type { AgentRuntimeState, AgentStatus } from "./types.js";

export interface TaskResult {
  runId: string;
  content: string;
  tokensUsed: number;
  exitCode: number;
}

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const SIGTERM_TIMEOUT_MS = 5000;

export class ProcessManager {
  private states: Map<string, AgentRuntimeState> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private runners: Map<string, CliAgentRunner> = new Map();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly logStore: LogStore,
    private readonly broadcast: GatewayBroadcastFn,
    runnerList: CliAgentRunner[],
  ) {
    for (const r of runnerList) {
      this.runners.set(r.name, r);
    }
  }

  getState(agentId: string): AgentRuntimeState {
    return (
      this.states.get(agentId) ?? {
        agentId,
        status: "idle",
        tokensUsed: 0,
        tasksCompleted: 0,
        logBuffer: [],
      }
    );
  }

  getAllStates(): AgentRuntimeState[] {
    // Ensure all known agents have at least a default state entry
    const agents = this.registry.getAgents();
    for (const a of agents) {
      if (!this.states.has(a.id)) {
        this.states.set(a.id, {
          agentId: a.id,
          status: "idle",
          tokensUsed: 0,
          tasksCompleted: 0,
          logBuffer: [],
        });
      }
    }
    return Array.from(this.states.values());
  }

  /** Fire-and-forget: start a task and return the runId immediately. */
  async runTask(agentId: string, prompt: string, opts?: RunOpts): Promise<string> {
    const { runId } = this.spawnTask(agentId, prompt, opts);
    return runId;
  }

  /** Start a task and wait for it to complete, returning the output text. */
  async runTaskAwait(
    agentId: string,
    prompt: string,
    opts?: RunOpts & { timeoutMs?: number },
  ): Promise<TaskResult> {
    const { runId, resultPromise } = this.spawnTask(agentId, prompt, opts);
    const timeoutMs = opts?.timeoutMs ?? 120_000;

    return new Promise<TaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Force-kill on timeout
        const child = this.processes.get(agentId);
        if (child) {
          child.kill("SIGKILL");
        }
        reject(new Error(`Agent "${agentId}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      void resultPromise.then((r) => {
        clearTimeout(timer);
        resolve({ runId, ...r });
      });
    });
  }

  // ── Core spawn logic (shared between runTask / runTaskAwait) ──────────

  private spawnTask(
    agentId: string,
    prompt: string,
    opts?: RunOpts,
  ): {
    runId: string;
    resultPromise: Promise<{ content: string; tokensUsed: number; exitCode: number }>;
  } {
    const meta = this.registry.getMeta(agentId);
    const runtime = meta?.runtime ?? "openclaw";
    const runner = this.runners.get(runtime);
    if (!runner) {
      throw new Error(`No runner available for runtime "${runtime}"`);
    }

    const runId = generateRunId();
    this.setStatus(agentId, "active", { currentTask: prompt });

    // Each ClawDock agent needs its own openclaw agent ID to avoid session lock
    // contention when running parallel tasks. Fall back to the agentId itself
    // (not "main") so each gets a separate session directory.
    const mergedOpts: RunOpts = {
      ...opts,
      openclawAgentId: meta?.agentCli ?? opts?.openclawAgentId ?? agentId,
      systemPrompt: meta?.systemPrompt ?? opts?.systemPrompt,
    };

    const child = runner.runTask(agentId, prompt, mergedOpts);
    this.processes.set(agentId, child);

    const lineParser: (line: string) => ParsedOutput | null =
      runtime === "openclaw" ? createOpenClawLineParser() : runner.parseOutput.bind(runner);

    // Accumulate result content for runTaskAwait callers
    let resultContent = "";
    let resultTokens = 0;

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const parsed = lineParser(line);
        if (!parsed) {
          return;
        }

        if (parsed.type === "log") {
          const entry = this.logStore.append({
            agentId,
            runId,
            type: parsed.entry.type ?? "output",
            content: parsed.entry.content ?? "",
            ...parsed.entry,
          });
          const state = this.getState(agentId);
          state.logBuffer.push(entry);
          if (state.logBuffer.length > 200) {
            state.logBuffer.shift();
          }
          this.broadcast("company.agent.log", { agentId, runId, entry });
        } else if (parsed.type === "result") {
          resultContent = parsed.content;
          resultTokens = parsed.tokensUsed ?? 0;

          const state = this.getState(agentId);
          state.tokensUsed += resultTokens;
          state.tasksCompleted += 1;
          state.currentTask = undefined;

          if (parsed.content) {
            const entry = this.logStore.append({
              agentId,
              runId,
              type: "output",
              content: parsed.content,
              tokensUsed: parsed.tokensUsed,
            });
            state.logBuffer.push(entry);
            if (state.logBuffer.length > 200) {
              state.logBuffer.shift();
            }
            this.broadcast("company.agent.log", { agentId, runId, entry });
          }
        }
      });
    }

    if (child.stderr) {
      const rl = createInterface({ input: child.stderr, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }
        // CLI warnings/info are not errors — classify as system
        const isInfoLine =
          trimmed.startsWith("[tools]") ||
          trimmed.startsWith("[warn]") ||
          trimmed.startsWith("[info]");
        const entry = this.logStore.append({
          agentId,
          runId,
          type: isInfoLine ? "system" : "error",
          content: line,
        });
        const state = this.getState(agentId);
        state.logBuffer.push(entry);
        if (state.logBuffer.length > 200) {
          state.logBuffer.shift();
        }
        this.broadcast("company.agent.log", { agentId, runId, entry });
      });
    }

    const resultPromise = new Promise<{ content: string; tokensUsed: number; exitCode: number }>(
      (resolve) => {
        child.once("exit", (code) => {
          this.processes.delete(agentId);
          const exitCode = code ?? 1;
          const status: AgentStatus = exitCode === 0 ? "idle" : "crashed";
          this.setStatus(agentId, status, { pid: undefined, currentTask: undefined });
          resolve({ content: resultContent, tokensUsed: resultTokens, exitCode });
        });
      },
    );

    return { runId, resultPromise };
  }

  async stop(agentId: string): Promise<void> {
    const child = this.processes.get(agentId);
    if (!child) {
      return;
    }
    this.setStatus(agentId, "stopping");
    child.kill("SIGTERM");
    // Wait up to 5 s then SIGKILL
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, SIGTERM_TIMEOUT_MS);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async restart(agentId: string, prompt?: string): Promise<void> {
    await this.stop(agentId);
    if (prompt) {
      await this.runTask(agentId, prompt);
    }
  }

  pause(agentId: string): void {
    const child = this.processes.get(agentId);
    if (child?.pid) {
      process.kill(child.pid, "SIGSTOP");
      this.setStatus(agentId, "paused");
    }
  }

  resume(agentId: string): void {
    const child = this.processes.get(agentId);
    if (child?.pid) {
      process.kill(child.pid, "SIGCONT");
      this.setStatus(agentId, "active");
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private setStatus(
    agentId: string,
    status: AgentStatus,
    extra?: Partial<AgentRuntimeState>,
  ): void {
    const existing = this.states.get(agentId) ?? {
      agentId,
      status: "idle",
      tokensUsed: 0,
      tasksCompleted: 0,
      logBuffer: [],
    };
    const updated: AgentRuntimeState = { ...existing, ...extra, agentId, status };
    if (status === "active" && !updated.startedAt) {
      updated.startedAt = Date.now();
    }
    if (status === "active" || status === "idle") {
      updated.lastActiveAt = Date.now();
    }
    this.states.set(agentId, updated);
    this.broadcast("company.agent.status", { agentId, status, updatedAt: Date.now() });
  }
}
