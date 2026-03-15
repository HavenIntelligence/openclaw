import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./base.js";
import { isBinaryAvailable } from "./base.js";

/**
 * Runner that invokes Aider for one-shot agent tasks.
 *
 * Command: aider --message <prompt> --yes --no-stream
 *
 * Captures stdout for result content (plain text).
 */
export class AiderRunner implements CliAgentRunner {
  readonly name = "aider" as const;

  async isAvailable(): Promise<boolean> {
    return isBinaryAvailable("aider");
  }

  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess {
    const args = ["--message", prompt, "--yes", "--no-stream"];

    return spawn("aider", args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  parseOutput(line: string): ParsedOutput | null {
    if (!line.trim()) {
      return null;
    }
    // Aider produces plain text — treat each non-empty line as output
    return { type: "log", entry: { type: "output", content: line } };
  }
}
