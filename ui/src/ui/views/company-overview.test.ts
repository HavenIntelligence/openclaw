/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { ClawDockAgent } from "../company-types.ts";
import { renderCompanyOverview, type CompanyOverviewProps } from "./company-overview.ts";

function createAgent(overrides: Partial<ClawDockAgent> & Pick<ClawDockAgent, "id">): ClawDockAgent {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    model: overrides.model ?? "default",
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

function createProps(overrides: Partial<CompanyOverviewProps> = {}): CompanyOverviewProps {
  return {
    agents: [
      createAgent({ id: "dev", name: "Dev", emoji: "🧪" }),
      createAgent({ id: "engineering", name: "Engineering", emoji: "🛠️" }),
    ],
    tasks: [],
    messages: [],
    allMessages: [],
    logs: new Map(),
    requestUpdate: () => undefined,
    onSendMessage: () => undefined,
    ...overrides,
  };
}

function openChatsTab(container: HTMLElement, props: CompanyOverviewProps) {
  render(renderCompanyOverview(props), container);
  const chatsButton = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".cd-subnav__btn"),
  ).find((button) => button.textContent?.includes("Chats"));
  expect(chatsButton).toBeTruthy();
  chatsButton?.click();
  render(renderCompanyOverview(props), container);
  const targetSelect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Chat target"]',
  );
  if (targetSelect && targetSelect.value !== "") {
    targetSelect.value = "";
    targetSelect.dispatchEvent(new Event("change"));
    render(renderCompanyOverview(props), container);
  }
  const textarea = container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input");
  if (textarea && textarea.value !== "") {
    textarea.value = "";
    textarea.dispatchEvent(new Event("input"));
    render(renderCompanyOverview(props), container);
  }
}

function flushTasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("company overview chats compose", () => {
  it("renders Company plus agent options in the target selector", () => {
    const container = document.createElement("div");
    const props = createProps();

    openChatsTab(container, props);

    const targetSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Chat target"]',
    );
    expect(targetSelect).not.toBeNull();
    const optionLabels = Array.from(targetSelect?.options ?? []).map((option) =>
      option.textContent?.trim(),
    );
    expect(optionLabels).toEqual(["Company", "🧪 Dev", "🛠️ Engineering"]);

    const textarea = container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input");
    expect(textarea?.getAttribute("placeholder")).toBe("Message to Company…");
  });

  it("passes targetAgentId on send and keeps the selected target after success", async () => {
    const container = document.createElement("div");
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const props = createProps({ onSendMessage });

    openChatsTab(container, props);

    const targetSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Chat target"]',
    );
    expect(targetSelect).not.toBeNull();
    targetSelect!.value = "engineering";
    targetSelect!.dispatchEvent(new Event("change"));
    render(renderCompanyOverview(props), container);

    const textarea = container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input");
    expect(textarea).not.toBeNull();
    textarea!.value = "Need launch risks";
    textarea!.dispatchEvent(new Event("input"));
    render(renderCompanyOverview(props), container);

    const sendButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Send"),
    );
    expect(sendButton).toBeTruthy();
    sendButton?.click();

    await flushTasks();
    render(renderCompanyOverview(props), container);

    expect(onSendMessage).toHaveBeenCalledWith({
      content: "Need launch risks",
      targetAgentId: "engineering",
    });
    expect(container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input")?.value).toBe(
      "",
    );
    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="Chat target"]')?.value,
    ).toBe("engineering");
  });

  it("preserves input and target and shows an inline error when send fails", async () => {
    const container = document.createElement("div");
    const onSendMessage = vi.fn().mockRejectedValue(new Error("gateway closed"));
    const props = createProps({ onSendMessage });

    openChatsTab(container, props);

    const targetSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Chat target"]',
    );
    expect(targetSelect).not.toBeNull();
    targetSelect!.value = "engineering";
    targetSelect!.dispatchEvent(new Event("change"));
    render(renderCompanyOverview(props), container);

    const textarea = container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input");
    expect(textarea).not.toBeNull();
    textarea!.value = "Need launch risks";
    textarea!.dispatchEvent(new Event("input"));
    render(renderCompanyOverview(props), container);

    const sendButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Send"),
    );
    expect(sendButton).toBeTruthy();
    sendButton?.click();

    await flushTasks();
    await flushTasks();
    render(renderCompanyOverview(props), container);

    expect(container.querySelector<HTMLTextAreaElement>(".cd-chats-compose__input")?.value).toBe(
      "Need launch risks",
    );
    expect(
      container.querySelector<HTMLSelectElement>('select[aria-label="Chat target"]')?.value,
    ).toBe("engineering");
    expect(container.textContent).toContain("gateway closed");
  });
});
