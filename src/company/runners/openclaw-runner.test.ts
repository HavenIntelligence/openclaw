import { describe, expect, it } from "vitest";
import {
  createOpenClawLineParser,
  resolveOpenClawEntryPath,
  resolveOpenClawSpawnInvocation,
} from "./openclaw-runner.js";

describe("resolveOpenClawEntryPath", () => {
  it("prefers a local openclaw.mjs entry when present", () => {
    const entry = resolveOpenClawEntryPath();
    expect(entry).toBeTruthy();
    expect(entry?.endsWith("/openclaw.mjs")).toBe(true);
  });

  it("ignores unrelated argv entries", () => {
    const entry = resolveOpenClawEntryPath({
      argv: ["/usr/local/bin/node", "/tmp/vitest.mjs"],
      cwd: "/tmp",
      existsSync: () => false,
      moduleUrl: "file:///tmp/dist/company/runners/openclaw-runner.js",
    });
    expect(entry).toBeNull();
  });
});

describe("resolveOpenClawSpawnInvocation", () => {
  it("spawns node with the local entry when available", () => {
    const invocation = resolveOpenClawSpawnInvocation(["agent", "--local"], {
      execPath: "/usr/local/bin/node",
    });
    expect(invocation.command).toBe("/usr/local/bin/node");
    expect(invocation.args[0]?.endsWith("/openclaw.mjs")).toBe(true);
    expect(invocation.args.slice(1)).toEqual(["agent", "--local"]);
  });

  it("falls back to the openclaw binary when no local entry exists", () => {
    const invocation = resolveOpenClawSpawnInvocation(["agent", "--local"], {
      execPath: "/usr/local/bin/node",
      argv: ["/usr/local/bin/node", "/tmp/not-openclaw.js"],
      cwd: "/tmp",
      existsSync: () => false,
      moduleUrl: "file:///tmp/dist/company/runners/openclaw-runner.js",
    });
    expect(invocation).toEqual({
      command: "openclaw",
      args: ["agent", "--local"],
    });
  });
});

describe("createOpenClawLineParser", () => {
  it("ignores stdout preamble lines and parses the first JSON result object", () => {
    const parseLine = createOpenClawLineParser();
    expect(parseLine("🦞 OpenClaw 2026.3.13")).toBeNull();
    expect(
      parseLine(
        "19:41:04 [plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load",
      ),
    ).toBeNull();
    expect(parseLine("{")).toBeNull();
    expect(parseLine('  "payloads": [')).toBeNull();
    expect(parseLine('    { "text": "Hey! 👋 What can I help you with?" }')).toBeNull();
    expect(parseLine("  ],")).toBeNull();
    expect(parseLine('  "meta": { "agentMeta": { "usage": { "output": 16 } } }')).toBeNull();
    const result = parseLine("}");
    expect(result).toEqual({
      type: "result",
      content: "Hey! 👋 What can I help you with?",
      tokensUsed: 16,
    });
  });
});
