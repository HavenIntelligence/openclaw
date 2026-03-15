import { describe, expect, it, vi } from "vitest";
import {
  loadCompanyChatMessages,
  normalizeCompanyChatAgentIds,
  sendMessageToCompany,
  updateAgent,
  type CompanyState,
} from "./company.ts";

function createState(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    client: null,
    connected: true,
    companyAgents: [],
    companyAgentsLoading: false,
    companyFleetSnapshot: null,
    companyTasks: [],
    companyTeams: [],
    companyProfile: null,
    companyAgentLogs: new Map(),
    companyMessages: [
      { id: "full-1", from: "human", to: "company", content: "hello", type: "task", ts: 1 },
    ],
    companyChatMessages: [],
    companyChatFilterAgentIds: [],
    ...overrides,
  };
}

describe("loadCompanyChatMessages", () => {
  it("passes agentIds to company.messages.list and only updates chat messages", async () => {
    const filteredMessages = [
      {
        id: "msg-1",
        from: "engineering",
        to: "orchestrator",
        content: "done",
        type: "result" as const,
        ts: 2,
      },
    ];
    const request = vi.fn().mockResolvedValue(filteredMessages);
    const state = createState({
      client: { request } as never,
      companyChatFilterAgentIds: ["engineering"],
    });

    await loadCompanyChatMessages(state, {
      limit: 25,
      agentIds: ["engineering", "engineering"],
    });

    expect(request).toHaveBeenCalledWith("company.messages.list", {
      limit: 25,
      agentIds: ["engineering"],
    });
    expect(state.companyChatMessages).toEqual(filteredMessages);
    expect(state.companyMessages).toEqual([
      { id: "full-1", from: "human", to: "company", content: "hello", type: "task", ts: 1 },
    ]);
  });
});

describe("sendMessageToCompany", () => {
  it("omits targetAgentId for the default Company target", async () => {
    const request = vi.fn().mockResolvedValue({ msgId: "msg-1" });
    const state = createState({
      client: { request } as never,
    });

    await sendMessageToCompany(state, { content: "ship it" });

    expect(request).toHaveBeenCalledWith("company.message.send", {
      content: "ship it",
    });
  });

  it("passes targetAgentId when sending directly to an agent", async () => {
    const request = vi.fn().mockResolvedValue({ msgId: "msg-2", runId: "run-2" });
    const state = createState({
      client: { request } as never,
    });

    await sendMessageToCompany(state, {
      content: "give me launch risks",
      targetAgentId: "engineering",
    });

    expect(request).toHaveBeenCalledWith("company.message.send", {
      content: "give me launch risks",
      targetAgentId: "engineering",
    });
  });
});

describe("updateAgent", () => {
  it("sends agent updates and refreshes the agent list", async () => {
    const updatedAgent = {
      id: "engineering",
      name: "engineering",
      model: "default",
      role: "Engineer",
      team: "platform",
      emoji: "🛠️",
      color: "#000",
      description: "Builds product",
      runtime: "openclaw",
      reportTo: "orchestrator",
      directReports: [],
      toolCount: 0,
      cronCount: 0,
      status: "idle" as const,
      tokensUsed: 0,
      tasksCompleted: 0,
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(updatedAgent)
      .mockResolvedValueOnce([updatedAgent]);
    const state = createState({
      client: { request } as never,
    });

    await updateAgent(state, "engineering", {
      runtime: "openclaw",
      reportTo: "orchestrator",
    });

    expect(request).toHaveBeenNthCalledWith(1, "company.agents.update", {
      id: "engineering",
      runtime: "openclaw",
      reportTo: "orchestrator",
    });
    expect(request).toHaveBeenNthCalledWith(2, "company.agents.list", {});
    expect(state.companyAgents).toEqual([updatedAgent]);
  });

  it("surfaces update failures instead of swallowing them", async () => {
    const request = vi.fn().mockRejectedValue(new Error("write failed"));
    const state = createState({
      client: { request } as never,
    });

    await expect(
      updateAgent(state, "orchestrator", {
        runtime: "openclaw",
      }),
    ).rejects.toThrow("write failed");
  });
});

describe("normalizeCompanyChatAgentIds", () => {
  it("deduplicates and trims ids", () => {
    expect(normalizeCompanyChatAgentIds([" engineering ", "engineering", "marketing"])).toEqual([
      "engineering",
      "marketing",
    ]);
  });
});
