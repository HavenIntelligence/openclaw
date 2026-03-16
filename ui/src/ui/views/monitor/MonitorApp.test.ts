/* @vitest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonitorApp } from "./MonitorApp";

type GatewayClient = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

function createSession(id: string, name: string) {
  return {
    id,
    name,
    startTime: 0,
    endTime: 60,
    maxTime: 60,
    agents: [],
    events: [],
    annotations: [],
    agentConfigs: {},
    agentTelemetry: {},
    metrics: { avgLatency: "N/A", totalTokens: 0, bottleneckCount: 0 },
    chatMessages: [],
  };
}

function createMissionSummary(missionId: string, title: string) {
  return {
    missionId,
    title,
    startTime: 0,
    endTime: 60,
    agentCount: 1,
    taskCount: 1,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MonitorApp mission navigation", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  it("refetches the selected mission when the same mission is requested again", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const missions = [
      createMissionSummary("mission-alpha", "Alpha Mission"),
      createMissionSummary("mission-beta", "Beta Mission"),
    ];
    const request = vi.fn<GatewayClient["request"]>(async (method, params) => {
      if (method === "monitor.sessions") {
        const session = createSession("session-1", "Session 1");
        return {
          sessions: [session],
          list: [{ id: session.id, name: session.name, startTime: 0, endTime: 60 }],
        };
      }
      if (method === "monitor.missions.list") {
        return { missions };
      }
      if (method === "monitor.mission") {
        const p = params as Record<string, string> | undefined;
        const missionId = p?.missionId ?? "";
        return createSession(missionId, `Loaded ${missionId}`);
      }
      throw new Error(`Unexpected request: ${method}`);
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(MonitorApp, {
          isDark: true,
          client: { request },
          pendingMissionRequest: { missionId: "mission-alpha", requestId: 1 },
        }),
      );
    });
    await flushEffects();

    const missionCallsAfterFirstRender = request.mock.calls.filter(
      ([method, params]) => method === "monitor.mission" && params?.missionId === "mission-alpha",
    );
    expect(missionCallsAfterFirstRender.length).toBeGreaterThanOrEqual(1);

    const missionSelect = container.querySelector('select[title="Select mission"]');
    expect(missionSelect).toBeInstanceOf(HTMLSelectElement);
    expect((missionSelect as HTMLSelectElement).value).toBe("mission-alpha");

    await act(async () => {
      root?.render(
        React.createElement(MonitorApp, {
          isDark: true,
          client: { request },
          pendingMissionRequest: { missionId: "mission-alpha", requestId: 2 },
        }),
      );
    });
    await flushEffects();

    const missionCallsAfterSecondRender = request.mock.calls.filter(
      ([method, params]) => method === "monitor.mission" && params?.missionId === "mission-alpha",
    );
    expect(missionCallsAfterSecondRender.length).toBeGreaterThan(
      missionCallsAfterFirstRender.length,
    );
    expect(
      (container.querySelector('select[title="Select mission"]') as HTMLSelectElement).value,
    ).toBe("mission-alpha");
  });
});
