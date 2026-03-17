import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { LogStore } from "./log-store.js";
import { ProcessManager } from "./process-manager.js";
import type { AgentRegistry } from "./registry.js";
import type { CliAgentRunner } from "./runners/base.js";

function createRegistry(runtime: CliAgentRunner["name"]): AgentRegistry {
  return {
    getMeta: (id: string) => ({
      id,
      role: "Engineer",
      team: "engineering",
      emoji: "x",
      color: "#000000",
      description: "",
      runtime,
    }),
    getAgents: () => [],
  } as unknown as AgentRegistry;
}

function createFailingChild(message: string): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    stdout: null,
    stderr: null,
    pid: undefined,
    kill: vi.fn(() => true),
  });
  queueMicrotask(() => {
    child.emit("error", new Error(message));
  });
  return child;
}

function createExitingChild(exitCode = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    stdout: null,
    stderr: null,
    pid: undefined,
    kill: vi.fn(() => true),
  });
  queueMicrotask(() => {
    child.emit("exit", exitCode);
  });
  return child;
}

function createChildWithStderr(params: { stderrLines: string[]; exitCode?: number }): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stderr = new PassThrough();
  Object.assign(child, {
    stdout: null,
    stderr,
    pid: undefined,
    kill: vi.fn(() => true),
  });
  queueMicrotask(() => {
    for (const line of params.stderrLines) {
      stderr.write(`${line}\n`);
    }
    stderr.end();
    child.emit("exit", params.exitCode ?? 0);
  });
  return child;
}

describe("ProcessManager", () => {
  it("rejects runTaskAwait and marks the agent crashed when the runner fails to spawn", async () => {
    const logStore = new LogStore();
    const broadcast = vi.fn();
    const runner: CliAgentRunner = {
      name: "codex",
      isAvailable: async () => false,
      runTask: () => createFailingChild("spawn codex ENOENT"),
      parseOutput: () => null,
    };
    const processManager = new ProcessManager(createRegistry("codex"), logStore, broadcast, [
      runner,
    ]);

    await expect(processManager.runTaskAwait("engineering", "hello")).rejects.toThrow(
      'Failed to start agent "engineering" runtime "codex": spawn codex ENOENT',
    );

    expect(processManager.getState("engineering").status).toBe("crashed");
    expect(logStore.get("engineering").at(-1)?.content).toContain("spawn codex ENOENT");
    expect(broadcast).toHaveBeenCalledWith(
      "company.agent.log",
      expect.objectContaining({
        agentId: "engineering",
        entry: expect.objectContaining({
          type: "error",
          content: expect.stringContaining("spawn codex ENOENT"),
        }),
      }),
    );
  });

  it("suppresses Windows PowerShell profile noise from child stderr logs", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const logStore = new LogStore();
      const broadcast = vi.fn();
      const runner: CliAgentRunner = {
        name: "openclaw",
        isAvailable: async () => true,
        runTask: () =>
          createChildWithStderr({
            stderrLines: [
              ". 'C:\\Users\\test\\Documents\\WindowsPowerShell\\profile.ps1'",
              "See about_Execution_Policies for more information.",
              "PSSecurityException",
              "[warn] kept",
            ],
          }),
        parseOutput: () => null,
      };
      const processManager = new ProcessManager(createRegistry("openclaw"), logStore, broadcast, [
        runner,
      ]);

      await expect(processManager.runTaskAwait("engineering", "hello")).resolves.toEqual({
        runId: expect.any(String),
        content: "",
        tokensUsed: 0,
        exitCode: 0,
      });

      const logs = logStore.get("engineering");
      expect(logs).toHaveLength(1);
      expect(logs[0]?.type).toBe("system");
      expect(logs[0]?.content).toContain("[warn] kept");
      expect(logs[0]?.content).not.toContain("profile.ps1");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("calls onFinish with agentId, exitCode, and runId on process exit", async () => {
    const logStore = new LogStore();
    const broadcast = vi.fn();
    const onFinish = vi.fn();
    const runner: CliAgentRunner = {
      name: "openclaw",
      isAvailable: async () => true,
      runTask: () => createExitingChild(0),
      parseOutput: () => null,
    };
    const pm = new ProcessManager(createRegistry("openclaw"), logStore, broadcast, [runner]);

    const result = await pm.runTaskAwait("engineering", "hello", { onFinish });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({
      agentId: "engineering",
      exitCode: 0,
      runId: result.runId,
    });
  });

  it("resolves result even when onFinish throws", async () => {
    const logStore = new LogStore();
    const broadcast = vi.fn();
    const onFinish = vi.fn(() => {
      throw new Error("callback boom");
    });
    const runner: CliAgentRunner = {
      name: "openclaw",
      isAvailable: async () => true,
      runTask: () => createExitingChild(0),
      parseOutput: () => null,
    };
    const pm = new ProcessManager(createRegistry("openclaw"), logStore, broadcast, [runner]);

    const result = await pm.runTaskAwait("engineering", "hello", { onFinish });

    expect(result.exitCode).toBe(0);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
