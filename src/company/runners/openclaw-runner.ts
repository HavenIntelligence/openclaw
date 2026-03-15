import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { resolveOpenClawPackageRootSync } from "../../infra/openclaw-root.js";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./base.js";
import { isBinaryAvailable } from "./base.js";

/**
 * Runner that invokes an OpenClaw agent via the bundled CLI entry when the
 * current package root can be resolved, and falls back to `openclaw` on PATH.
 *
 * Output modes:
 *  - `--json` emits a single pretty-printed JSON object to stdout (all on one
 *    logical chunk, but spread across multiple lines). We accumulate lines into
 *    a buffer and try to parse the whole object on each new line — once we
 *    succeed we emit the result.
 *
 * JSON result shape:
 *   { payloads: [{ text: string }], meta: { durationMs, agentMeta: { usage } } }
 */
export class OpenClawRunner implements CliAgentRunner {
  readonly name = "openclaw" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(resolveBundledOpenClawCliEntry()) || isBinaryAvailable("openclaw");
  }

  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess {
    const openclawAgent = opts?.openclawAgentId ?? resolveDefaultOpenClawAgentId();
    const fullPrompt = opts?.systemPrompt ? `[Role: ${opts.systemPrompt}]\n\n${prompt}` : prompt;
    const { command, argsPrefix } = resolveOpenClawCliInvocation();
    const args = [
      ...argsPrefix,
      "agent",
      "--local",
      "--json",
      "--agent",
      openclawAgent,
      "-m",
      fullPrompt,
    ];

    return spawn(command, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * Called once per stdout line.
   *
   * Because `openclaw --json` emits a multi-line pretty-printed JSON blob we
   * accumulate lines and attempt JSON.parse on each call.  We only emit the
   * result once — the first time the accumulated buffer forms valid JSON.
   *
   * NOTE: process-manager calls parseOutput() on each stdout line. This
   * stateless approach requires the runner to be reconstructed per run, but
   * since ProcessManager creates a new child process for each runTask(), the
   * runner's per-call accumulator is managed externally (via closure).
   *
   * We use a module-level accumulator keyed by a counter so that concurrent
   * runs don't collide. The counter is embedded in the ParsedOutput via a
   * lightweight state machine approach: each run gets a unique accumulator
   * created by `createLineParser()`.
   */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  parseOutput(line: string): ParsedOutput | null {
    // This method is called per line for the *current* process's stdout.
    // Warn/info lines from openclaw CLI:
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    // `openclaw agent --json` should ultimately emit a JSON object. Ignore
    // any preamble/banner/plugin lines on stdout so they do not poison
    // downstream JSON parsing.
    if (!trimmed.startsWith("{")) {
      return null;
    }

    // Try to parse directly as complete JSON (handles single-line output):
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      return parseJsonResult(obj);
    } catch {
      // Multi-line JSON is handled by createOpenClawLineParser().
      return null;
    }
  }
}

/**
 * Create a stateful line-accumulator parser for a single openclaw run.
 * Returns a function with the same signature as parseOutput.
 *
 * process-manager should call this per-run and use the returned function
 * instead of the runner's parseOutput directly when the runner is "openclaw".
 */
export function createOpenClawLineParser(): (line: string) => ParsedOutput | null {
  const buf: string[] = [];
  let done = false;

  return (line: string): ParsedOutput | null => {
    if (done) {
      return null;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    // Ignore any stdout preamble until the real JSON payload starts.
    if (buf.length === 0 && !trimmed.startsWith("{")) {
      return null;
    }

    buf.push(line);
    const joined = buf.join("\n");

    // Try to parse the accumulated buffer as JSON.
    try {
      const obj = JSON.parse(joined) as Record<string, unknown>;
      done = true; // only emit once
      return parseJsonResult(obj);
    } catch {
      // Not complete JSON yet — keep accumulating.
      return null;
    }
  };
}

function parseJsonResult(obj: Record<string, unknown>): ParsedOutput | null {
  // { payloads: [{ text: string }], meta: { durationMs, agentMeta: { usage: { output } } } }
  if (Array.isArray(obj.payloads)) {
    const payloads = obj.payloads as Array<{ text?: string }>;
    const text = payloads
      .map((p) => p.text ?? "")
      .filter(Boolean)
      .join("\n");
    const meta = obj.meta as
      | { durationMs?: number; agentMeta?: { usage?: { output?: number } } }
      | undefined;
    const tokensUsed = meta?.agentMeta?.usage?.output;

    if (text) {
      return { type: "result", content: text, tokensUsed };
    }
    // payloads present but empty text — still mark complete
    return { type: "result", content: "(empty response)", tokensUsed: 0 };
  }

  // Stream-JSON compat:
  if (obj.type === "assistant" && typeof obj.content === "string") {
    return { type: "log", entry: { type: "output", content: obj.content } };
  }
  if (obj.type === "result") {
    return {
      type: "result",
      content: typeof obj.content === "string" ? obj.content : JSON.stringify(obj.content),
      tokensUsed:
        typeof (obj.usage as Record<string, unknown> | undefined)?.output_tokens === "number"
          ? (obj.usage as Record<string, number>).output_tokens
          : undefined,
    };
  }

  return null;
}

function resolveOpenClawCliInvocation(): { command: string; argsPrefix: string[] } {
  const bundledCliEntry = resolveBundledOpenClawCliEntry();
  if (bundledCliEntry) {
    return {
      command: process.execPath,
      argsPrefix: [bundledCliEntry],
    };
  }

  return {
    command: "openclaw",
    argsPrefix: [],
  };
}

function resolveBundledOpenClawCliEntry(): string | null {
  const packageRoot = resolveOpenClawPackageRootSync({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  return packageRoot ? path.join(packageRoot, "openclaw.mjs") : null;
}

function resolveDefaultOpenClawAgentId(): string {
  try {
    return resolveDefaultAgentId(loadConfig());
  } catch {
    return "main";
  }
}
