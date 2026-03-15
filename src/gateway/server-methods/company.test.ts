import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawDockAgent, Task } from "../../company/types.js";
import type { GatewayRequestContext } from "./types.js";

const mocks = vi.hoisted(() => ({
  getCompanyService: vi.fn(),
}));

vi.mock("../../company/company-service.js", () => ({
  getCompanyService: mocks.getCompanyService,
}));

import { companyHandlers } from "./company.js";

type CompanyServiceMock = ReturnType<typeof createCompanyServiceMock>;

function createMessageBusMock() {
  let seq = 0;
  const history: Array<{
    id: string;
    from: string;
    to: string;
    content: string;
    type: "task" | "result" | "query" | "notify";
    ts: number;
  }> = [];
  const send = vi.fn(
    (
      from: string,
      to: string,
      content: string,
      type: "task" | "result" | "query" | "notify" = "notify",
    ) => {
      const msg = {
        id: `msg-${++seq}`,
        from,
        to,
        content,
        type,
        ts: seq,
      };
      history.push(msg);
      return msg;
    },
  );
  return { send, history };
}

function createCompanyServiceMock(params?: {
  agents?: ClawDockAgent[];
  directReports?: Record<string, string[]>;
}) {
  const agents = params?.agents ?? [];
  const directReports = params?.directReports ?? {};
  let taskSeq = 0;
  const messageBus = createMessageBusMock();
  const taskStore = {
    create: vi.fn(async (input: Partial<Task>) => ({
      id: `task-${++taskSeq}`,
      title: input.title ?? "task",
      description: input.description,
      status: input.status ?? "in_progress",
      priority: input.priority ?? "high",
      assignee: input.assignee,
      project: input.project,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    update: vi.fn(async (id: string, partial: Partial<Task>) => ({
      id,
      title: "task",
      status: partial.status ?? "done",
      priority: "high" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tokensUsed: partial.tokensUsed,
    })),
  };
  return {
    registry: {
      getAgents: vi.fn(() => agents),
      getAgent: vi.fn((id: string) => agents.find((agent) => agent.id === id)),
      getDirectReports: vi.fn((id: string) => directReports[id] ?? []),
    },
    messageBus,
    processManager: {
      runTaskAwait: vi.fn(),
    },
    orchestrator: {
      execute: vi.fn(),
    },
    profileStore: {
      get: vi.fn(() => ({ maxOrchestrationRounds: 5 })),
    },
    logStore: {
      append: vi.fn((entry: Record<string, unknown>) => ({
        id: `log-${Date.now()}`,
        ts: Date.now(),
        ...entry,
      })),
    },
    taskStore,
    broadcast: vi.fn(),
  };
}

function createAgent(overrides: Partial<ClawDockAgent> & Pick<ClawDockAgent, "id">): ClawDockAgent {
  return {
    id: overrides.id,
    name: overrides.id,
    model: "default",
    role: overrides.role ?? "Agent",
    team: overrides.team ?? "general",
    emoji: overrides.emoji ?? "🤖",
    color: overrides.color ?? "#000",
    description: overrides.description ?? "",
    runtime: overrides.runtime ?? "openclaw",
    reportTo: overrides.reportTo,
    directReports: overrides.directReports ?? [],
    toolCount: overrides.toolCount ?? 0,
    cronCount: overrides.cronCount ?? 0,
    status: overrides.status ?? "idle",
    pid: overrides.pid,
    startedAt: overrides.startedAt,
    lastActiveAt: overrides.lastActiveAt,
    cpuPercent: overrides.cpuPercent,
    memoryMb: overrides.memoryMb,
    tokensUsed: overrides.tokensUsed ?? 0,
    tasksCompleted: overrides.tasksCompleted ?? 0,
    currentTask: overrides.currentTask,
  };
}

function createContext(): GatewayRequestContext {
  return {
    dedupe: new Map(),
  } as unknown as GatewayRequestContext;
}

async function invokeCompanyMessageSend(
  service: CompanyServiceMock,
  params: Record<string, unknown>,
) {
  mocks.getCompanyService.mockReturnValue(service);
  const respond = vi.fn();
  await companyHandlers["company.message.send"]({
    params,
    respond,
    req: { type: "req", id: "1", method: "company.message.send" },
    client: null,
    isWebchatConnect: () => false,
    context: createContext(),
  });
  return { respond };
}

describe("company.message.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-selects the director for Company-targeted messages and writes the final reply to chat", async () => {
    const engineering = createAgent({ id: "engineering", role: "Engineer" });
    const orchestrator = createAgent({ id: "orchestrator", role: "Orchestrator" });
    const service = createCompanyServiceMock({
      agents: [engineering, orchestrator],
    });
    service.processManager.runTaskAwait.mockResolvedValue({
      runId: "run-1",
      content: "final launch plan",
      tokensUsed: 42,
      exitCode: 0,
    });

    const { respond } = await invokeCompanyMessageSend(service, { content: "Ship it" });

    expect(service.processManager.runTaskAwait).toHaveBeenCalledWith("orchestrator", "Ship it");
    expect(service.messageBus.send).toHaveBeenNthCalledWith(
      1,
      "human",
      "company",
      "Ship it",
      "task",
    );
    expect(service.messageBus.send).toHaveBeenNthCalledWith(
      2,
      "orchestrator",
      "human",
      "final launch plan",
      "result",
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, msgId: "msg-1", runId: "run-1" }),
      undefined,
    );
  });

  it("routes direct leaf-agent messages to that agent and records the agent reply", async () => {
    const engineering = createAgent({ id: "engineering", role: "Engineer" });
    const orchestrator = createAgent({ id: "orchestrator", role: "Orchestrator" });
    const service = createCompanyServiceMock({
      agents: [orchestrator, engineering],
    });
    service.processManager.runTaskAwait.mockResolvedValue({
      runId: "run-2",
      content: "three launch risks",
      tokensUsed: 12,
      exitCode: 0,
    });

    const { respond } = await invokeCompanyMessageSend(service, {
      content: "Give me launch risks",
      targetAgentId: "engineering",
    });

    expect(service.processManager.runTaskAwait).toHaveBeenCalledWith(
      "engineering",
      "Give me launch risks",
    );
    expect(service.messageBus.send).toHaveBeenNthCalledWith(
      1,
      "human",
      "engineering",
      "Give me launch risks",
      "task",
    );
    expect(service.messageBus.send).toHaveBeenNthCalledWith(
      2,
      "engineering",
      "human",
      "three launch risks",
      "result",
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, msgId: "msg-1", runId: "run-2" }),
      undefined,
    );
  });

  it("keeps orchestration for an explicitly targeted orchestrator and writes the final synthesized reply", async () => {
    const orchestrator = createAgent({
      id: "orchestrator",
      role: "Orchestrator",
      directReports: ["engineering", "marketing"],
    });
    const engineering = createAgent({
      id: "engineering",
      role: "Engineer",
      reportTo: "orchestrator",
    });
    const marketing = createAgent({
      id: "marketing",
      role: "Researcher",
      reportTo: "orchestrator",
    });
    const service = createCompanyServiceMock({
      agents: [orchestrator, engineering, marketing],
      directReports: { orchestrator: ["engineering", "marketing"] },
    });
    service.orchestrator.execute.mockResolvedValue({
      agentId: "orchestrator",
      content: "final synthesized plan",
      tokensUsed: 77,
      subtasks: [],
      phase: "orchestrated",
      durationMs: 1,
    });

    const { respond } = await invokeCompanyMessageSend(service, {
      content: "Make a launch plan",
      targetAgentId: "orchestrator",
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, orchestrating: true, msgId: "msg-1" }),
      undefined,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(service.orchestrator.execute).toHaveBeenCalledWith(
      "orchestrator",
      "Make a launch plan",
      {
        maxRounds: 5,
      },
    );
    expect(service.messageBus.send).toHaveBeenNthCalledWith(
      2,
      "orchestrator",
      "human",
      "final synthesized plan",
      "result",
    );
  });

  it("rejects unknown direct targets with NOT_FOUND", async () => {
    const orchestrator = createAgent({ id: "orchestrator", role: "Orchestrator" });
    const service = createCompanyServiceMock({
      agents: [orchestrator],
    });

    const { respond } = await invokeCompanyMessageSend(service, {
      content: "Hello",
      targetAgentId: "missing-agent",
    });

    expect(service.messageBus.send).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "NOT_FOUND",
        message: 'agent "missing-agent" not found',
      }),
    );
  });
});
