import {
  Play,
  Pause,
  AlertCircle,
  Archive,
  Clock,
  Activity,
  Layers,
  Info,
  X,
  Send,
  CheckSquare,
  Zap,
  MessageSquare,
} from "lucide-react";
import React, { useState, useRef, useCallback } from "react";
import { Agent, LifecycleEvent, AgentSnapshot } from "./types";

interface RightPanelProps {
  agents: Agent[];
  snapshots: AgentSnapshot[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  events: LifecycleEvent[];
  currentTime: number;
  maxTime: number;
}

export function MonitorRightPanel({
  agents,
  snapshots,
  events,
  currentTime,
  maxTime,
}: Omit<RightPanelProps, "selectedAgentId" | "setSelectedAgentId">) {
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [chatHeight, setChatHeight] = useState<number | null>(null); // null = use 40% default
  const chatDragging = useRef(false);
  const chatStartY = useRef(0);
  const chatStartH = useRef(0);

  const chatRef = useRef<HTMLDivElement>(null);
  const onChatResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      chatDragging.current = true;
      chatStartY.current = e.clientY;
      chatStartH.current = chatRef.current?.offsetHeight ?? chatHeight ?? 160;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: globalThis.MouseEvent) => {
        if (!chatDragging.current) {
          return;
        }
        const delta = chatStartY.current - ev.clientY;
        setChatHeight(Math.max(60, chatStartH.current + delta));
      };
      const onUp = () => {
        chatDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [chatHeight],
  );

  const groupedSnapshots = {
    running: snapshots.filter((s) => s.currentStatus === "running"),
    paused: snapshots.filter((s) => s.currentStatus === "paused"),
    waiting: snapshots.filter((s) => s.currentStatus === "waiting"),
    error: snapshots.filter((s) => s.currentStatus === "error"),
    archived: snapshots.filter((s) => s.currentStatus === "archived"),
  };

