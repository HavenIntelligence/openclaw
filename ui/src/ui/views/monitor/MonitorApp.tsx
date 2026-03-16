import React, { useState, useEffect, useMemo } from "react";
import "./monitor.css";
import { deriveState } from "./derivation";
import { mockTaskSession, mockTimelineEnd } from "./mockData";
import { MonitorDashboard } from "./MonitorDashboard";
import type { TaskSessionData } from "./types";

export interface MonitorAppProps {
  isDark: boolean;
  client?: { request(method: string, params?: Record<string, unknown>): Promise<unknown> } | null;
}

type SessionEntry = {
  session: TaskSessionData;
  maxTime: number;
};

type SessionSummary = {
  id: string;
  name: string;
  startTime: number;
  endTime: number | null;
};

const mockEntry: SessionEntry = {
  session: mockTaskSession,
  maxTime: mockTimelineEnd,
};

const mockSummaries: SessionSummary[] = [
  {
    id: mockTaskSession.id,
    name: mockTaskSession.name,
    startTime: mockTaskSession.startTime,
    endTime: mockTaskSession.endTime,
  },
];

// Inline fetch to avoid cross-module resolution issues
async function doFetchSessions(client: {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}): Promise<{ sessions: SessionEntry[]; list: SessionSummary[] } | null> {
  try {
    const raw = (await client.request("monitor.sessions", { limit: 10 })) as {
      sessions?: Array<{
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
      }>;
      list?: SessionSummary[];
    };
    if (!raw?.sessions?.length) {
      return null;
    }
    return {
      sessions: raw.sessions.map((wire) => ({
        session: {
          id: wire.id,
          name: wire.name,
          description: wire.description,
          startTime: wire.startTime,
          endTime: wire.endTime,
          agents: wire.agents ?? [],
          events: wire.events ?? [],
          annotations: wire.annotations ?? [],
          agentConfigs: wire.agentConfigs ?? {},
          agentTelemetry: wire.agentTelemetry ?? {},
          metrics: wire.metrics ?? { avgLatency: "N/A", totalTokens: 0, bottleneckCount: 0 },
          chatMessages: wire.chatMessages ?? [],
        },
        maxTime: wire.maxTime ?? 250,
      })),
      list: raw.list ?? [],
    };
  } catch (err) {
    console.error("[monitor] fetch error:", err);
    return null;
  }
}

export function MonitorApp({ isDark, client }: MonitorAppProps) {
  // Also check window global for cross-framework client
  const resolvedClient =
    client ??
    ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);

  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([mockEntry]);
  const [summaries, setSummaries] = useState<SessionSummary[]>(mockSummaries);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(mockTaskSession.id);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (dataLoaded) {
      return;
    }

    const tryLoad = async () => {
      // Check for client each attempt (may appear after initial render)
      const c =
        resolvedClient ??
        ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);
      if (!c) {
        console.log("[monitor] No gateway client yet, will retry...");
        return false;
      }
      console.log("[monitor] Gateway client found, fetching sessions...");
      const result = await doFetchSessions(c);
      if (result && result.sessions.length > 0) {
        setSessionEntries(result.sessions);
        setSummaries(result.list);
        setSelectedSessionId(result.sessions[0].session.id);
        setDataLoaded(true);
        console.log("[monitor] Loaded", result.sessions.length, "real sessions");
        return true;
      }
      console.log("[monitor] No sessions returned, using mock data");
      return false;
    };

    void tryLoad();
    const interval = setInterval(() => {
      void tryLoad().then((ok) => {
        if (ok) {
          clearInterval(interval);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [dataLoaded, resolvedClient]);

  // Current session
  const currentEntry = useMemo(
    () =>
      sessionEntries.find((e) => e.session.id === selectedSessionId) ??
      sessionEntries[0] ??
      mockEntry,
    [sessionEntries, selectedSessionId],
  );

  const session = currentEntry.session;
  const MAX_TIME = currentEntry.maxTime;

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Reset playback when session changes
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(true);
    setSelectedAgentId(null);
    setHoveredAgentId(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const tickMs = MAX_TIME > 600 ? 10 : MAX_TIME > 120 ? 50 : 100;
    const step = MAX_TIME > 600 ? 5 : MAX_TIME > 120 ? 2 : 1;
    const timer = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= MAX_TIME) {
          setIsPlaying(false);
          return t;
        }
        return Math.min(t + step, MAX_TIME);
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [isPlaying, MAX_TIME]);

  const derivedState = useMemo(
    () => deriveState(session.agents, session.events, currentTime),
    [session, currentTime],
  );

  return (
    <MonitorDashboard
      currentTime={currentTime}
      setCurrentTime={setCurrentTime}
      isPlaying={isPlaying}
      setIsPlaying={setIsPlaying}
      selectedAgentId={selectedAgentId}
      setSelectedAgentId={setSelectedAgentId}
      hoveredAgentId={hoveredAgentId}
      setHoveredAgentId={setHoveredAgentId}
      agents={session.agents}
      events={session.events}
      maxTime={MAX_TIME}
      isDark={isDark}
      taskSession={session}
      availableTaskSessions={summaries}
      onSessionChange={setSelectedSessionId}
      {...derivedState}
    />
  );
}
