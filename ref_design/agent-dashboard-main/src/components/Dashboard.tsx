import {
  Play,
  Pause,
  SkipForward,
  Activity,
  Filter,
  Clock,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Info,
  X,
} from "lucide-react";
import React, { useRef, useState, useEffect, UIEvent, MouseEvent } from "react";
import { mockAnnotations } from "../data/annotations";
import { Agent, LifecycleEvent, ActivityWindow, LineageEdge, AgentSnapshot } from "../types";
import BottomPanel from "./BottomPanel";
import RightPanel from "./RightPanel";
import Timeline from "./Timeline";
import { WorkspaceIcon } from "./WorkspaceIcon";

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
}

export default function Dashboard(props: DashboardProps) {
  const { currentTime, setCurrentTime, isPlaying, setIsPlaying, agents, snapshots, maxTime } =
    props;

  const leftHeadersRef = useRef<HTMLDivElement>(null);
  const topAxisRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const hasAutoFaded = useRef(false);
  const [timeScale, setTimeScale] = useState(6);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

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
    const x = e.clientX - rect.left + scrollLeft - 16; // 16 is px-4 padding
    const clickedTime = Math.max(0, Math.min(maxTime, Math.round(x / timeScale)));
    setIsPlaying(false);
    setCurrentTime(clickedTime);
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

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden selection:bg-emerald-500/30">
      {/* Left + Middle Area */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-zinc-800/50">
        {/* Top Bar */}
        <div className="flex h-16 border-b border-zinc-800/50 bg-[#0f0f0f]">
          {/* Global Summary */}
          <div className="w-64 flex-shrink-0 border-r border-zinc-800/50 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentTime(maxTime);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                  title="Skip to End"
                >
                  <SkipForward size={12} />
                </button>
                <div className="w-px h-3 bg-zinc-800 mx-0.5"></div>
                <button
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    showAnnotations
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 border border-transparent hover:border-zinc-700"
                  }`}
                  title="Toggle Insights"
                >
                  <Sparkles size={10} />
                  <span>Insights</span>
                </button>
                <div className="w-px h-3 bg-zinc-800 mx-0.5"></div>
                <button
                  onClick={() => setTimeScale(Math.max(2, timeScale - 2))}
                  className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={10} />
                </button>
                <span className="text-[10px] font-mono text-zinc-500 w-4 text-center">
                  {timeScale}x
                </span>
                <button
                  onClick={() => setTimeScale(Math.min(32, timeScale + 2))}
                  className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={10} />
                </button>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    Active
                  </span>
                  <span className="text-sm font-medium text-zinc-100 leading-none">
                    {activeCount}
                  </span>
                  {errorCount > 0 && (
                    <span className="text-xs text-rose-400 font-medium leading-none">
                      {errorCount} err
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrubber */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-zinc-500 w-5 text-right">
                {currentTime}
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
                className="flex-1 h-1.5 bg-zinc-800 rounded-lg cursor-pointer accent-emerald-500"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-5">{maxTime}</span>
            </div>
          </div>

          {/* Time Axis Header */}
          <div
            className="flex-1 overflow-hidden relative cursor-pointer hover:bg-zinc-800/10 transition-colors"
            ref={topAxisRef}
            onClick={handleAxisClick}
          >
            <div
              className="absolute inset-0 flex items-end pb-2 px-4"
              style={{ width: maxTime * timeScale + 32 }}
            >
              {Array.from({ length: maxTime / 10 + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute flex flex-col items-center"
                  style={{ left: i * 10 * timeScale + 16 }}
                >
                  <span className="text-[10px] font-mono text-zinc-500 mb-1">{i * 10}</span>
                  <div className="w-px h-2 bg-zinc-700"></div>
                </div>
              ))}
              {/* Current Time Indicator on Axis */}
              <div
                className="absolute bottom-0 w-px h-4 bg-emerald-500 z-20 transition-all duration-100"
                style={{ left: currentTime * timeScale + 16 }}
              >
                <div className="absolute -top-4 -translate-x-1/2 bg-emerald-500 text-[#0a0a0a] text-[9px] font-bold px-1 rounded-sm">
                  {currentTime}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Timeline Area */}
        <div className="flex flex-1 overflow-hidden relative bg-[#0a0a0a]">
          {/* Left Sticky Headers */}
          <div
            className="w-64 flex-shrink-0 border-r border-zinc-800/50 overflow-hidden bg-[#0f0f0f] z-10"
            ref={leftHeadersRef}
            onClick={() => props.setSelectedAgentId(null)}
          >
            <div className="relative" style={{ height: agents.length * 64 + 32 + 24 }}>
              {" "}
              {/* +24 to compensate for right side horizontal scrollbar */}
              {agents.map((agent, index) => {
                const snap = snapshots.find((s) => s.id === agent.id);
                const isSelected = props.selectedAgentId === agent.id;
                const isHovered = props.hoveredAgentId === agent.id;
                const top = 16 + index * 64;

                return (
                  <div
                    key={agent.id}
                    className={`absolute left-0 right-0 px-4 flex items-center justify-between cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? "bg-zinc-800/50 border-emerald-500"
                        : isHovered
                          ? "bg-zinc-800/30 border-zinc-600"
                          : "border-transparent hover:bg-zinc-800/20"
                    }`}
                    style={{ top, height: 64 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.setSelectedAgentId(agent.id);
                      setSelectedActivityId(null);
                    }}
                    onMouseEnter={() => props.setHoveredAgentId(agent.id)}
                    onMouseLeave={() => props.setHoveredAgentId(null)}
                  >
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-sm font-medium text-zinc-200 truncate">
                          {agent.name}
                        </span>
                        {agent.workspace && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 flex-shrink-0 flex items-center gap-1">
                            <WorkspaceIcon workspace={agent.workspace} size={10} />
                            {agent.workspace}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-500 font-mono truncate">
                          {agent.role}
                        </span>
                        <span
                          className={`text-[9px] px-1 rounded-sm border ${
                            agent.lifecycle === "persistent"
                              ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                              : agent.lifecycle === "ephemeral"
                                ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
                                : "text-indigo-400 border-indigo-400/30 bg-indigo-400/10"
                          }`}
                        >
                          {agent.lifecycle.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        snap?.currentStatus === "running"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : snap?.currentStatus === "paused"
                            ? "bg-amber-500"
                            : snap?.currentStatus === "error"
                              ? "bg-rose-500"
                              : snap?.currentStatus === "waiting"
                                ? "bg-blue-500"
                                : "bg-zinc-700"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Middle Timeline */}
          <div
            className="flex-1 overflow-auto relative"
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            onClick={() => {
              props.setSelectedAgentId(null);
              setSelectedActivityId(null);
            }}
          >
            <div
              className="relative"
              style={{ width: maxTime * timeScale + 32, height: agents.length * 64 + 32 }}
            >
              <Timeline
                {...props}
                showAnnotations={showAnnotations}
                annotations={mockAnnotations}
                timeScale={timeScale}
                selectedActivityId={selectedActivityId}
                onActivityClick={(activityId, agentId) => {
                  setSelectedActivityId(activityId);
                  props.setSelectedAgentId(agentId);
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Panel */}
        <BottomPanel
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
        />
      </div>

      {/* Right Area */}
      <RightPanel {...props} />
    </div>
  );
}
