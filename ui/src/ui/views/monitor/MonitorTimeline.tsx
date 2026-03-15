import {
  Pause,
  AlertCircle,
  Archive,
  GitBranch,
  RotateCcw,
  Sparkles,
  Zap,
  BrainCircuit,
  ShieldAlert,
  History,
} from "lucide-react";
import React, { useState } from "react";
import { Agent, LifecycleEvent, ActivityWindow, LineageEdge, Annotation } from "./types";

interface TimelineProps {
  currentTime: number;
  agents: Agent[];
  events: LifecycleEvent[];
  activityWindows: ActivityWindow[];
  lineageEdges: LineageEdge[];
  hoveredAgentId: string | null;
  selectedAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  setSelectedAgentId: (id: string | null) => void;
  showAnnotations?: boolean;
  annotations?: Annotation[];
  timeScale?: number;
  onActivityClick?: (activityId: string, agentId: string) => void;
  selectedActivityId?: string | null;
}

const LANE_HEIGHT = 64;
const PADDING_TOP = 16;
const PADDING_LEFT = 16;

export function MonitorTimeline({
  currentTime,
  agents,
  events,
  activityWindows,
  lineageEdges,
  hoveredAgentId,
  selectedAgentId,
  setHoveredAgentId,
  setSelectedAgentId,
  showAnnotations = false,
  annotations = [],
  timeScale = 8,
  onActivityClick,
  selectedActivityId,
}: TimelineProps) {
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  const [hiddenAnnotations, setHiddenAnnotations] = useState<Set<string>>(new Set());
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const getAgentY = (agentId: string) => {
    const index = agents.findIndex((a) => a.id === agentId);
    return PADDING_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
  };
  const getX = (timestamp: number) => PADDING_LEFT + timestamp * timeScale;

  const getLineageSet = (startAgentId: string | null) => {
    const set = new Set<string>();
    if (!startAgentId) {
      return set;
    }
    set.add(startAgentId);
    lineageEdges.forEach((e) => {
      if (e.sourceId === startAgentId) {
        set.add(e.targetId);
      }
      if (e.targetId === startAgentId) {
        set.add(e.sourceId);
      }
    });
    return set;
  };
  const highlightSet = getLineageSet(hoveredAgentId || selectedAgentId);
  const hasHighlight = highlightSet.size > 0;

  const getWindowForAgentAtTime = (agentId: string, timestamp: number, isSource: boolean) => {
    let win = activityWindows.find(
      (w) =>
        w.agentId === agentId &&
        w.startTime <= timestamp &&
        (w.endTime === null || w.endTime >= timestamp),
    );
    if (win) {
      return win;
    }
    if (isSource) {
      const pastWindows = activityWindows.filter(
        (w) => w.agentId === agentId && w.startTime <= timestamp,
      );
      if (pastWindows.length > 0) {
        return pastWindows.reduce((prev, current) =>
          prev.startTime > current.startTime ? prev : current,
        );
      }
    } else {
      const futureWindows = activityWindows.filter(
        (w) => w.agentId === agentId && w.startTime >= timestamp,
      );
      if (futureWindows.length > 0) {
        return futureWindows.reduce((prev, current) =>
          prev.startTime < current.startTime ? prev : current,
        );
      }
    }
    return null;
  };

  const getConnectedWindows = (startWindowId: string | null) => {
    const set = new Set<string>();
    if (!startWindowId) {
      return set;
    }
    set.add(startWindowId);
    lineageEdges.forEach((edge) => {
      const sourceWin = getWindowForAgentAtTime(edge.sourceId, edge.timestamp, true);
      const targetWin = getWindowForAgentAtTime(edge.targetId, edge.timestamp, false);
      if (sourceWin?.id === startWindowId && targetWin) {
        set.add(targetWin.id);
      }
      if (targetWin?.id === startWindowId && sourceWin) {
        set.add(sourceWin.id);
      }
    });
    return set;
  };
  const connectedWindows = getConnectedWindows(selectedActivityId ?? null);

  return (
    <>
      {/* Background Grid Lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundSize: `${timeScale * 10}px ${LANE_HEIGHT}px`,
          backgroundPosition: `${PADDING_LEFT}px ${PADDING_TOP}px`,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)",
        }}
      />

      {/* SVG Connections */}
      <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ width: "100%", height: "100%" }}
      >
        {lineageEdges.map((edge) => {
          const y1 = getAgentY(edge.sourceId);
          const y2 = getAgentY(edge.targetId);
          const x1 = getX(edge.timestamp);
          let targetX = x1,
            sourceX = x1;
          const sourcePastWindows = activityWindows.filter(
            (w) => w.agentId === edge.sourceId && w.startTime <= edge.timestamp,
          );
          if (sourcePastWindows.length > 0) {
            const lastWindow = sourcePastWindows.reduce((prev, current) =>
              prev.startTime > current.startTime ? prev : current,
            );
            const endTime = lastWindow.endTime !== null ? lastWindow.endTime : currentTime;
            if (endTime < edge.timestamp) {
              sourceX = getX(endTime);
            }
          }
          if (["split", "handoff", "merge"].includes(edge.type)) {
            const pastEvents = events
              .filter((e) => e.agentId === edge.targetId && e.timestamp <= edge.timestamp)
              .toSorted((a, b) => b.timestamp - a.timestamp);
            const lastStateEvent = pastEvents.find((e) =>
              ["spawn", "start", "resume", "pause", "error", "archive"].includes(e.type),
            );
            const isActive =
              lastStateEvent &&
              (lastStateEvent.type === "start" || lastStateEvent.type === "resume");
            if (!isActive) {
              const nextStartEvent = events.find(
                (e) =>
                  e.agentId === edge.targetId &&
                  (e.type === "start" || e.type === "resume") &&
                  e.timestamp >= edge.timestamp,
              );
              if (nextStartEvent) {
                targetX = getX(nextStartEvent.timestamp);
              }
            }
          }
          const currentX = getX(currentTime);
          const drawX2 = Math.min(targetX, currentX);
          const isHighlighted = hasHighlight
            ? highlightSet.has(edge.sourceId) && highlightSet.has(edge.targetId)
            : true;
          let opacity = hasHighlight ? (isHighlighted ? 1 : 0.1) : 0.4;
          let strokeWidth = isHighlighted ? 2 : 1;
          if (selectedActivityId) {
            const sourceWin = getWindowForAgentAtTime(edge.sourceId, edge.timestamp, true);
            const targetWin = getWindowForAgentAtTime(edge.targetId, edge.timestamp, false);
            const isConnectedToSelected =
              sourceWin?.id === selectedActivityId || targetWin?.id === selectedActivityId;
            opacity = isConnectedToSelected ? 1 : 0.1;
            strokeWidth = isConnectedToSelected ? 2 : 1;
          }
          const strokeColor = edge.type === "handoff" ? "#3b82f6" : "#52525b";
          const isDown = y2 > y1;
          const hasDelay = sourceX < x1;
          const delayPathD = hasDelay ? `M ${sourceX} ${y1} L ${x1} ${y1}` : "";
          let mainPathD = `M ${x1} ${y1}`;
          let arrowPoints = "";
          if (targetX > x1) {
            if (drawX2 > x1) {
              const lineEndX = Math.max(x1, drawX2 - 6);
              mainPathD += ` L ${x1} ${y2} L ${lineEndX} ${y2}`;
              arrowPoints = `${drawX2 - 6},${y2 - 4} ${drawX2},${y2} ${drawX2 - 6},${y2 + 4}`;
            } else {
              mainPathD += ` L ${x1} ${y2}`;
            }
          } else {
            if (isDown) {
              mainPathD += ` L ${x1} ${y2 - 6}`;
              arrowPoints = `${x1 - 4},${y2 - 6} ${x1 + 4},${y2 - 6} ${x1},${y2}`;
            } else {
              mainPathD += ` L ${x1} ${y2 + 6}`;
              arrowPoints = `${x1 - 4},${y2 + 6} ${x1 + 4},${y2 + 6} ${x1},${y2}`;
            }
          }
          return (
            <g key={edge.id} style={{ opacity, transition: "opacity 0.2s ease" }}>
              {hasDelay && (
                <path
                  d={delayPathD}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray="4 4"
                  fill="none"
                  opacity={0.5}
                />
              )}
              <path
                d={mainPathD}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={edge.type === "handoff" ? "4 4" : "none"}
                fill="none"
              />
              <circle cx={sourceX} cy={y1} r={3} fill={strokeColor} />
              {hasDelay && <circle cx={x1} cy={y1} r={2} fill={strokeColor} opacity={0.5} />}
              {arrowPoints && <polygon points={arrowPoints} fill={strokeColor} />}
            </g>
          );
        })}
      </svg>

      {/* Activity Windows */}
      {activityWindows.map((window) => {
        const agent = agents.find((a) => a.id === window.agentId);
        const lifecycle = agent?.lifecycle || "persistent";
        const y = getAgentY(window.agentId) - 10;
        const x = getX(window.startTime);
        const width =
          ((window.endTime !== null ? window.endTime : currentTime) - window.startTime) * timeScale;
        const isHighlighted = hasHighlight ? highlightSet.has(window.agentId) : true;
        let opacity = hasHighlight ? (isHighlighted ? 1 : 0.2) : 1;
        if (selectedActivityId) {
          opacity = connectedWindows.has(window.id) ? 1 : 0.1;
        }
        let colorClass = "bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/40";
        if (lifecycle === "ephemeral") {
          colorClass = "bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/40";
        } else if (lifecycle === "contract") {
          colorClass = "bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/40";
        }
        if (selectedActivityId === window.id) {
          colorClass += " ring-2 ring-white/50 z-10 shadow-[0_0_15px_rgba(255,255,255,0.2)]";
        }
        return (
          <div
            key={window.id}
            className={`absolute h-5 rounded-sm border cursor-pointer transition-all duration-200 ${colorClass}`}
            style={{ left: x, top: y, width: Math.max(width, 4), opacity }}
            onMouseEnter={() => {
              if (!selectedActivityId) {
                setHoveredAgentId(window.agentId);
              }
            }}
            onMouseLeave={() => {
              if (!selectedActivityId) {
                setHoveredAgentId(null);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onActivityClick) {
                onActivityClick(window.id, window.agentId);
              } else {
                setSelectedAgentId(window.agentId);
              }
            }}
          />
        );
      })}

      {/* Event Markers */}
      {events
        .filter((e) => e.timestamp <= currentTime)
        .map((event) => {
          const y = getAgentY(event.agentId);
          const x = getX(event.timestamp);
          const isHighlighted = hasHighlight ? highlightSet.has(event.agentId) : true;
          let opacity = hasHighlight ? (isHighlighted ? 1 : 0.2) : 1;
          if (selectedActivityId) {
            const eventWin = getWindowForAgentAtTime(event.agentId, event.timestamp, true);
            opacity = eventWin && connectedWindows.has(eventWin.id) ? 1 : 0.1;
          }
          if (["pause", "error", "archive", "backtrack", "split", "handoff"].includes(event.type)) {
            let Icon = Pause,
              colorClass = "text-amber-400 border-amber-400/50 bg-amber-950",
              label = "Paused";
            if (event.type === "error") {
              Icon = AlertCircle;
              colorClass = "text-rose-400 border-rose-400/50 bg-rose-950";
              label = "Error";
            } else if (event.type === "archive") {
              Icon = Archive;
              colorClass = "text-zinc-400 border-zinc-500/50 bg-zinc-900";
              label = "Archived";
            } else if (event.type === "backtrack") {
              Icon = RotateCcw;
              colorClass = "text-blue-400 border-blue-400/50 bg-blue-950";
              label = "Backtrack";
            } else if (event.type === "split") {
              Icon = GitBranch;
              colorClass = "text-purple-400 border-purple-400/50 bg-purple-950";
              label = "Split / Spawn";
            } else if (event.type === "handoff") {
              Icon = History;
              colorClass = "text-blue-400 border-blue-400/50 bg-blue-950";
              label = "Recall / Handoff";
            }
            const isEventHovered = hoveredEventId === event.id;
            return (
              <div
                key={event.id}
                className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border flex items-center justify-center z-40 cursor-pointer transition-opacity ${colorClass} ${isEventHovered ? "z-50 scale-110" : ""}`}
                style={{ left: x, top: y, opacity }}
                onMouseEnter={() => {
                  setHoveredAgentId(event.agentId);
                  setHoveredEventId(event.id);
                }}
                onMouseLeave={() => {
                  setHoveredAgentId(null);
                  setHoveredEventId(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAgentId(event.agentId);
                }}
              >
                <Icon size={10} strokeWidth={3} />
                {isEventHovered && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[160px] bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 shadow-xl rounded p-1.5 pointer-events-none z-50">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon size={10} className={colorClass.split(" ")[0]} />
                      <span className="text-[10px] font-semibold text-zinc-200">{label}</span>
                    </div>
                    {event.details && (
                      <p className="text-[9px] text-zinc-400 leading-tight whitespace-normal">
                        {event.details}
                      </p>
                    )}
                    {event.targetId && (
                      <p className="text-[9px] text-zinc-500 leading-tight mt-0.5">
                        Target:{" "}
                        {agents.find((a) => a.id === event.targetId)?.name || event.targetId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-px bg-emerald-500/50 pointer-events-none z-20 transition-all duration-100"
        style={{ left: getX(currentTime) }}
      />

      {/* AI Annotations */}
      {showAnnotations &&
        annotations
          .filter((a) => a.timestamp <= currentTime)
          .map((ann) => {
            const x = getX(ann.timestamp);
            const rawY = ann.agentId ? getAgentY(ann.agentId) : 40;
            const placeBelow = ann.placement === "bottom" || rawY < 60;
            const y = placeBelow ? rawY + 24 : rawY - 24;
            let Icon = Sparkles,
              colorClass = "text-indigo-400 border-indigo-500/50 bg-indigo-500/20";
            if (ann.type === "bottleneck") {
              Icon = ShieldAlert;
              colorClass = "text-rose-400 border-rose-500/50 bg-rose-500/20";
            } else if (ann.type === "decision") {
              Icon = BrainCircuit;
              colorClass = "text-amber-400 border-amber-500/50 bg-amber-500/20";
            } else if (ann.type === "dispatch") {
              Icon = Zap;
              colorClass = "text-emerald-400 border-emerald-500/50 bg-emerald-500/20";
            }
            const isHovered = hoveredAnnotation === ann.id;
            const isVisible = !hiddenAnnotations.has(ann.id);
            return (
              <div
                key={ann.id}
                className="absolute z-30"
                style={{ left: x, top: y }}
                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                onMouseLeave={() => setHoveredAnnotation(null)}
              >
                <div
                  className={`w-6 h-6 -ml-3 -mt-3 rounded-full border flex items-center justify-center cursor-pointer backdrop-blur-sm transition-transform hover:scale-110 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${colorClass} ${!isVisible ? "opacity-50" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHiddenAnnotations((prev) => {
                      const next = new Set(prev);
                      if (next.has(ann.id)) {
                        next.delete(ann.id);
                      } else {
                        next.add(ann.id);
                      }
                      return next;
                    });
                  }}
                >
                  <Icon size={12} strokeWidth={2.5} />
                </div>
                {isVisible && (
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 ${placeBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"} w-48 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 shadow-xl rounded p-2 pointer-events-none transition-all duration-200 ${isHovered ? "z-[60] scale-105" : "z-50"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className={colorClass.split(" ")[0]} />
                      <span className="text-[10px] font-semibold text-zinc-200">{ann.title}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">{ann.description}</p>
                  </div>
                )}
              </div>
            );
          })}
    </>
  );
}
