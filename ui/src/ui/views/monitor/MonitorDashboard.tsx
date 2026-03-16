import {
  Play,
  Pause,
  SkipForward,
  Sparkles,
  ZoomIn,
  ZoomOut,
  GripHorizontal,
  GripVertical,
} from "lucide-react";
import React, { useRef, useState, useEffect, useCallback, UIEvent, MouseEvent } from "react";
import { MonitorBottomPanel } from "./MonitorBottomPanel";
import { MonitorRightPanel } from "./MonitorRightPanel";
import { MonitorTimeline } from "./MonitorTimeline";
import type {
  Agent,
  LifecycleEvent,
  ActivityWindow,
  LineageEdge,
  AgentSnapshot,
  TaskSessionData,
  MissionSummary,
} from "./types";

interface DashboardProps {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  hoveredAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  agents: Agent[];
  events: LifecycleEvent[];
  snapshots: AgentSnapshot[];
  activityWindows: ActivityWindow[];
  lineageEdges: LineageEdge[];
  maxTime: number;
  isDark: boolean;
  taskSession: TaskSessionData;
  availableTaskSessions: Pick<TaskSessionData, "id" | "name" | "startTime" | "endTime">[];
  onSessionChange: (id: string) => void;
  viewMode: "sessions" | "missions";
  onViewModeChange: (mode: "sessions" | "missions") => void;
  missionSummaries: MissionSummary[];
  selectedMissionId: string | null;
  onMissionChange: (id: string) => void;
}

// ── Resize constants ────────────────────────────────────────────────────
const LEFT_DEFAULT = 256;
const LEFT_MIN = 120;
const RIGHT_DEFAULT = 420;
const RIGHT_MIN = 200;
const BOTTOM_DEFAULT = 280;
const BOTTOM_MIN = 100;

// ── Resize hook ─────────────────────────────────────────────────────────
type Axis = "x" | "y";

function useResizable(
  axis: Axis,
  defaultSize: number,
  minSize: number,
  invert = false, // true for right panel (dragging left increases size)
) {
  const [size, setSize] = useState(defaultSize);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = axis === "x" ? e.clientX : e.clientY;
      startSize.current = size;
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: globalThis.MouseEvent) => {
        if (!dragging.current) {
          return;
        }
        const pos = axis === "x" ? ev.clientX : ev.clientY;
        const delta = invert ? startPos.current - pos : pos - startPos.current;
        const next = startSize.current + delta;
        if (next < minSize) {
          setSize(0);
          setCollapsed(true);
        } else {
          setSize(next);
          setCollapsed(false);
        }
      };

      const onUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [axis, invert, minSize, size],
  );

  const toggle = useCallback(() => {
    if (collapsed) {
      setSize(defaultSize);
      setCollapsed(false);
    } else {
      setSize(0);
      setCollapsed(true);
    }
  }, [collapsed, defaultSize]);

  return { size: collapsed ? 0 : size, collapsed, onMouseDown, toggle };
}

// ── Resize handle component ────────────────────────────────────────────
function ResizeHandle({
  axis,
  onMouseDown,
}: {
  axis: Axis;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group flex-shrink-0"
      style={{
        [axis === "x" ? "width" : "height"]: 5,
        cursor: axis === "x" ? "col-resize" : "row-resize",
        position: "relative",
        zIndex: 30,
        ...(axis === "x"
          ? { marginLeft: -2, marginRight: -3 }
          : { marginTop: -2, marginBottom: -3 }),
      }}
    >
      <div
        className="transition-colors duration-150"
        style={{
          position: "absolute",
          ...(axis === "x"
            ? {
                top: 0,
                bottom: 0,
                left: 2,
                width: 1,
                background: "var(--monitor-resize-idle, rgba(63,63,70,0.5))",
              }
            : {
                left: 0,
                right: 0,
                top: 2,
                height: 1,
                background: "var(--monitor-resize-idle, rgba(63,63,70,0.5))",
              }),
        }}
      />
      <style>{`
        .group:hover > div { background: rgba(16,185,129,0.6) !important; }
        .group:active > div { background: rgba(16,185,129,0.9) !important; }
      `}</style>
    </div>
  );
}

// ── Time formatting ─────────────────────────────────────────────────────
type TimeUnit = "s" | "min";

