import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());
const resolveOpenClawPackageRootSyncMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn());
const resolveDefaultAgentIdMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
    spawnSync: spawnSyncMock,
  };
});

vi.mock("../../infra/openclaw-root.js", () => ({
  resolveOpenClawPackageRootSync: resolveOpenClawPackageRootSyncMock,
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: loadConfigMock,
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: resolveDefaultAgentIdMock,
}));

const { OpenClawRunner } = await import("./openclaw-runner.js");

describe("OpenClawRunner", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
    resolveOpenClawPackageRootSyncMock.mockReset();
    loadConfigMock.mockReset();
    resolveDefaultAgentIdMock.mockReset();
    spawnMock.mockReturnValue({} as ChildProcess);
    loadConfigMock.mockReturnValue({});
    resolveDefaultAgentIdMock.mockReturnValue("dev");
  });

  it("uses the bundled CLI entry when the current package root is available", () => {
    resolveOpenClawPackageRootSyncMock.mockReturnValue("E:\\claw\\openclaw");

    const runner = new OpenClawRunner();
    runner.runTask("engineering", "hello", {
      cwd: "E:\\claw\\openclaw",
      env: { OPENCLAW_PROFILE: "dev" },
      openclawAgentId: "dev",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        path.join("E:\\claw\\openclaw", "openclaw.mjs"),
        "agent",
        "--local",
        "--json",
        "--agent",
        "dev",
        "-m",
        "hello",
      ],
      expect.objectContaining({
        cwd: "E:\\claw\\openclaw",
        env: expect.objectContaining({ OPENCLAW_PROFILE: "dev" }),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  });

  it("falls back to the PATH-installed openclaw binary when no package root is found", () => {
    resolveOpenClawPackageRootSyncMock.mockReturnValue(null);

    const runner = new OpenClawRunner();
    runner.runTask("engineering", "hello");

    expect(spawnMock).toHaveBeenCalledWith(
      "openclaw",
      ["agent", "--local", "--json", "--agent", "dev", "-m", "hello"],
      expect.any(Object),
    );
  });

  it("falls back to main when config default agent resolution throws", () => {
    resolveOpenClawPackageRootSyncMock.mockReturnValue(null);
    loadConfigMock.mockImplementation(() => {
      throw new Error("bad config");
    });

    const runner = new OpenClawRunner();
    runner.runTask("engineering", "hello");

    expect(spawnMock).toHaveBeenCalledWith(
      "openclaw",
      ["agent", "--local", "--json", "--agent", "main", "-m", "hello"],
      expect.any(Object),
    );
  });

  it("reports available when the bundled CLI entry can be resolved", async () => {
    resolveOpenClawPackageRootSyncMock.mockReturnValue("E:\\claw\\openclaw");

    const runner = new OpenClawRunner();

    await expect(runner.isAvailable()).resolves.toBe(true);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("checks PATH availability when the bundled CLI entry is not available", async () => {
    resolveOpenClawPackageRootSyncMock.mockReturnValue(null);
    spawnSyncMock.mockReturnValue({ status: 0 });

    const runner = new OpenClawRunner();

    await expect(runner.isAvailable()).resolves.toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledWith("which", ["openclaw"], { stdio: "ignore" });
  });
});
