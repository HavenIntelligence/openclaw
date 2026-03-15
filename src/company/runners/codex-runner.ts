import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./base.js";
import { isBinaryAvailable } from "./base.js";

/**
 * Runner that invokes OpenAI Codex CLI for one-shot agent tasks.
 *
 * Command: codex exec <prompt> --full-auto
 *
 * Parses JSONL lines from stdout.
 */
export class CodexRunner implements CliAgentRunner {
  readonly name = "codex" as const;

  async isAvailable(): Promise<boolean> {
    return isBinaryAvailable("codex");
  }

  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess {
    const args = ["exec", prompt, "--full-auto"];

    return spawn("codex", args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  parseOutput(line: string): ParsedOutput | null {
    if (!line.trim()) {
      return null;
    }
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.type === "output" && typeof obj.content === "string") {
        return { type: "log", entry: { type: "output", content: obj.content } };
      }
      if (obj.type === "tool_call") {
        const name = typeof obj.name === "string" ? obj.name : "tool";
        const input = obj.args ?? obj.input ?? {};
        return {
          type: "log",
          entry: { type: "tool_call", content: `${name}(${JSON.stringify(input)})` },
        };
      }
      if (obj.type === "done" || obj.type === "result") {
        const content = typeof obj.output === "string" ? obj.output : JSON.stringify(obj);
        return { type: "result", content };
      }
    } catch {
      if (line.trim()) {
        return { type: "log", entry: { type: "output", content: line } };
      }
    }
    return null;
  }
}
