import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./base.js";
import { isBinaryAvailable } from "./base.js";

/**
 * Runner that invokes the Gemini CLI for one-shot agent tasks.
 *
 * Command: gemini -p <prompt>
 *
 * Captures the complete stdout and emits it as a single result.
 */
export class GeminiRunner implements CliAgentRunner {
  readonly name = "gemini" as const;

  async isAvailable(): Promise<boolean> {
    return isBinaryAvailable("gemini");
  }

  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess {
    const args = ["-p", prompt];

    return spawn("gemini", args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  parseOutput(line: string): ParsedOutput | null {
    // Gemini CLI produces plain text or JSON blob; accumulate and return as output
    if (!line.trim()) {
      return null;
    }
    // Try to detect JSON result shape
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj.text === "string") {
        return { type: "result", content: obj.text };
      }
      if (typeof obj.result === "string") {
        return { type: "result", content: obj.result };
      }
    } catch {
      // plain text — treat as output line
    }
    return { type: "log", entry: { type: "output", content: line } };
  }
}
