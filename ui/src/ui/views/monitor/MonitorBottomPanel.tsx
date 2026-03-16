import {
  Terminal,
  Activity,
  Settings,
  X,
  Shield,
  FileText,
  Globe,
  CheckCircle2,
  Circle,
  Mail,
  Code,
  Cpu,
  Database,
  Folder,
  File,
  Server,
  Cloud,
} from "lucide-react";
import React, { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { getMockAgentConfig, getMockAgentTelemetry } from "./mockData";
import type { Agent, AgentSnapshot, LifecycleEvent, ActivityWindow } from "./types";
import { WorkspaceIcon } from "./WorkspaceIcon";

interface BottomPanelProps {
  selectedAgentId: string | null;
  selectedActivityId: string | null;
  agents: Agent[];
  snapshots: AgentSnapshot[];
  events: LifecycleEvent[];
  activityWindows: ActivityWindow[];
  currentTime: number;
  onClose: () => void;
}

// ── Icon registry (maps string keys from data to lucide components) ─────

const ICON_MAP: Record<string, React.ElementType> = {
  Terminal,
  Code,
  Globe,
  FileText,
  Mail,
  Shield,
  Database,
  Cloud,
  File,
  Server,
  Folder,
  Cpu,
  Activity,
};

function IconByName({
  name,
  size = 12,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[name] || Circle;
  return <Icon size={size} className={className} />;
}

// ── Recharts custom Y-axis tick with icon ───────────────────────────────

const TOOL_ICON_MAP: Record<string, string> = {
  "Web Search": "Globe",
  "Read File": "FileText",
  "Write File": "Code",
  "Execute Cmd": "Terminal",
  "API Call": "Cloud",
  "DB Query": "Database",
  "Git Commit": "File",
  Linter: "Shield",
};

const CustomYAxisTick = ({
  x,
  y,
  payload,
}: {
  x: number;
  y: number;
  payload: { value: string };
}) => {
  const iconName = TOOL_ICON_MAP[payload.value] || "Circle";
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-90} y={-10} width={90} height={20}>
        <div className="flex items-center justify-end gap-1.5 pr-2 text-[10px] text-zinc-400 h-full">
          <IconByName name={iconName} size={10} className="flex-shrink-0" />
          <span className="truncate">{payload.value}</span>
        </div>
      </foreignObject>
    </g>
  );
};

// ── Style lookups ───────────────────────────────────────────────────────

const ACCESS_COLOR: Record<string, { text: string; border: string; bg: string; label: string }> = {
  rw: {
    text: "text-emerald-500/70",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/10",
    label: "R/W",
  },
  readonly: {
    text: "text-amber-500/70",
    border: "border-amber-500/20",
    bg: "bg-amber-500/10",
    label: "Read Only",
  },
  none: { text: "text-zinc-600", border: "border-zinc-700", bg: "", label: "No Access" },
};

const LEVEL_COLOR: Record<string, string> = {
  allowed: "text-emerald-400 border-emerald-500/30",
  ask: "text-amber-400 border-amber-500/30",
  denied: "text-rose-400 border-rose-500/30",
};

// ── Component ───────────────────────────────────────────────────────────

