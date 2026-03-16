import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./monitor.css";
import { deriveState } from "./derivation";
import { MonitorDashboard } from "./MonitorDashboard";
import type { TaskSessionData, MissionSummary } from "./types";

export interface MonitorAppProps {
  isDark: boolean;
  client?: { request(method: string, params?: Record<string, unknown>): Promise<unknown> } | null;
  pendingMissionId?: string | null;
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

const EMPTY_TASK_SESSION: TaskSessionData = {
  id: "empty",
  name: "",
  description: undefined,
  startTime: 0,
  endTime: null,
  agents: [],
  events: [],
  annotations: [],
  agentConfigs: {},
  agentTelemetry: {},
  metrics: { avgLatency: "–", totalTokens: 0, bottleneckCount: 0 },
  chatMessages: [],
};

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
    const sessions = (raw?.sessions ?? []).map((wire) => ({
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
    }));
    return {
      sessions,
      list: raw?.list ?? [],
    };
  } catch (err) {
    console.error("[monitor] fetch error:", err);
    return null;
  }
}

type ViewMode = "sessions" | "missions";

type GatewayClient = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

async function doFetchMissions(client: GatewayClient): Promise<MissionSummary[]> {
  try {
    const raw = (await client.request("monitor.missions.list")) as { missions?: MissionSummary[] };
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

export function MonitorApp(props: MonitorAppProps) {
  const { isDark, client } = props;
  // Also check window global for cross-framework client
  const resolvedClient =
    client ??
    ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);

  const [viewMode, setViewMode] = useState<ViewMode>("missions");
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Mission state
  const [missionSummaries, setMissionSummaries] = useState<MissionSummary[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [missionEntry, setMissionEntry] = useState<SessionEntry | null>(null);
  const [missionsLoaded, setMissionsLoaded] = useState(false);

  // Pick up pending mission navigation from company-tasks (via prop).
  // No dedup ref needed — company-monitor uses a unique React key per navigation,
  // so this component is always a fresh instance when pendingMissionId is set.
  useEffect(() => {
    if (props.pendingMissionId) {
      setViewMode("missions");
      setSelectedMissionId(props.pendingMissionId);
      setMissionsLoaded(false);
    }
  }, []);

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
      const result = await doFetchSessions(c);
      if (!result) {
        return false;
      }
      setSessionsLoaded(true);
      setSessionEntries(result.sessions);
      setSummaries(result.list);
      if (result.sessions.length > 0) {
        setSelectedSessionId((prev) => prev ?? result.sessions[0].session.id);
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

  useEffect(() => {
    if (sessionEntries.length === 0) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      return;
    }
    if (
      !selectedSessionId ||
      !sessionEntries.some((entry) => entry.session.id === selectedSessionId)
    ) {
      setSelectedSessionId(sessionEntries[0].session.id);
    }
  }, [sessionEntries, selectedSessionId]);

  // Load missions when switching to mission mode
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
        setSelectedMissionId((prev) => {
          const next = prev ?? missions[0].missionId;
          return next;
        });
      }
    });
  }, [viewMode, missionsLoaded, resolvedClient]);

  // Load mission data when selection changes
  useEffect(() => {
    if (viewMode !== "missions" || !selectedMissionId) {
      return;
    }
    const c =
      resolvedClient ??
      ((window as Record<string, unknown>).__openclawMonitorClient as MonitorAppProps["client"]);
    if (!c) {
      return;
    }
    void doFetchMission(c, selectedMissionId).then((entry) => {
      if (entry) {
        setMissionEntry(entry);
        setCurrentTime(0);
        setIsPlaying(true);
        setSelectedAgentId(null);
        setHoveredAgentId(null);
      }
    });
  }, [viewMode, selectedMissionId, resolvedClient]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setCurrentTime(0);
    setIsPlaying(true);
    setSelectedAgentId(null);
    setHoveredAgentId(null);
  }, []);

  // Current session (session mode or mission mode)
  const baseEntry = useMemo(() => {
    if (viewMode === "missions") {
      return missionEntry;
    }
    if (sessionEntries.length === 0) {
      return null;
    }
    if (selectedSessionId) {
      return (
        sessionEntries.find((entry) => entry.session.id === selectedSessionId) ?? sessionEntries[0]
      );
    }
    return sessionEntries[0];
  }, [viewMode, missionEntry, sessionEntries, selectedSessionId]);

  const activeEntry = baseEntry ?? null;
  const session = activeEntry?.session ?? null;
  const MAX_TIME = session ? activeEntry.maxTime : 1;
  const safeSession = session ?? EMPTY_TASK_SESSION;

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Reset playback when session or mission changes
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(true);
    setSelectedAgentId(null);
    setHoveredAgentId(null);
  }, [selectedSessionId, selectedMissionId]);

  useEffect(() => {
    if (!session) {
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [session]);

  useEffect(() => {
    if (!isPlaying || !session || MAX_TIME <= 0) {
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
  }, [isPlaying, MAX_TIME, session]);

  const derivedState = useMemo(() => {
    if (!session) {
      return { snapshots: [], activityWindows: [], lineageEdges: [] };
    }
    return deriveState(session.agents, session.events, currentTime);
  }, [session, currentTime]);

  const showEmptyHint =
    viewMode === "missions"
      ? missionsLoaded && !baseEntry
      : sessionsLoaded && sessionEntries.length === 0;
  const emptyTitle = viewMode === "missions" ? "No missions yet" : "No sessions yet";
  const emptyHintMessage =
    viewMode === "missions" ? (
      <>
        Missions will appear after orchestrations emit delegation plans. Send a task from Company
        Tasks or trigger <code>openclaw clawdock orchestrate</code> to capture one.
      </>
    ) : (
      <>
        Run <code>openclaw clawdock orchestrate</code> or send a message in Talk to Company to start
        a session.
      </>
    );

  return (
    <div className="monitor-shell">
      <MonitorDashboard
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        selectedAgentId={selectedAgentId}
        setSelectedAgentId={setSelectedAgentId}
        hoveredAgentId={hoveredAgentId}
        setHoveredAgentId={setHoveredAgentId}
        agents={safeSession.agents}
        events={safeSession.events}
        maxTime={MAX_TIME}
        isDark={isDark}
        taskSession={safeSession}
        availableTaskSessions={summaries}
        onSessionChange={setSelectedSessionId}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        missionSummaries={missionSummaries}
        selectedMissionId={selectedMissionId}
        onMissionChange={setSelectedMissionId}
        {...derivedState}
      />
      {showEmptyHint && (
        <div className="monitor-empty-overlay" aria-live="polite">
          <div className="monitor-empty-card">
            <h3>{emptyTitle}</h3>
            <p>{emptyHintMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
