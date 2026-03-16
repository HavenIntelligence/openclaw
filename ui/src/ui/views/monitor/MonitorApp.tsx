import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./monitor.css";
import { deriveState } from "./derivation";
import { mockTaskSession, mockTimelineEnd } from "./mockData";
import { MonitorDashboard } from "./MonitorDashboard";
import type { TaskSessionData, MissionSummary } from "./types";

export interface MonitorAppProps {
  isDark: boolean;
  client?: {
    request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  } | null;
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

function createPlaceholderEntry(
  id: string,
  name: string,
  description: string,
  maxTime = 10,
): SessionEntry {
  return {
    session: {
      id,
      name,
      description,
      startTime: 0,
      endTime: null,
      agents: [],
      events: [],
      annotations: [],
      agentConfigs: {},
      agentTelemetry: {},
      metrics: { avgLatency: "–", totalTokens: 0, bottleneckCount: 0 },
      chatMessages: [],
    },
    maxTime,
  };
}

const loadingEntry = createPlaceholderEntry(
  "__loading__",
  "Loading mission…",
  "Fetching mission timeline and agent activity.",
);
const emptyMissionEntry = createPlaceholderEntry(
  "__empty__",
  "No missions yet",
  "Run a company mission to populate the Monitor.",
  1,
);

function createUnavailableMissionEntry(missionId: string): SessionEntry {
  return createPlaceholderEntry(missionId, missionId, "This mission could not be loaded.", 1);
}

const mockSummaries: SessionSummary[] = [
  {
    id: mockTaskSession.id,
    name: mockTaskSession.name,
    startTime: mockTaskSession.startTime,
    endTime: mockTaskSession.endTime,
  },
];

// ── Fetch helpers ────────────────────────────────────────────────────────

type GatewayClient = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

async function doFetchSessions(
  client: GatewayClient,
): Promise<{ sessions: SessionEntry[]; list: SessionSummary[] } | null> {
  try {
    const raw = (await client.request("monitor.sessions", { limit: 10 })) as {
      sessions?: Array<Record<string, unknown>>;
      list?: SessionSummary[];
    };
    if (!raw?.sessions?.length) {
      return null;
    }
    return {
      sessions: raw.sessions.map((wire) => ({
        session: {
          id: wire.id as string,
          name: wire.name as string,
          description: wire.description as string | undefined,
          startTime: wire.startTime as number,
          endTime: wire.endTime as number | null,
          agents: (wire.agents as TaskSessionData["agents"]) ?? [],
          events: (wire.events as TaskSessionData["events"]) ?? [],
          annotations: (wire.annotations as TaskSessionData["annotations"]) ?? [],
          agentConfigs: (wire.agentConfigs as TaskSessionData["agentConfigs"]) ?? {},
          agentTelemetry: (wire.agentTelemetry as TaskSessionData["agentTelemetry"]) ?? {},
          metrics: (wire.metrics as TaskSessionData["metrics"]) ?? {
            avgLatency: "N/A",
            totalTokens: 0,
            bottleneckCount: 0,
          },
          chatMessages: (wire.chatMessages as TaskSessionData["chatMessages"]) ?? [],
        },
        maxTime: (wire.maxTime as number) ?? 250,
      })),
      list: raw.list ?? [],
    };
  } catch (err) {
    console.error("[monitor] fetch error:", err);
    return null;
  }
}

async function doFetchMissions(client: GatewayClient): Promise<MissionSummary[]> {
  try {
    const raw = (await client.request("monitor.missions.list")) as {
      missions?: MissionSummary[];
    };
    return raw?.missions ?? [];
  } catch {
    return [];
  }
}

async function doFetchMission(
  client: GatewayClient,
  missionId: string,
): Promise<SessionEntry | null> {
  try {
    const wire = (await client.request("monitor.mission", { missionId })) as Record<
      string,
      unknown
    > | null;
    if (!wire) {
      return null;
    }
    return {
      session: {
        id: wire.id as string,
        name: wire.name as string,
        description: wire.description as string | undefined,
        startTime: wire.startTime as number,
        endTime: wire.endTime as number | null,
        agents: (wire.agents as TaskSessionData["agents"]) ?? [],
        events: (wire.events as TaskSessionData["events"]) ?? [],
        annotations: (wire.annotations as TaskSessionData["annotations"]) ?? [],
        agentConfigs: (wire.agentConfigs as TaskSessionData["agentConfigs"]) ?? {},
        agentTelemetry: (wire.agentTelemetry as TaskSessionData["agentTelemetry"]) ?? {},
        metrics: (wire.metrics as TaskSessionData["metrics"]) ?? {
          avgLatency: "N/A",
          totalTokens: 0,
          bottleneckCount: 0,
        },
        chatMessages: (wire.chatMessages as TaskSessionData["chatMessages"]) ?? [],
      },
      maxTime: (wire.maxTime as number) ?? 250,
    };
  } catch (err) {
    console.error("[monitor] fetch mission error:", err);
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────

type ViewMode = "sessions" | "missions";

export function MonitorApp({ isDark, client }: MonitorAppProps) {
  const resolvedClient =
    client ??
    ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);

  const [viewMode, setViewMode] = useState<ViewMode>("missions");
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([mockEntry]);
  const [summaries, setSummaries] = useState<SessionSummary[]>(mockSummaries);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(mockTaskSession.id);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Mission state
  const [missionSummaries, setMissionSummaries] = useState<MissionSummary[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [missionEntry, setMissionEntry] = useState<SessionEntry | null>(null);
  const [missionsLoaded, setMissionsLoaded] = useState(false);

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // ── Read mission ID from URL query param on mount ──
  // company-monitor.ts forces fresh mount when ?mission= is present,
  // so this useEffect([]) always fires with the correct URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mission = params.get("mission");
    if (mission) {
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("mission");
      window.history.replaceState({}, "", url.toString());

      setViewMode("missions");
      setSelectedMissionId(mission);
      setMissionsLoaded(false);
    }
  }, []);

  // ── Load sessions ──
  useEffect(() => {
    if (dataLoaded) {
      return;
    }
    const tryLoad = async () => {
      const c =
        resolvedClient ??
        ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);
      if (!c) {
        return false;
      }
      const result = await doFetchSessions(c);
      if (result && result.sessions.length > 0) {
        setSessionEntries(result.sessions);
        setSummaries(result.list);
        setSelectedSessionId(result.sessions[0].session.id);
        setDataLoaded(true);
        return true;
      }
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

  // ── Load missions list ──
  useEffect(() => {
    if (viewMode !== "missions" || missionsLoaded) {
      return;
    }
    const c =
      resolvedClient ??
      ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);
    if (!c) {
      return;
    }
    void doFetchMissions(c).then((missions) => {
      setMissionSummaries(missions);
      setMissionsLoaded(true);
      if (missions.length > 0) {
        setSelectedMissionId((prev) => prev ?? missions[0].missionId);
      }
    });
  }, [viewMode, missionsLoaded, resolvedClient]);

  // ── Load mission data ──
  const fetchMissionRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewMode !== "missions" || !selectedMissionId) {
      return;
    }

    const fetchId = selectedMissionId;
    fetchMissionRef.current = fetchId;
    let cancelled = false;

    const attempt = () => {
      if (cancelled) {
        return;
      }
      const c =
        resolvedClient ??
        ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);
      if (!c) {
        setTimeout(attempt, 500);
        return;
      }
      void doFetchMission(c, fetchId).then((entry) => {
        if (cancelled || fetchMissionRef.current !== fetchId) {
          return;
        }
        if (entry) {
          setMissionEntry(entry);
          setCurrentTime(0);
          setIsPlaying(true);
          setSelectedAgentId(entry.session.agents[0]?.id ?? null);
          setHoveredAgentId(null);
        } else {
          setMissionEntry(createUnavailableMissionEntry(fetchId));
          setIsPlaying(false);
        }
      });
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [viewMode, selectedMissionId, resolvedClient]);

