/**
 * Gateway API adapter for the Monitor dashboard.
 * Converts wire format from `monitor.sessions` to the UI's TaskSessionData.
 */
import type { TaskSessionData } from "./types";

export interface MonitorClient {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

// Global client reference — set by the Lit host when gateway connects
let _globalClient: MonitorClient | null = null;

export function setMonitorClient(client: MonitorClient | null) {
  _globalClient = client;
}

export function getMonitorClient(): MonitorClient | null {
  if (_globalClient) {
    return _globalClient;
  }
  // Fallback: check window global set by Lit host
  const win = window as unknown as Record<string, unknown>;
  const wc = win.__openclawMonitorClient as MonitorClient | undefined;
  return wc ?? null;
}

interface WireTaskSession {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime: number | null;
  maxTime: number;
  agents: TaskSessionData["agents"];
  events: TaskSessionData["events"];
  annotations: TaskSessionData["annotations"];
  agentConfigs: TaskSessionData["agentConfigs"];
  agentTelemetry: TaskSessionData["agentTelemetry"];
  metrics: TaskSessionData["metrics"];
  chatMessages: TaskSessionData["chatMessages"];
}

interface WireSessionSummary {
  id: string;
  name: string;
  startTime: number;
  endTime: number | null;
  agentCount: number;
  eventCount: number;
}

interface MonitorSessionsResponse {
  sessions: WireTaskSession[];
  list: WireSessionSummary[];
}

function wireToTaskSession(wire: WireTaskSession): {
  session: TaskSessionData;
  maxTime: number;
} {
  return {
    session: {
      id: wire.id,
      name: wire.name,
      description: wire.description,
      startTime: wire.startTime,
      endTime: wire.endTime,
      agents: wire.agents,
      events: wire.events,
      annotations: wire.annotations,
      agentConfigs: wire.agentConfigs,
      agentTelemetry: wire.agentTelemetry,
      metrics: wire.metrics,
      chatMessages: wire.chatMessages,
    },
    maxTime: wire.maxTime,
  };
}

export async function fetchMonitorSessions(client: MonitorClient): Promise<{
  sessions: { session: TaskSessionData; maxTime: number }[];
  list: WireSessionSummary[];
} | null> {
  try {
    console.log("[monitorApi] Calling monitor.sessions...");
    const raw = (await client.request("monitor.sessions", {
      limit: 10,
    })) as MonitorSessionsResponse;
    console.log(
      "[monitorApi] Got response:",
      raw ? `${raw.sessions?.length ?? 0} sessions` : "null",
    );
    if (!raw?.sessions) {
      return null;
    }
    return {
      sessions: raw.sessions.map(wireToTaskSession),
      list: raw.list,
    };
  } catch (err) {
    console.error("[monitorApi] Failed to fetch sessions:", err);
    return null;
  }
}

/**
 * Standalone fetch via HTTP POST to the gateway's JSON-RPC endpoint.
 * This bypasses the WebSocket client and works even if the WS client isn't connected yet.
 */
export async function fetchMonitorSessionsHttp(baseUrl: string = ""): Promise<{
  sessions: { session: TaskSessionData; maxTime: number }[];
  list: WireSessionSummary[];
} | null> {
  try {
    // Use the same origin as the page
    const url = baseUrl || window.location.origin;
    console.log("[monitorApi] Fetching via HTTP from", url);
    const resp = await fetch(`${url}/__openclaw__/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        method: "monitor.sessions",
        params: { limit: 10 },
      }),
    });
    if (!resp.ok) {
      console.error("[monitorApi] HTTP error:", resp.status);
      return null;
    }
    const json = (await resp.json()) as { ok?: boolean; payload?: MonitorSessionsResponse };
    console.log("[monitorApi] HTTP response ok:", json.ok);
    if (!json.ok || !json.payload?.sessions) {
      return null;
    }
    return {
      sessions: json.payload.sessions.map(wireToTaskSession),
      list: json.payload.list,
    };
  } catch (err) {
    console.error("[monitorApi] HTTP fetch failed:", err);
    return null;
  }
}
