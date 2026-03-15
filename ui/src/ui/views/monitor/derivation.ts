import type { Agent, LifecycleEvent, ActivityWindow, LineageEdge, AgentSnapshot } from "./types";

export function deriveState(agents: Agent[], events: LifecycleEvent[], currentTime: number) {
  const snapshots: Record<string, AgentSnapshot> = {};
  const activityWindows: ActivityWindow[] = [];
  const lineageEdges: LineageEdge[] = [];

  agents.forEach((a) => {
    snapshots[a.id] = { ...a, currentStatus: "waiting" };
  });

  const sortedEvents = [...events]
    .filter((e) => e.timestamp <= currentTime)
    .toSorted((a, b) => a.timestamp - b.timestamp);

  const activeWindowMap: Record<string, ActivityWindow> = {};

  sortedEvents.forEach((event) => {
    const agent = snapshots[event.agentId];
    if (!agent) {
      return;
    }

    agent.lastEvent = event;

    switch (event.type) {
      case "spawn":
        agent.currentStatus = "waiting";
        break;
      case "start":
      case "resume":
        agent.currentStatus = "running";
        const newWindow: ActivityWindow = {
          id: `w_${event.id}`,
          agentId: event.agentId,
          startTime: event.timestamp,
          endTime: null,
        };
        activeWindowMap[event.agentId] = newWindow;
        activityWindows.push(newWindow);
        break;
      case "pause":
        agent.currentStatus = "paused";
        if (activeWindowMap[event.agentId]) {
          activeWindowMap[event.agentId].endTime = event.timestamp;
          delete activeWindowMap[event.agentId];
        }
        break;
      case "error":
        agent.currentStatus = "error";
        if (activeWindowMap[event.agentId]) {
          activeWindowMap[event.agentId].endTime = event.timestamp;
          delete activeWindowMap[event.agentId];
        }
        break;
      case "archive":
        agent.currentStatus = "archived";
        if (activeWindowMap[event.agentId]) {
          activeWindowMap[event.agentId].endTime = event.timestamp;
          delete activeWindowMap[event.agentId];
        }
        break;
      case "split":
      case "merge":
      case "handoff":
      case "backtrack":
        if (event.targetId) {
          lineageEdges.push({
            id: `edge_${event.id}`,
            sourceId: event.agentId,
            targetId: event.targetId,
            type: event.type as "split" | "merge" | "backtrack" | "handoff",
            timestamp: event.timestamp,
          });
        }
        break;
    }
  });

  return {
    snapshots: Object.values(snapshots),
    activityWindows,
    lineageEdges,
  };
}