function formatTimeCompact(seconds: number, unit: TimeUnit): string {
  if (unit === "min") {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${seconds}s`;
}

// ── Main dashboard ──────────────────────────────────────────────────────
export function MonitorDashboard(props: DashboardProps) {
  const { currentTime, setCurrentTime, isPlaying, setIsPlaying, agents, snapshots, maxTime } =
    props;
  const hasSelectedMissionOption =
    props.selectedMissionId != null &&
    props.missionSummaries.some((mission) => mission.missionId === props.selectedMissionId);

  const leftHeadersRef = useRef<HTMLDivElement>(null);
  const topAxisRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const hasAutoFaded = useRef(false);
  const [timeScale, setTimeScale] = useState(4);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(maxTime > 300 ? "min" : "s");

  // Reset activity selection when mission/session changes (use stable ID, not object ref)
  useEffect(() => {
    setSelectedActivityId(null);
    hasAutoFaded.current = false;
  }, [props.taskSession.id]);

  // Adjust time scale/unit when maxTime changes
  useEffect(() => {
    setTimeScale(maxTime > 300 ? 2 : 6);
    setTimeUnit(maxTime > 300 ? "min" : "s");
  }, [maxTime]);

  // Resizable panels
  const left = useResizable("x", LEFT_DEFAULT, LEFT_MIN);
  const right = useResizable("x", RIGHT_DEFAULT, RIGHT_MIN, true);
  const bottom = useResizable("y", BOTTOM_DEFAULT, BOTTOM_MIN, true);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (currentTime >= maxTime && showAnnotations && !hasAutoFaded.current) {
      timeout = setTimeout(() => {
        setShowAnnotations(false);
        hasAutoFaded.current = true;
      }, 10000);
    }
    if (currentTime === 0) {
      hasAutoFaded.current = false;
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [currentTime, maxTime, showAnnotations]);

  const handleAxisClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!topAxisRef.current) {
      return;
    }
    const rect = topAxisRef.current.getBoundingClientRect();
    const scrollLeft = topAxisRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 16;
    setIsPlaying(false);
    setCurrentTime(Math.max(0, Math.min(maxTime, Math.round(x / timeScale))));
  };

  const handleTimelineScroll = (e: UIEvent<HTMLDivElement>) => {
    if (leftHeadersRef.current) {
      leftHeadersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (topAxisRef.current) {
      topAxisRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const activeCount = snapshots.filter((s) => s.currentStatus === "running").length;
  const errorCount = snapshots.filter((s) => s.currentStatus === "error").length;

  // Whether bottom panel has content to show
  const hasBottomContent = !!(props.selectedAgentId || selectedActivityId);
  console.log(
    "[dashboard] hasBottomContent:",
    hasBottomContent,
    "agentId:",
    props.selectedAgentId,
    "activityId:",
    selectedActivityId,
    "bottom.collapsed:",
    bottom.collapsed,
    "bottom.size:",
    bottom.size,
  );

  return (
    <div className="flex h-full w-full bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden selection:bg-emerald-500/30">
      {/* ── Left + Middle + Bottom column ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ── Top Bar ── */}
        <div
          className="flex h-10 border-b flex-shrink-0 items-center px-3 gap-1.5"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          {/* View mode toggle — matches topbar-theme-mode pill style */}
          <div className="topbar-theme-mode" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => props.onViewModeChange("sessions")}
              className={`topbar-theme-mode__btn ${props.viewMode === "sessions" ? "topbar-theme-mode__btn--active" : ""}`}
              title="Sessions"
              aria-label="View mode: Sessions"
              aria-pressed={props.viewMode === "sessions"}
              style={{ width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600 }}
            >
              Sessions
            </button>
            <button
              type="button"
              onClick={() => props.onViewModeChange("missions")}
              className={`topbar-theme-mode__btn ${props.viewMode === "missions" ? "topbar-theme-mode__btn--active" : ""}`}
              title="Missions"
              aria-label="View mode: Missions"
              aria-pressed={props.viewMode === "missions"}
              style={{ width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600 }}
            >
              Missions
            </button>
          </div>
          {/* Session/Mission picker */}
          {props.viewMode === "sessions" ? (
            <select
              value={props.availableTaskSessions.length > 0 ? props.taskSession.id : ""}
              onChange={(e) => props.onSessionChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-zinc-200 border border-zinc-700/50 rounded px-2 py-1 outline-none cursor-pointer hover:border-zinc-500 transition-colors"
              style={{ maxWidth: 240, fontFamily: "var(--mono)" }}
              title="Select task session"
            >
              {props.availableTaskSessions.length === 0 ? (
                <option value="" disabled style={{ background: "var(--card, #161920)" }}>
                  No sessions yet
                </option>
              ) : (
                props.availableTaskSessions.map((s) => (
                  <option key={s.id} value={s.id} style={{ background: "var(--card, #161920)" }}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          ) : (
            <select
              value={props.selectedMissionId ?? ""}
              onChange={(e) => props.onMissionChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-zinc-200 border border-zinc-700/50 rounded px-2 py-1 outline-none cursor-pointer hover:border-zinc-500 transition-colors"
              style={{ maxWidth: 340, fontFamily: "var(--mono)" }}
              title="Select mission"
            >
              {!hasSelectedMissionOption && props.selectedMissionId && (
                <option
                  value={props.selectedMissionId}
                  style={{ background: "var(--card, #161920)" }}
                >
                  {props.selectedMissionId} - Loading...
                </option>
              )}
              {props.missionSummaries.map((m) => (
                <option
                  key={m.missionId}
                  value={m.missionId}
                  style={{ background: "var(--card, #161920)" }}
                >
                  {m.missionId} — {m.title.slice(0, 30)}
                  {m.title.length > 30 ? "…" : ""} ({m.taskCount} tasks)
                </option>
              ))}
              {props.missionSummaries.length === 0 && (
                <option value="" disabled style={{ background: "var(--card, #161920)" }}>
                  No missions yet
                </option>
              )}
            </select>
          )}
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          {/* Playback controls */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="btn btn--sm"
            style={{ padding: "4px 6px", borderRadius: "var(--radius-full)" }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentTime(maxTime);
            }}
            className="btn btn--sm"
            style={{ padding: "4px 6px", borderRadius: "var(--radius-full)" }}
            title="Skip to End"
          >
            <SkipForward size={12} />
          </button>
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className={`btn btn--sm ${showAnnotations ? "active" : ""}`}
            style={{ padding: "3px 8px", fontSize: 11 }}
            title="Toggle Insights"
          >
            <Sparkles size={11} />
            <span>Insights</span>
          </button>
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          <button
            onClick={() =>
              setTimeScale(Math.max(0.5, timeScale <= 2 ? timeScale - 0.5 : timeScale - 2))
            }
            className="btn btn--sm"
            style={{ padding: "3px 5px" }}
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--muted)",
              width: 20,
              textAlign: "center",
            }}
          >
            {timeScale}x
          </span>
          <button
            onClick={() =>
              setTimeScale(Math.min(32, timeScale < 2 ? timeScale + 0.5 : timeScale + 2))
            }
            className="btn btn--sm"
            style={{ padding: "3px 5px" }}
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Active
          </span>
          <span
            style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)", lineHeight: 1 }}
          >
            {activeCount}
          </span>
          {errorCount > 0 && (
            <span
              style={{ fontSize: 11, color: "var(--destructive)", fontWeight: 500, lineHeight: 1 }}
            >
              {errorCount} err
            </span>
          )}
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          {/* Time unit toggle */}
          <button
            onClick={() => setTimeUnit(timeUnit === "s" ? "min" : "s")}
            className="btn btn--sm"
            style={{ padding: "3px 6px", fontSize: 10, fontFamily: "var(--mono)" }}
            title={`Switch to ${timeUnit === "s" ? "minutes" : "seconds"}`}
          >
            {timeUnit === "s" ? "sec" : "min"}
          </button>
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          {/* Scrubber */}
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)" }}>
            {formatTimeCompact(currentTime, timeUnit)}
          </span>
          <input
            type="range"
            min="0"
            max={maxTime}
            value={currentTime}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentTime(Number(e.target.value));
            }}
            style={{
              flex: 1,
              minWidth: 60,
              maxWidth: 200,
              height: 3,
              accentColor: "var(--ok)",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)" }}>
            {formatTimeCompact(maxTime, timeUnit)}
          </span>
        </div>

        {/* ── Time Axis ── */}
        <div className="flex h-6 border-b border-zinc-800/50 bg-[#0a0a0a] flex-shrink-0">
          {/* Spacer matching left panel width */}
          {!left.collapsed && (
            <div
              className="flex-shrink-0 border-r border-zinc-800/50"
              style={{ width: left.size }}
            />
          )}
          {/* Scrollable axis */}
          <div
            className="flex-1 overflow-hidden relative cursor-pointer hover:bg-zinc-800/10 transition-colors"
            ref={topAxisRef}
            onClick={handleAxisClick}
          >
            <div
              className="absolute inset-0 flex items-end pb-1 px-4"
              style={{ width: maxTime * timeScale + 32 }}
            >
              {(() => {
                // Choose tick interval based on time unit and total duration
                const tickInterval =
                  timeUnit === "min"
                    ? maxTime > 600
                      ? 60
                      : 30 // every 60s or 30s in min mode
                    : maxTime > 120
                      ? 10
                      : 5; // every 10s or 5s in sec mode
                const tickCount = Math.floor(maxTime / tickInterval) + 1;
                return Array.from({ length: tickCount }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute flex flex-col items-center"
                    style={{ left: i * tickInterval * timeScale + 16 }}
                  >
                    <span className="text-[9px] font-mono text-zinc-500">
                      {formatTimeCompact(i * tickInterval, timeUnit)}
                    </span>
                    <div className="w-px h-1.5 bg-zinc-700" />
                  </div>
                ));
              })()}
              <div
                className="absolute bottom-0 w-px h-3 bg-emerald-500 z-20 transition-all duration-100"
                style={{ left: currentTime * timeScale + 16 }}
              >
                <div className="absolute -top-3.5 -translate-x-1/2 bg-emerald-500 text-[#0a0a0a] text-[8px] font-bold px-0.5 rounded-sm whitespace-nowrap">
                  {formatTimeCompact(currentTime, timeUnit)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main body (timeline + bottom) ── */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Timeline row */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative bg-[#0a0a0a]">
            {/* Left collapsed grip */}
            {left.collapsed && (
              <div
                onClick={left.toggle}
                className="flex-shrink-0 border-r border-zinc-800/50 bg-[#0f0f0f] hover:bg-zinc-800/40 transition-colors cursor-col-resize flex items-center justify-center px-0.5"
                title="Drag or click to expand agents"
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const onMove = (ev: globalThis.MouseEvent) => {
                    if (ev.clientX - startX > 20) {
                      left.toggle();
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    }
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              >
                <GripVertical size={14} className="text-zinc-500" />
              </div>
            )}
            {/* Left agent headers */}
            {!left.collapsed && (
              <>
                <div
                  className="flex-shrink-0 border-r border-zinc-800/50 overflow-hidden bg-[#0f0f0f] z-10"
                  style={{ width: left.size }}
                  ref={leftHeadersRef}
                  onClick={() => {
                    props.setSelectedAgentId(null);
                    props.setHoveredAgentId(null);
                    setSelectedActivityId(null);
                  }}
                >
                  <div className="relative" style={{ height: agents.length * 64 + 32 + 24 }}>
                    {agents.map((agent, index) => {
                      const snap = snapshots.find((s) => s.id === agent.id);
                      const isSelected = props.selectedAgentId === agent.id;
                      const isHovered = props.hoveredAgentId === agent.id;
                      return (
                        <div
                          key={agent.id}
                          className={`absolute left-0 right-0 px-3 flex items-center justify-between cursor-pointer transition-colors border-l-2 ${isSelected ? "bg-zinc-800/50 border-emerald-500" : isHovered ? "bg-zinc-800/30 border-zinc-600" : "border-transparent hover:bg-zinc-800/20"}`}
                          style={{ top: 16 + index * 64, height: 64 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log("[dashboard] agent click:", agent.id, agent.name);
                            props.setSelectedAgentId(agent.id);
                            setSelectedActivityId(null);
                            const agentWindows = props.activityWindows
                              .filter((w: ActivityWindow) => w.agentId === agent.id)
                              .toSorted(
                                (a: ActivityWindow, b: ActivityWindow) => b.startTime - a.startTime,
                              );
                            const latestWindow = agentWindows[0];
                            if (latestWindow && timelineRef.current) {
                              const windowX = latestWindow.startTime * timeScale;
                              timelineRef.current.scrollTo({
                                left: Math.max(0, windowX - 100),
                                behavior: "smooth",
                              });
                            }
                          }}
                          onMouseEnter={() => props.setHoveredAgentId(agent.id)}
                          onMouseLeave={() => props.setHoveredAgentId(null)}
                        >
                          <div className="flex flex-col overflow-hidden min-w-0">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-sm font-medium text-zinc-200 truncate">
                                {agent.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-zinc-500 font-mono truncate">
                                {agent.role}
                              </span>
                              {left.size > 160 && (
                                <span
                                  className={`text-[9px] px-1 rounded-sm border ${agent.lifecycle === "persistent" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : agent.lifecycle === "ephemeral" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" : "text-indigo-400 border-indigo-400/30 bg-indigo-400/10"}`}
                                >
                                  {agent.lifecycle.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${snap?.currentStatus === "running" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : snap?.currentStatus === "paused" ? "bg-amber-500" : snap?.currentStatus === "error" ? "bg-rose-500" : snap?.currentStatus === "waiting" ? "bg-blue-500" : "bg-zinc-700"}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <ResizeHandle axis="x" onMouseDown={left.onMouseDown} />
              </>
            )}

            {/* Timeline */}
            <div
              className="flex-1 overflow-auto relative min-w-0"
              ref={timelineRef}
              onScroll={handleTimelineScroll}
              onClick={() => {
                props.setSelectedAgentId(null);
                props.setHoveredAgentId(null);
                setSelectedActivityId(null);
              }}
            >
              <div
                className="relative"
                style={{ width: maxTime * timeScale + 32, height: agents.length * 64 + 32 }}
              >
                <MonitorTimeline
                  {...props}
                  showAnnotations={showAnnotations}
                  annotations={props.taskSession.annotations}
                  timeScale={timeScale}
                  selectedActivityId={selectedActivityId}
                  onActivityClick={(activityId, agentId) => {
                    console.log("[dashboard] activity click:", activityId, "agent:", agentId);
                    setSelectedActivityId(activityId);
                    props.setSelectedAgentId(agentId);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Bottom resize + panel */}
          {hasBottomContent && !bottom.collapsed && (
            <>
              <ResizeHandle axis="y" onMouseDown={bottom.onMouseDown} />
              <div style={{ height: bottom.size, flexShrink: 0 }} className="min-h-0">
                <MonitorBottomPanel
                  selectedAgentId={props.selectedAgentId}
                  selectedActivityId={selectedActivityId}
                  agents={agents}
                  snapshots={snapshots}
                  events={props.events}
                  activityWindows={props.activityWindows}
                  currentTime={currentTime}
                  onClose={() => {
                    props.setSelectedAgentId(null);
                    setSelectedActivityId(null);
                  }}
                  taskSession={props.taskSession}
                />
              </div>
            </>
          )}
          {hasBottomContent && bottom.collapsed && (
            <div
              onClick={bottom.toggle}
              className="flex-shrink-0 border-t border-zinc-800/50 bg-[#0f0f0f] hover:bg-zinc-800/40 transition-colors cursor-row-resize flex items-center justify-center py-1"
              title="Drag or click to expand details"
              onMouseDown={(e) => {
                // Allow drag-to-expand: treat this bar as a resize handle
                const startY = e.clientY;
                const onMove = (ev: globalThis.MouseEvent) => {
                  const delta = startY - ev.clientY;
                  if (delta > 20) {
                    bottom.toggle();
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  }
                };
                const onUp = () => {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            >
              <GripHorizontal size={16} className="text-zinc-500 hover:text-zinc-300" />
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      {right.collapsed && (
        <div
          onClick={right.toggle}
          className="flex-shrink-0 border-l border-zinc-800/50 bg-[#0f0f0f] hover:bg-zinc-800/40 transition-colors cursor-col-resize flex items-center justify-center px-0.5"
          title="Drag or click to expand overview"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const onMove = (ev: globalThis.MouseEvent) => {
              if (startX - ev.clientX > 20) {
                right.toggle();
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              }
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          <GripVertical size={14} className="text-zinc-500" />
        </div>
      )}
      {!right.collapsed && (
        <>
          <ResizeHandle axis="x" onMouseDown={right.onMouseDown} />
          <div
            style={{ width: right.size, flexShrink: 0 }}
            className="min-w-0 overflow-hidden flex flex-col"
          >
            <MonitorRightPanel
              agents={agents}
              snapshots={snapshots}
              selectedAgentId={props.selectedAgentId}
              setSelectedAgentId={props.setSelectedAgentId}
              events={props.events}
              currentTime={currentTime}
              maxTime={maxTime}
              taskSession={props.taskSession}
            />
          </div>
        </>
      )}
    </div>
  );
}