export function MonitorBottomPanel({
  selectedAgentId,
  selectedActivityId,
  agents,
  snapshots,
  events: _events,
  activityWindows,
  currentTime: _currentTime,
  onClose,
}: BottomPanelProps) {
  void _events;
  void _currentTime;
  if (!selectedAgentId && !selectedActivityId) {
    return null;
  }

  const agent = agents.find((a) => a.id === selectedAgentId);
  const _snap = snapshots.find((s) => s.id === selectedAgentId);
  void _snap;
  const activity = activityWindows.find((w) => w.id === selectedActivityId);

  const agentConfig = useMemo(() => (agent ? getMockAgentConfig(agent.id) : null), [agent]);
  const agentTelemetry = useMemo(() => (agent ? getMockAgentTelemetry(agent.id) : null), [agent]);

  // Map capability `value` to `A` for Recharts Radar
  const radarData = useMemo(
    () => agentConfig?.capabilities.map((c) => ({ subject: c.subject, A: c.value })) ?? [],
    [agentConfig],
  );

  return (
    <div className="h-full border-t border-zinc-800/50 bg-[#0f0f0f] flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-[#141414]">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          {selectedActivityId ? (
            <>
              <Activity size={14} className="text-emerald-400" /> Runtime Inspection
            </>
          ) : (
            <>
              <Settings size={14} className="text-blue-400" /> Agent Configuration
            </>
          )}
        </div>
        <button onClick={onClose} className="btn btn--sm" style={{ padding: "3px 5px" }}>
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-4 flex gap-0">
        {selectedActivityId && activity && agent && agentTelemetry ? (
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-0 overflow-hidden">
            {/* Col 1: Identity */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 px-3 border-r border-zinc-800/30">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-zinc-500 font-mono mb-1">AGENT</div>
                  <div className="text-sm text-zinc-200 flex items-center gap-2">
                    {agent.name}
                    <span
                      className={`text-[9px] px-1 rounded-sm border ${agent.lifecycle === "persistent" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : "text-amber-400 border-amber-400/30 bg-amber-400/10"}`}
                    >
                      {agent.lifecycle.toUpperCase()}
                    </span>
                  </div>
                  <div
                    className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate"
                    title={agent.id}
                  >
                    {agent.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 font-mono mb-1">TIME WINDOW</div>
                  <div className="text-sm text-zinc-200 font-mono">
                    T{activity.startTime} -{" "}
                    {activity.endTime !== null ? `T${activity.endTime}` : "Present"}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2">ACTIVE PLATFORMS</div>
                <div className="flex flex-wrap gap-2">
                  {agentTelemetry.platforms.map((p) => (
                    <span
                      key={p.name}
                      className="flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50"
                    >
                      <IconByName name={p.icon} size={12} className={p.iconColor} /> {p.name}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2">SEGMENT SUMMARY</div>
                <div className="text-sm text-zinc-300 leading-relaxed bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                  {agentTelemetry.summary}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2">TASKS & COMPLETION</div>
                <div className="space-y-2">
                  {agentTelemetry.tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2 text-sm text-zinc-300">
                      {task.completed ? (
                        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Circle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      )}
                      <span>{task.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Col 2: Artifacts */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 px-3 border-r border-zinc-800/30">
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2 flex items-center gap-2">
                  <FileText size={12} /> OUTPUT & ARTIFACTS
                </div>
                <div className="space-y-3">
                  {agentTelemetry.artifacts.map((art) => (
                    <div
                      key={art.id}
                      className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800/50 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
                        <IconByName name={art.icon} size={14} className={art.iconColor} />{" "}
                        {art.title}
                      </div>
                      <div className="text-xs text-zinc-500">{art.description}</div>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        {art.additions != null && (
                          <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                            +{art.additions} {art.additionUnit ?? "LoC"}
                          </span>
                        )}
                        {art.deletions != null && (
                          <span className="text-rose-400 bg-rose-400/10 px-1.5 py-0.5 rounded border border-rose-400/20">
                            -{art.deletions} LoC
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Col 3: Tool Usage */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 px-3 border-r border-zinc-800/30">
              <div className="text-xs text-zinc-500 font-mono mb-1">TOOL USAGE DISTRIBUTION</div>
              <div className="flex-1 w-full bg-zinc-800/20 rounded-lg p-2 border border-zinc-800/50 min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={agentTelemetry.toolUsage}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                    <XAxis type="number" stroke="#666" fontSize={10} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#888"
                      fontSize={10}
                      width={90}
                      tick={<CustomYAxisTick />}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "#3f3f46",
                        fontSize: "12px",
                        color: "#e4e4e7",
                      }}
                      itemStyle={{ color: "#10b981" }}
                      cursor={{ fill: "#27272a" }}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Col 4: System Metrics */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 px-3">
              <div className="flex-1 flex flex-col">
                <div className="text-xs text-zinc-500 font-mono mb-1 flex items-center gap-2">
                  <Cpu size={12} /> SYSTEM MONITORING
                </div>
                <div className="flex-1 w-full bg-zinc-800/20 rounded-lg p-2 border border-zinc-800/50 min-h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={agentTelemetry.systemMetrics}
                      margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickMargin={5} hide />
                      <YAxis stroke="#666" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          borderColor: "#3f3f46",
                          fontSize: "12px",
                          color: "#e4e4e7",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cpu"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="CPU (%)"
                      />
                      <Line
                        type="monotone"
                        dataKey="memory"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={false}
                        name="Memory (MB)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex-1 flex flex-col">
                <div className="text-xs text-zinc-500 font-mono mb-1 flex items-center gap-2">
                  <Database size={12} /> CONTEXT WINDOW
                </div>
                <div className="flex-1 w-full bg-zinc-800/20 rounded-lg p-2 border border-zinc-800/50 min-h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={agentTelemetry.systemMetrics}
                      margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickMargin={5} />
                      <YAxis stroke="#666" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          borderColor: "#3f3f46",
                          fontSize: "12px",
                          color: "#e4e4e7",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="context"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        name="Context (kTokens)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : agent && agentConfig ? (
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-0 overflow-hidden">
            {/* Col 1: Basic Info */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 px-3 border-r border-zinc-800/30">
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-1">AGENT ID</div>
                <div className="text-xs text-zinc-400 font-mono mb-3 select-all">{agent.id}</div>
                <div className="text-xs text-zinc-500 font-mono mb-1">NAME & ROLE</div>
                <div className="text-sm text-zinc-200 flex items-center gap-2">
                  {agent.name} - {agent.role}
                </div>
              </div>
              {agent.workspace && (
                <div>
                  <div className="text-xs text-zinc-500 font-mono mb-1">WORKSPACE</div>
                  <div className="text-xs text-zinc-300 font-mono flex items-center gap-1.5 select-all">
                    <WorkspaceIcon
                      workspace={agent.workspace}
                      size={14}
                      className="text-zinc-400 flex-shrink-0"
                    />
                    {agent.workspace}
                  </div>
                </div>
              )}
              <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    <Globe size={14} className="text-blue-400" /> SERVICE ACCESS SCOPE
                  </div>
                  <button className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 transition-colors">
                    Configure
                  </button>
                </div>
                <div className="space-y-2">
                  {agentConfig.serviceAccess.map((sa) => (
                    <div
                      key={sa.name}
                      className="flex items-center justify-between bg-zinc-900/50 p-2 rounded border border-zinc-800/80"
                    >
                      <div className="flex items-center gap-2">
                        <IconByName name={sa.icon} size={14} className={sa.iconColor} />
                        <div>
                          <div className="text-xs text-zinc-200">{sa.name}</div>
                          <div className="text-[10px] text-zinc-500">{sa.description}</div>
                        </div>
                      </div>
                      <div
                        className={`w-8 h-4 rounded-full flex items-center p-0.5 cursor-pointer ${sa.enabled ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-zinc-700/30 border border-zinc-600/30"}`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full ${sa.enabled ? "bg-emerald-400 translate-x-4" : "bg-zinc-500 translate-x-0"}`}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Col 2: File Access */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 px-3 border-r border-zinc-800/30">
              <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-400" /> FILE ACCESS SCOPE
                  </div>
                  <button className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 transition-colors">
                    Modify
                  </button>
                </div>
                <div className="bg-zinc-900/80 rounded border border-zinc-800/80 p-2 font-mono text-xs text-zinc-300 space-y-1.5 overflow-x-auto flex-1">
                  {agentConfig.fileAccess.map((fa) => {
                    const color = ACCESS_COLOR[fa.access];
                    const textColor =
                      fa.access === "rw"
                        ? "text-emerald-400"
                        : fa.access === "readonly"
                          ? "text-amber-400"
                          : "text-zinc-500";
                    return (
                      <div
                        key={fa.path}
                        className={`flex items-center gap-1.5 ${textColor}`}
                        style={{ paddingLeft: fa.indent * 16 }}
                      >
                        {fa.isFolder ? (
                          <Folder
                            size={12}
                            className={fa.access !== "none" ? "fill-current opacity-20" : ""}
                          />
                        ) : (
                          <File size={12} />
                        )}
                        {fa.path}{" "}
                        <span
                          className={`text-[9px] ml-2 ${color.text} border ${color.border} ${color.bg} px-1 rounded`}
                        >
                          {color.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Col 3: Radar */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-start px-3 border-r border-zinc-800/30">
              <div className="text-xs text-zinc-500 font-mono mb-2 w-full text-left">
                AGENT CAPABILITIES
              </div>
              <div className="w-full h-64 bg-zinc-800/20 rounded-lg border border-zinc-800/50 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      name="Capability"
                      dataKey="A"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.4}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "#3f3f46",
                        fontSize: "12px",
                        color: "#e4e4e7",
                      }}
                      itemStyle={{ color: "#10b981" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Col 4: Skills & Tools */}
            <div className="w-full xl:w-0 xl:flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 px-3">
              <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    INSTALLED SKILLS
                  </div>
                  <button className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 transition-colors">
                    Add Skill
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agent.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-1 rounded-md bg-zinc-800/80 text-zinc-200 text-xs font-medium border border-zinc-700/50 shadow-sm flex items-center gap-1.5 group cursor-pointer hover:border-zinc-500 transition-colors"
                    >
                      {skill}
                      <X size={10} className="text-zinc-500 group-hover:text-rose-400" />
                    </span>
                  ))}
                  {agent.skills.length === 0 && (
                    <span className="text-xs text-zinc-500 italic">
                      No specific skills installed.
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    <Shield size={14} className="text-emerald-400" /> TOOLS PERMISSIONS
                  </div>
                  <button className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 transition-colors">
                    Manage
                  </button>
                </div>
                <div className="space-y-2">
                  {agentConfig.toolPermissions.map((tp) => {
                    const colorCls = LEVEL_COLOR[tp.level] ?? "";
                    return (
                      <div
                        key={tp.name}
                        className="bg-zinc-900/50 p-2 rounded border border-zinc-800/80 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <IconByName name={tp.icon} size={14} className="text-zinc-400" />
                          <span className="text-xs text-zinc-300 font-medium">{tp.name}</span>
                        </div>
                        <select
                          className={`bg-zinc-800 text-[10px] border rounded px-1.5 py-0.5 outline-none cursor-pointer ${colorCls}`}
                          defaultValue={tp.level}
                        >
                          <option value="allowed">Allowed</option>
                          <option value="ask">Ask First</option>
                          <option value="denied">Denied</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
