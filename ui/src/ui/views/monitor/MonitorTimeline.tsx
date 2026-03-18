import {
  Pause,
  AlertCircle,
  Archive,
  GitBranch,
  GitFork,
  GitMerge,
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
const SUBAGENT_BAR_INSET_PX = 10;

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
        {(() => {
          // SUBAGENT_BAR_INSET_PX defined at module level
          const elements: React.ReactNode[] = [];

          // Classify edges
          const splitEdges: typeof lineageEdges = [];
          const mergeEdges: typeof lineageEdges = [];
          const otherEdges: typeof lineageEdges = [];
          for (const edge of lineageEdges) {
            if (edge.type === "split") {
              splitEdges.push(edge);
            } else if (edge.type === "merge") {
              mergeEdges.push(edge);
            } else {
              otherEdges.push(edge);
            }
          }

          // ── SPLIT: group by sourceId + timestamp → one icon per batch ──
          const splitBatches = new Map<string, typeof lineageEdges>();
          for (const edge of splitEdges) {
            const key = `${edge.sourceId}@${edge.timestamp}`;
            const batch = splitBatches.get(key) || [];
            batch.push(edge);
            splitBatches.set(key, batch);
          }

          for (const [, batch] of splitBatches) {
            const sourceId = batch[0].sourceId;
            const ts = batch[0].timestamp;
            const sourceY = getAgentY(sourceId);
            // If Split & Wait, anchor lines at the pause position (bar end)
            const followingPause = events.find(
              (e) =>
                e.agentId === sourceId &&
                e.type === "pause" &&
                e.timestamp > ts &&
                e.timestamp <= ts + 2,
            );
            const anchorX = followingPause ? getX(followingPause.timestamp) : getX(ts);
            const targetYs = batch.map((e) => getAgentY(e.targetId));
            const maxY = Math.max(...targetYs);

            // Vertical trunk from source down to span all targets
            elements.push(
              <g key={`split-trunk-${sourceId}-${ts}`} style={{ opacity: 0.5 }}>
                <path
                  d={`M ${anchorX} ${sourceY} L ${anchorX} ${maxY}`}
                  stroke="#7c3aed"
                  strokeWidth={1.5}
                  fill="none"
                />
              </g>,
            );

            // Horizontal branches to each target → point at activity bar start (with visual offset)
            for (const edge of batch) {
              const targetY = getAgentY(edge.targetId);
              // Find target's start timestamp to calculate bar position
              const targetStart = events.find(
                (e) =>
                  e.agentId === edge.targetId &&
                  e.type === "start" &&
                  e.timestamp >= edge.timestamp,
              );
              const barStartX =
                (targetStart ? getX(targetStart.timestamp) : getX(edge.timestamp)) +
                SUBAGENT_BAR_INSET_PX;
              elements.push(
                <g key={edge.id} style={{ opacity: 0.5 }}>
                  <path
                    d={`M ${anchorX} ${targetY} L ${barStartX - 5} ${targetY}`}
                    stroke="#7c3aed"
                    strokeWidth={1.5}
                    fill="none"
                  />
                  <polygon
                    points={`${barStartX - 5},${targetY - 3} ${barStartX},${targetY} ${barStartX - 5},${targetY + 3}`}
                    fill="#7c3aed"
                  />
                </g>,
              );
            }

            // The combined icon is rendered via the event markers section below (skip SVG icon here)
            // We suppress individual split event icons and render one combined icon instead
          }

          // ── OTHER edges (handoff, backtrack) ──
          for (const edge of otherEdges) {
            const y1 = getAgentY(edge.sourceId);
            const y2 = getAgentY(edge.targetId);
            const x1 = getX(edge.timestamp);
            const strokeColor = edge.type === "handoff" ? "#3b82f6" : "#52525b";
            const isDown = y2 > y1;
            let pathD = `M ${x1} ${y1}`;
            if (isDown) {
              pathD += ` L ${x1} ${y2 - 6}`;
            } else {
              pathD += ` L ${x1} ${y2 + 6}`;
            }
            elements.push(
              <g key={edge.id} style={{ opacity: 0.4 }}>
                <path d={pathD} stroke={strokeColor} strokeWidth={1} fill="none" />
              </g>,
            );
          }

          // ── MERGE: render each merge individually at its own timestamp ──
          for (const edge of mergeEdges) {
            if (edge.timestamp > currentTime) {
              continue;
            }
            const targetId = edge.targetId ?? "";
            const targetY = getAgentY(targetId);
            const sourceY = getAgentY(edge.sourceId);
            const mergeX = getX(edge.timestamp);

            // Vertical line from source row to target row
            const isUp = sourceY > targetY;
            elements.push(
              <g key={edge.id} style={{ opacity: 0.35 }}>
                <path
                  d={`M ${mergeX} ${sourceY} L ${mergeX} ${targetY + (isUp ? 8 : -8)}`}
                  stroke="#52525b"
                  strokeWidth={1.5}
                  fill="none"
                />
                <polygon
                  points={
                    isUp
                      ? `${mergeX - 3.5},${targetY + 8} ${mergeX + 3.5},${targetY + 8} ${mergeX},${targetY + 2}`
                      : `${mergeX - 3.5},${targetY - 8} ${mergeX + 3.5},${targetY - 8} ${mergeX},${targetY - 2}`
                  }
                  fill="#52525b"
                />
              </g>,
            );
          }

          // ── SPLIT+WAIT combined icons (rendered as HTML overlay, not SVG) ──
          // These replace individual split/pause event markers at the same timestamp
          return elements;
        })()}
      </svg>

      {/* Activity Windows */}
      {activityWindows.map((window) => {
        const agent = agents.find((a) => a.id === window.agentId);
        const lifecycle = agent?.lifecycle || "persistent";
        const y = getAgentY(window.agentId) - 10;
        // Bars inset on left for agents that were spawned/split into (have parentId or ephemeral)
        const inset = lifecycle === "ephemeral" || agent?.parentId ? SUBAGENT_BAR_INSET_PX : 0;
        const x = getX(window.startTime) + inset;
        const rawWidth =
          ((window.endTime !== null ? window.endTime : currentTime) - window.startTime) * timeScale;
        const width = rawWidth - inset;
        let opacity = 1;
        if (selectedActivityId) {
          // When an activity is selected, only highlight connected windows
          opacity = connectedWindows.has(window.id) ? 1 : 0.1;
        } else if (hasHighlight) {
          // When hovering/selecting an agent, highlight its lineage
          opacity = highlightSet.has(window.agentId) ? 1 : 0.2;
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

      {/* Split+Wait and Merge+Resume combined icons */}
      {(() => {
        // Detect split batches and their wait status
        const splitEvents = events.filter((e) => e.type === "split" && e.timestamp <= currentTime);
        const batchKeys = new Set<string>();
        const batches: {
          sourceId: string;
          timestamp: number;
          iconTimestamp: number;
          count: number;
          isWait: boolean;
        }[] = [];
        for (const e of splitEvents) {
          const key = `${e.agentId}@${e.timestamp}`;
          if (batchKeys.has(key)) {
            continue;
          }
          batchKeys.add(key);
          const count = splitEvents.filter(
            (s) => s.agentId === e.agentId && s.timestamp === e.timestamp,
          ).length;
          // Check if a pause follows immediately (= Split & Wait)
          const followingPause = events.find(
            (p) =>
              p.agentId === e.agentId &&
              p.type === "pause" &&
              p.timestamp > e.timestamp &&
              p.timestamp <= e.timestamp + 2,
          );
          const isWait = !!followingPause;
          // If wait, place icon at the pause position (= bar end); otherwise at split position
          const iconTimestamp = isWait && followingPause ? followingPause.timestamp : e.timestamp;
          batches.push({
            sourceId: e.agentId,
            timestamp: e.timestamp,
            iconTimestamp,
            count,
            isWait,
          });
        }
        // Detect merge batches by matching to spawn batches
        const mergeEvents = events.filter((e) => e.type === "merge" && e.timestamp <= currentTime);
        const splitByTarget = new Map<string, number>(); // targetId (subagent) → spawn timestamp
        for (const e of events) {
          if (e.type === "split" && e.targetId) {
            splitByTarget.set(e.targetId, e.timestamp);
          }
        }
        // Group merges by spawn batch
        const mergeBatchMap = new Map<
          string,
          { targetId: string; resumeTimestamp: number; count: number }
        >();
        for (const e of mergeEvents) {
          const spawnTs = splitByTarget.get(e.agentId) ?? 0;
          const key = `${e.targetId}@${spawnTs}`;
          const existing = mergeBatchMap.get(key);
          if (existing) {
            existing.count++;
            existing.resumeTimestamp = Math.max(existing.resumeTimestamp, e.timestamp);
          } else {
            mergeBatchMap.set(key, {
              targetId: e.targetId!,
              count: 1,
              resumeTimestamp: e.timestamp,
            });
          }
        }
        const mergeBatches = [...mergeBatchMap.entries()].map(([key, v]) => ({
          key,
          targetId: v.targetId,
          resumeTimestamp: v.resumeTimestamp,
          count: v.count,
          // Check if a resume follows the last merge in this batch
          hasResume: events.some(
            (r) =>
              r.agentId === v.targetId &&
              r.type === "resume" &&
              r.timestamp >= v.resumeTimestamp &&
              r.timestamp <= v.resumeTimestamp + 3,
          ),
        }));

        const splitIcons = batches.map((batch) => {
          const x = getX(batch.iconTimestamp);
          const y = getAgentY(batch.sourceId);
          const Icon = batch.isWait ? GitFork : GitBranch;
          const colorClass = "text-purple-400 border-purple-400/50 bg-purple-950";
          const label = batch.isWait ? `Split & Wait (×${batch.count})` : `Split (×${batch.count})`;
          return (
            <div
              key={`split-icon-${batch.sourceId}-${batch.timestamp}`}
              className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border flex items-center justify-center z-40 ${colorClass}`}
              style={{ left: x, top: y }}
              title={label}
            >
              <Icon size={10} strokeWidth={3} />
            </div>
          );
        });

        const mergeIcons = mergeBatches
          .filter((b) => b.hasResume)
          .map((batch) => {
            // Place icon at the resume position on the orchestrator bar
            const resumeEvent = events.find(
              (r) =>
                r.agentId === batch.targetId &&
                r.type === "resume" &&
                r.timestamp >= batch.resumeTimestamp &&
                r.timestamp <= batch.resumeTimestamp + 3,
            );
            const x = resumeEvent ? getX(resumeEvent.timestamp) : getX(batch.resumeTimestamp);
            const y = getAgentY(batch.targetId);
            return (
              <div
                key={`merge-icon-${batch.key}`}
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border flex items-center justify-center z-40 text-emerald-400 border-emerald-400/50 bg-emerald-950"
                style={{ left: x, top: y }}
                title={`Merge & Resume (×${batch.count})`}
              >
                <GitMerge size={10} strokeWidth={3} />
              </div>
            );
          });

        return [...splitIcons, ...mergeIcons];
      })()}

      {/* Event Markers (excluding split/merge combined icons handled above) */}
      {events
        .filter((e) => e.timestamp <= currentTime)
        .filter((e) => {
          // Skip split events (rendered as combined split icons above)
          if (e.type === "split") {
            return false;
          }
          // Skip merge events (rendered as combined merge icons above)
          if (e.type === "merge") {
            return false;
          }
          // Skip pause events that immediately follow a split (part of split+wait)
          if (e.type === "pause") {
            const hasSplitBefore = events.some(
              (s) =>
                s.type === "split" &&
                s.agentId === e.agentId &&
                s.timestamp < e.timestamp &&
                e.timestamp - s.timestamp <= 2,
            );
            if (hasSplitBefore) {
              return false;
            }
          }
          // Skip resume events that immediately follow a merge (part of merge+resume)
          if (e.type === "resume") {
            const hasMergeBefore = events.some(
              (m) =>
                m.type === "merge" &&
                m.targetId === e.agentId &&
                e.timestamp >= m.timestamp &&
                e.timestamp - m.timestamp <= 3,
            );
            if (hasMergeBefore) {
              return false;
            }
          }
          return true;
        })
        .map((event) => {
          const y = getAgentY(event.agentId);
          const eventAgent = agents.find((a) => a.id === event.agentId);
          const hasInset = eventAgent?.lifecycle === "ephemeral" || !!eventAgent?.parentId;
          let x = getX(event.timestamp);
          if (hasInset && ["spawn", "start"].includes(event.type)) {
            // Start icons align with bar left edge (inset)
            x = getX(event.timestamp) + SUBAGENT_BAR_INSET_PX;
          }
          // End icons (archive/pause/error) stay at original timestamp = bar right edge (no inset)
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
                  // Find the activity window this event belongs to → show Runtime Inspection
                  const eventWin = getWindowForAgentAtTime(event.agentId, event.timestamp, true);
                  if (eventWin && onActivityClick) {
                    onActivityClick(eventWin.id, event.agentId);
                  } else {
                    setSelectedAgentId(event.agentId);
                  }
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
