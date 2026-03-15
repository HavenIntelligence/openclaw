import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CliAgentRunner, ParsedOutput, RunOpts } from "./base.js";
import { isBinaryAvailable } from "./base.js";

/**
 * Runner that invokes the Claude Code CLI for one-shot agent tasks.
 *
 * Command: claude -p <prompt> --output-format stream-json [--max-turns N]
 *
 * Stream-JSON format: NDJSON where each line is a JSON object with
 * { type: "assistant"|"tool"|"result", ... }
 */
export class ClaudeCodeRunner implements CliAgentRunner {
  readonly name = "claude-code" as const;

  async isAvailable(): Promise<boolean> {
    return isBinaryAvailable("claude");
  }

  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess {
    const maxTurns = opts?.maxTurns ?? 20;
    const allowedTools = opts?.allowedTools ?? ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];

    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      String(maxTurns),
      "--allowedTools",
      allowedTools.join(","),
    ];

    // Remove CLAUDECODE env var to allow spawning claude inside a Claude Code session
    const env = { ...process.env, ...opts?.env };
    delete env.CLAUDECODE;

    return spawn("claude", args, {
      cwd: opts?.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  parseOutput(line: string): ParsedOutput | null {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      // Stream-JSON assistant message
      if (obj.type === "assistant") {
        const content = extractAssistantContent(obj.message);
        if (content) {
          return { type: "log", entry: { type: "output", content } };
        }
        return null;
      }
      // Tool use block (appears inside assistant message content array)
      if (obj.type === "tool_use") {
        const name = typeof obj.name === "string" ? obj.name : "unknown";
        const input = obj.input ?? {};
        return {
          type: "log",
          entry: { type: "tool_call", content: `${name}(${JSON.stringify(input)})` },
        };
      }
      // Final result
      if (obj.type === "result") {
        const content =
          typeof obj.result === "string" ? obj.result : JSON.stringify(obj.result ?? "");
        const usageObj = obj.usage as Record<string, unknown> | undefined;
        const tokensUsed =
          typeof usageObj?.output_tokens === "number" ? usageObj.output_tokens : undefined;
        return { type: "result", content, tokensUsed };
      }
    } catch {
      // Non-JSON output line — emit as raw output
      if (line.trim()) {
        return { type: "log", entry: { type: "output", content: line } };
      }
    }
    return null;
  }
}

function extractAssistantContent(message: unknown): string | null {
  if (typeof message !== "object" || message === null) {
    return null;
  }
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    // Collect all text blocks
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        }
      }
    }
    return parts.join("") || null;
  }
  return null;
}
