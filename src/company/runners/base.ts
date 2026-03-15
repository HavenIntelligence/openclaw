import type { ChildProcess } from "node:child_process";
import type { ClawDockRuntime, LogEntry, LogEntryType } from "../types.js";

// ── Spawn options ──────────────────────────────────────────────────────────
export interface SpawnOpts {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Extra environment variables to inject. */
  env?: NodeJS.ProcessEnv;
}

export interface RunOpts extends SpawnOpts {
  /** Maximum number of turns / tool calls allowed. */
  maxTurns?: number;
  /** Allowed tool names (runner-specific interpretation). */
  allowedTools?: string[];
  /**
   * For the `openclaw` runner: the `--agent <id>` value passed to `openclaw agent --local`.
   * Defaults to "main".
   */
  openclawAgentId?: string;
  /**
   * Optional role/persona prefix prepended to the prompt before dispatching.
   */
  systemPrompt?: string;
}

// ── Parsed output from a runner's stdout line ─────────────────────────────
export type ParsedOutput =
  | { type: "log"; entry: Partial<LogEntry> }
  | { type: "result"; content: string; tokensUsed?: number }
  | { type: "error"; message: string };

// ── Runner interface ───────────────────────────────────────────────────────
export interface CliAgentRunner {
  readonly name: ClawDockRuntime;
  /** Check if the underlying CLI tool is available on PATH. */
  isAvailable(): Promise<boolean>;
  /** Spawn a one-shot task and return the child process. */
  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess;
  /** Parse a single stdout line from the child process. */
  parseOutput(line: string): ParsedOutput | null;
}

// ── Shared utilities ──────────────────────────────────────────────────────

/** Resolve whether a CLI binary exists on PATH. */
export async function isBinaryAvailable(name: string): Promise<boolean> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("which", [name], { stdio: "ignore" });
  return result.status === 0;
}

/** Build a partial LogEntry from raw content. */
export function makeLogEntry(
  agentId: string,
  runId: string,
  type: LogEntryType,
  content: string,
  extra?: Partial<LogEntry>,
): Partial<LogEntry> {
  return {
    agentId,
    runId,
    type,
    content,
    ts: Date.now(),
    ...extra,
  };
}
