import DOMPurify from "dompurify";
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
import { marked } from "marked";
import React, { useState, useRef, useEffect } from "react";
import type { Agent, LifecycleEvent, AgentSnapshot, TaskSessionData } from "./types";

// Configure marked for compact inline rendering
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false });
  return DOMPurify.sanitize(html);
}

// ── Agent avatar colors (deterministic by name) ──────────────────────────
const AGENT_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function hashAgentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return AGENT_COLORS[Math.abs(h) % AGENT_COLORS.length];
}

function AgentAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const bg = hashAgentColor(name);
  const initials = name
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className={`${bg} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4, lineHeight: 1 }}
    >
      <span className="text-white font-bold">{initials || "A"}</span>
    </div>
  );
}

/** Format seconds as mm:ss or h:mm:ss. */
function formatTimestamp(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

interface RightPanelProps {
  agents: Agent[];
  snapshots: AgentSnapshot[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  events: LifecycleEvent[];
  currentTime: number;
  maxTime: number;
  taskSession: TaskSessionData;
  isDark?: boolean;
}

export function MonitorRightPanel({
  agents,
  snapshots,
  events,
  currentTime,
  maxTime,
  taskSession,
}: Omit<RightPanelProps, "selectedAgentId" | "setSelectedAgentId" | "isDark">) {
  const [showLegendModal, setShowLegendModal] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Count visible messages and auto-scroll when new ones appear.
  const visibleCount = taskSession.chatMessages.filter(
    (msg) => msg.ts == null || msg.ts <= currentTime,
  ).length;
  const prevVisibleCount = useRef(0);
  useEffect(() => {
    if (visibleCount > prevVisibleCount.current && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
    prevVisibleCount.current = visibleCount;
  }, [visibleCount]);

  const groupedSnapshots = {
    running: snapshots.filter((s) => s.currentStatus === "running"),
    paused: snapshots.filter((s) => s.currentStatus === "paused"),
    waiting: snapshots.filter((s) => s.currentStatus === "waiting"),
    error: snapshots.filter((s) => s.currentStatus === "error"),
    archived: snapshots.filter((s) => s.currentStatus === "archived"),
  };

  return (
    <div className="w-full flex flex-col bg-[#0f0f0f] h-full min-w-0">
      {/* System Overview — compact, max height capped */}
      <div className="flex-none overflow-y-auto p-4 custom-scrollbar" style={{ maxHeight: "45%" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
            <Layers size={16} className="text-zinc-400" />
            System Overview
            {(() => {
              if (taskSession.agents.length === 0) {
                return null;
              }
              // Consider "live" if the last activity is within 2 minutes of now.
              const gStart = taskSession.globalStartMs ?? 0;
              const lastActivityMs =
                taskSession.endTime != null && gStart ? gStart + taskSession.endTime * 1000 : 0;
              const isLive =
                taskSession.endTime == null ||
                (lastActivityMs > 0 && Date.now() - lastActivityMs < 120_000);
              return isLive ? (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  Live
                </span>
              ) : (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 border border-zinc-500/30">
                  Completed
                </span>
              );
            })()}
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
            <span className="text-xs text-zinc-500 font-mono">TASK NAME</span>
            <span className="text-xs text-zinc-200 font-medium">{taskSession.name}</span>
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
            <span className="text-xs text-zinc-500 font-mono">TOTAL TOKENS</span>
            <span className="text-xs text-zinc-200 font-mono">
              {taskSession.metrics.totalTokens > 1_000_000
                ? `${(taskSession.metrics.totalTokens / 1_000_000).toFixed(1)}M`
                : taskSession.metrics.totalTokens > 1_000
                  ? `${(taskSession.metrics.totalTokens / 1_000).toFixed(0)}K`
                  : taskSession.metrics.totalTokens}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, flexShrink: 0, background: "var(--border, rgba(63,63,70,0.5))" }} />

      {/* Chat — fills all remaining space */}
      <div
        ref={chatRef}
        className="flex-1 flex flex-col overflow-hidden min-h-0"
        style={{ background: "var(--bg-elevated, #191c24)" }}
      >
        <div
          className="p-3 border-b border-zinc-800/80"
          style={{ background: "var(--card, #161920)" }}
        >
          <div className="text-xs text-emerald-400 font-mono flex items-center gap-2 font-bold tracking-wider">
            <MessageSquare size={14} /> CHAT
          </div>
        </div>
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {taskSession.chatMessages
            .filter((msg) => msg.ts == null || msg.ts <= currentTime)
            .map((msg) => {
              const isToolOnly =
                msg.role === "assistant" &&
                msg.content.startsWith("[") &&
                msg.content.endsWith("]");
              const agentName = msg.agentName || "Agent";
              const tsLabel = msg.ts != null ? formatTimestamp(msg.ts) : null;

              return msg.role === "user" ? (
                <div key={msg.id}>
                  {tsLabel != null && (
                    <div className="text-[9px] font-mono text-zinc-600 text-right mb-1">
                      {tsLabel}
                    </div>
                  )}
                  <div className="flex justify-end pl-8">
                    <div className="text-sm text-zinc-200 bg-blue-500/15 px-3 py-2 rounded-2xl rounded-tr-sm inline-block shadow-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={msg.id}>
                  {tsLabel != null && (
                    <div className="text-[9px] font-mono text-zinc-600 mb-1">{tsLabel}</div>
                  )}
                  <div className="flex items-start gap-2 pr-8">
                    <AgentAvatar name={agentName} size={22} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-zinc-500 font-mono mb-0.5 truncate">
                        {agentName}
                      </div>
                      {isToolOnly ? (
                        <div className="text-[11px] text-zinc-400 font-mono bg-zinc-700/30 px-2 py-1 rounded border border-zinc-600/30 inline-block">
                          {msg.content}
                        </div>
                      ) : (
                        <div
                          className="monitor-chat-md text-sm text-zinc-200 leading-relaxed bg-zinc-700/25 px-3 py-2 rounded-2xl rounded-tl-sm border border-zinc-600/25"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