  return (
    <div className="w-full flex flex-col bg-[#0f0f0f] h-full min-w-0">
      {/* System Overview */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
            <Layers size={16} className="text-zinc-400" />
            System Overview
          </h2>
          <button
            onClick={() => setShowLegendModal(true)}
            className="btn btn--sm"
            style={{ padding: "3px 5px" }}
            title="View Agent Lifecycle Legend"
          >
            <Info size={16} />
          </button>
        </div>

        {/* Status Grid */}
        <div className="status-grid mb-4">
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
              <Play size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Running</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {groupedSnapshots.running.length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-blue-400 mb-1">
              <Clock size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Waiting</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {groupedSnapshots.waiting.length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-rose-400 mb-1">
              <AlertCircle size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Error</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {groupedSnapshots.error.length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-amber-400 mb-1">
              <Pause size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Paused</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {groupedSnapshots.paused.length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
              <Archive size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Archived</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {groupedSnapshots.archived.length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-indigo-400 mb-1">
              <Activity size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Total</span>
            </div>
            <span className="text-lg font-light text-zinc-100">{agents.length}</span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-emerald-500 mb-1">
              <CheckSquare size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Completed</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {events.filter((e) => e.type === "archive" && e.timestamp <= currentTime).length}
            </span>
          </div>
          <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-purple-400 mb-1">
              <Zap size={10} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Events</span>
            </div>
            <span className="text-lg font-light text-zinc-100">
              {events.filter((e) => e.timestamp <= currentTime).length}
            </span>
          </div>
        </div>

        {/* Workflow Metrics */}
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 mt-4">
          Workflow Metrics
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-mono">PROJECT NAME</span>
            <span className="text-xs text-zinc-200 font-medium">Data Aggregation Pipeline</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-mono">PROGRESS</span>
            <div className="flex items-center gap-2 w-24">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                  style={{ width: `${Math.round((currentTime / maxTime) * 100)}%` }}
                ></div>
              </div>
              <span className="text-xs text-zinc-200 font-mono">
                {Math.round((currentTime / maxTime) * 100)}%
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-mono">BOTTLENECKS</span>
            <span
              className={`text-xs font-mono ${events.filter((e) => e.type === "error" && e.timestamp <= currentTime).length > 0 ? "text-rose-400" : "text-zinc-200"}`}
            >
              {events.filter((e) => e.type === "error" && e.timestamp <= currentTime).length}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-mono">TOKENS GENERATED</span>
            <span className="text-xs text-zinc-200 font-mono">
              ~{Math.round(events.filter((e) => e.timestamp <= currentTime).length * 1.45)}K
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-mono">AVG LATENCY</span>
            <span className="text-xs text-emerald-400 font-mono">245ms</span>
          </div>
        </div>
      </div>

      {/* Chat resize handle */}
      <div
        onMouseDown={onChatResizeDown}
        style={{
          height: 5,
          cursor: "row-resize",
          position: "relative",
          flexShrink: 0,
          marginTop: -2,
          marginBottom: -3,
          zIndex: 30,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 2,
            height: 1,
            background: "var(--border, rgba(63,63,70,0.5))",
            transition: "background 0.15s",
          }}
        />
      </div>

      {/* Chat */}
      <div
        ref={chatRef}
        className="flex flex-col overflow-hidden"
        style={{
          height: chatHeight ?? "40%",
          flexShrink: 0,
          minHeight: 60,
          background: "var(--bg-elevated, #191c24)",
        }}
      >
        <div
          className="p-3 border-b border-zinc-800/80"
          style={{ background: "var(--card, #161920)" }}
        >
          <div className="text-xs text-emerald-400 font-mono flex items-center gap-2 font-bold tracking-wider">
            <MessageSquare size={14} /> CHAT
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          <div className="flex justify-end pl-12">
            <div className="text-sm text-zinc-200 bg-blue-500/15 px-3 py-2 rounded-2xl rounded-tr-sm inline-block shadow-sm">
              Dispatch an agent to investigate the memory leak in the payment service.
            </div>
          </div>
          <div className="w-full">
            <div className="text-sm text-zinc-300 leading-relaxed">
              Agent <span className="text-emerald-400 font-mono">Debugger-01</span> dispatched to{" "}
              <span className="text-blue-400 font-mono">payment-service</span>.<br />
              <span className="text-zinc-500 mt-1 block text-xs">
                Estimated time to initial report: 2m.
              </span>
            </div>
          </div>
          <div className="flex justify-end pl-12">
            <div className="text-sm text-zinc-200 bg-blue-500/15 px-3 py-2 rounded-2xl rounded-tr-sm inline-block shadow-sm">
              Update schedule for Data-Processor to run every hour instead of every 6 hours.
            </div>
          </div>
          <div className="w-full">
            <div className="text-sm text-zinc-300 leading-relaxed">
              Schedule updated for{" "}
              <span className="text-emerald-400 font-mono">Data-Processor</span>.<br />
              <span className="text-zinc-500 mt-1 block text-xs">Next run scheduled at T+60m.</span>
            </div>
          </div>
        </div>
        <div
          className="p-4 border-t border-zinc-800/80"
          style={{ background: "var(--card, #161920)" }}
        >
          <div className="relative max-w-sm mx-auto">
            <textarea
              className="w-full bg-[#0a0a0a] border border-zinc-700/80 rounded-xl p-3 pr-10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 resize-none custom-scrollbar shadow-inner"
              rows={2}
              placeholder="Message agents..."
            />
            <button className="absolute bottom-2.5 right-2.5 p-1.5 bg-emerald-500 text-[#0a0a0a] rounded-lg hover:bg-emerald-400 transition-colors shadow-md">
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Legend Modal */}
      {showLegendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="border border-zinc-800/80 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            style={{ background: "var(--bg-elevated, #191c24)" }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50"
              style={{ background: "var(--card, #161920)" }}
            >
              <h2 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                <Info size={16} className="text-blue-400" />
                Agent Lifecycle Legend
              </h2>
              <button
                onClick={() => setShowLegendModal(false)}
                className="btn btn--sm"
                style={{ padding: "3px 5px" }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs px-2 py-1 rounded-sm border text-emerald-400 border-emerald-400/30 bg-emerald-400/10 font-mono uppercase tracking-wider">
                    Persistent
                  </span>
                  <span className="text-sm text-zinc-200 font-medium">
                    Long-running core agents
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                  Project decides. Exists as long as the project runs. Exclusive resources,
                  persistent context.
                </p>
                <div className="flex flex-wrap gap-2">
                  {agents
                    .filter((a) => a.lifecycle === "persistent")
                    .map((a) => (
                      <div
                        key={a.id}
                        className="text-xs bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1.5 rounded-md text-zinc-300 flex items-center gap-2"
                      >
                        <span className="font-medium text-zinc-200">{a.name}</span>
                        <span className="text-zinc-500">|</span>
                        <span className="text-zinc-400">{a.role}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs px-2 py-1 rounded-sm border text-amber-400 border-amber-400/30 bg-amber-400/10 font-mono uppercase tracking-wider">
                    Ephemeral
                  </span>
                  <span className="text-sm text-zinc-200 font-medium">Short-lived task agents</span>
                </div>
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                  Task decides. Single-use, discarded after task completion. No persistent context.
                </p>
                <div className="flex flex-wrap gap-2">
                  {agents
                    .filter((a) => a.lifecycle === "ephemeral")
                    .map((a) => (
                      <div
                        key={a.id}
                        className="text-xs bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1.5 rounded-md text-zinc-300 flex items-center gap-2"
                      >
                        <span className="font-medium text-zinc-200">{a.name}</span>
                        <span className="text-zinc-500">|</span>
                        <span className="text-zinc-400">{a.role}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs px-2 py-1 rounded-sm border text-indigo-400 border-indigo-400/30 bg-indigo-400/10 font-mono uppercase tracking-wider">
                    Contract
                  </span>
                  <span className="text-sm text-zinc-200 font-medium">
                    Lifecycle-bound specialist agents
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                  Phase decides. Exists for a specific phase, context cleared after. Can be pooled.
                </p>
                <div className="flex flex-wrap gap-2">
                  {agents
                    .filter((a) => a.lifecycle === "contract")
                    .map((a) => (
                      <div
                        key={a.id}
                        className="text-xs bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1.5 rounded-md text-zinc-300 flex items-center gap-2"
                      >
                        <span className="font-medium text-zinc-200">{a.name}</span>
                        <span className="text-zinc-500">|</span>
                        <span className="text-zinc-400">{a.role}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