  // ── Handlers ──
  const handleMissionChange = useCallback((missionId: string) => {
    setSelectedMissionId(missionId);
    setMissionEntry(null);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setCurrentTime(0);
    setIsPlaying(true);
    setSelectedAgentId(null);
    setHoveredAgentId(null);
  }, []);

  // ── Current entry ──
  const currentEntry = useMemo(() => {
    if (viewMode === "missions") {
      if (missionEntry) {
        return missionEntry;
      }
      if (missionsLoaded && missionSummaries.length === 0 && !selectedMissionId) {
        return emptyMissionEntry;
      }
      return loadingEntry;
    }
    return (
      sessionEntries.find((e) => e.session.id === selectedSessionId) ??
      sessionEntries[0] ??
      mockEntry
    );
  }, [
    viewMode,
    missionEntry,
    selectedMissionId,
    missionsLoaded,
    missionSummaries.length,
    sessionEntries,
    selectedSessionId,
  ]);

  const session = currentEntry.session;
  const MAX_TIME = currentEntry.maxTime;

  // ── Reset on mission/session change ──
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(true);
    setSelectedAgentId(session.agents[0]?.id ?? null);
    setHoveredAgentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, selectedMissionId, session.id]);

  // ── Playback timer ──
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
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      missionSummaries={missionSummaries}
      selectedMissionId={selectedMissionId}
      onMissionChange={handleMissionChange}
      {...derivedState}
    />
  );
}
