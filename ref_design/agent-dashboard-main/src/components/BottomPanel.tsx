import {
  Terminal,
  Activity,
  Settings,
  Clock,
  AlertCircle,
  X,
  Shield,
  FileText,
  Globe,
  CheckCircle2,
  Circle,
  Mail,
  Slack,
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
import { Agent, AgentSnapshot, LifecycleEvent, ActivityWindow } from "../types";
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

// Mock data generators
const getAgentCapabilities = (agent: Agent) => [
  { subject: "Reasoning", A: 80 + (agent.id.length % 20) },
  { subject: "Coding", A: 60 + ((agent.name.length * 5) % 40) },
  { subject: "Communication", A: 70 + ((agent.role.length * 3) % 30) },
  { subject: "Data Analysis", A: 50 + ((agent.skills.length * 10) % 50) },
  { subject: "Planning", A: 85 - (agent.id.length % 15) },
];

const getToolUsage = (activityId: string) => {
  return [
    { name: "Web Search", count: 12 + (activityId.length % 5) },
    { name: "Read File", count: 8 + (activityId.length % 8) },
    { name: "Write File", count: 3 + (activityId.length % 4) },
    { name: "Execute Cmd", count: 5 + (activityId.length % 6) },
    { name: "API Call", count: 15 + (activityId.length % 10) },
    { name: "DB Query", count: 6 + (activityId.length % 3) },
    { name: "Git Commit", count: 2 + (activityId.length % 2) },
    { name: "Linter", count: 9 + (activityId.length % 4) },
  ].toSorted((a, b) => b.count - a.count);
};

const TOOL_ICONS: Record<string, React.ElementType> = {
  "Web Search": Globe,
  "Read File": FileText,
  "Write File": Code,
  "Execute Cmd": Terminal,
  "API Call": Cloud,
  "DB Query": Database,
  "Git Commit": File,
  Linter: Shield,
};

const CustomYAxisTick = ({ x, y, payload }: any) => {
  const Icon = TOOL_ICONS[payload.value] || Circle;
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-90} y={-10} width={90} height={20}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className="flex items-center justify-end gap-1.5 pr-2 text-[10px] text-zinc-400 h-full"
        >
          <Icon size={10} className="flex-shrink-0" />
          <span className="truncate">{payload.value}</span>
        </div>
      </foreignObject>
    </g>
  );
};

const getSystemMetrics = (activityId: string) => {
  let currentContext = 10;
  return Array.from({ length: 20 }).map((_, i) => {
    if (i > 0 && i % 6 === 0) {
      currentContext = Math.max(5, currentContext * 0.4); // Compact context
    } else {
      currentContext += 2 + Math.random() * 5;
    }
    return {
      time: `T${i * 5}`,
      cpu: 20 + Math.sin(i + activityId.length) * 15 + Math.random() * 10,
      memory: 40 + Math.cos(i + activityId.length) * 20 + Math.random() * 5,
      context: currentContext,
    };
  });
};

export default function BottomPanel({
  selectedAgentId,
  selectedActivityId,
  agents,
  snapshots,
  events,
  activityWindows,
  currentTime,
  onClose,
}: BottomPanelProps) {
  if (!selectedAgentId && !selectedActivityId) {
    return null;
  }

  const agent = agents.find((a) => a.id === selectedAgentId);
  const snap = snapshots.find((s) => s.id === selectedAgentId);
  const activity = activityWindows.find((w) => w.id === selectedActivityId);

  const capabilities = useMemo(() => (agent ? getAgentCapabilities(agent) : []), [agent]);
  const toolUsage = useMemo(() => (activity ? getToolUsage(activity.id) : []), [activity]);
  const systemMetrics = useMemo(() => (activity ? getSystemMetrics(activity.id) : []), [activity]);

  return (
    <div className="h-[40vh] min-h-[320px] max-h-[60vh] border-t border-zinc-800/50 bg-[#0f0f0f] flex flex-col flex-shrink-0">
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
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex gap-6">
        {selectedActivityId && activity && agent ? (
          // Runtime Info
          <div className="flex-1 flex flex-col xl:flex-row gap-6 overflow-y-auto xl:overflow-y-hidden">
            {/* Column 1: Identity, Summary, Tasks */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-zinc-500 font-mono mb-1">AGENT</div>
                  <div className="text-sm text-zinc-200 flex items-center gap-2">
                    {agent.name}
                    {agent.workspace && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 flex items-center gap-1">
                        <WorkspaceIcon workspace={agent.workspace} size={10} />
                        {agent.workspace}
                      </span>
                    )}
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
                  <span className="flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50">
                    <Terminal size={12} className="text-zinc-400" /> Terminal
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50">
                    <Code size={12} className="text-blue-400" /> VS Code
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50">
                    <Globe size={12} className="text-emerald-400" /> Browser
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2">SEGMENT SUMMARY</div>
                <div className="text-sm text-zinc-300 leading-relaxed bg-zinc-800/30 p-3 rounded border border-zinc-800/50">
                  Analyzed user request, gathered context from the codebase, and drafted an initial
                  response plan for the new feature implementation.
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2">TASKS & COMPLETION</div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Analyze user request and gather context</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Draft initial response plan</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-zinc-300">
                    <Circle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>Execute code modifications</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Output Artifacts */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-4">
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-2 flex items-center gap-2">
                  <FileText size={12} /> OUTPUT & ARTIFACTS
                </div>
                <div className="space-y-3">
                  <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
                      <FileText size={14} className="text-blue-400" /> Update README.md
                    </div>
                    <div className="text-xs text-zinc-500">
                      Added installation instructions and API usage examples.
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                        +45 LoC
                      </span>
                      <span className="text-rose-400 bg-rose-400/10 px-1.5 py-0.5 rounded border border-rose-400/20">
                        -12 LoC
                      </span>
                    </div>
                  </div>
                  <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
                      <Mail size={14} className="text-purple-400" /> Status Update Email
                    </div>
                    <div className="text-xs text-zinc-500">To: engineering@company.com</div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                        +1 Email
                      </span>
                    </div>
                  </div>
                  <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
                      <Code size={14} className="text-emerald-400" /> src/utils/auth.ts
                    </div>
                    <div className="text-xs text-zinc-500">Refactored JWT validation logic.</div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                        +128 LoC
                      </span>
                      <span className="text-rose-400 bg-rose-400/10 px-1.5 py-0.5 rounded border border-rose-400/20">
                        -42 LoC
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Tool Usage */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-2 h-full">
              <div className="text-xs text-zinc-500 font-mono mb-1">TOOL USAGE DISTRIBUTION</div>
              <div className="flex-1 w-full bg-zinc-800/20 rounded-lg p-2 border border-zinc-800/50 min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={toolUsage}
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

            {/* Column 4: System Metrics */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-3 h-full">
              <div className="flex-1 flex flex-col">
                <div className="text-xs text-zinc-500 font-mono mb-1 flex items-center gap-2">
                  <Cpu size={12} /> SYSTEM MONITORING
                </div>
                <div className="flex-1 w-full bg-zinc-800/20 rounded-lg p-2 border border-zinc-800/50 min-h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={systemMetrics}
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
                      data={systemMetrics}
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
        ) : agent ? (
          // Agent Config
          <div className="flex-1 flex flex-col xl:flex-row gap-6 overflow-y-auto xl:overflow-y-hidden">
            {/* Column 1: Basic Info & Service Scope */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-6">
              <div>
                <div className="text-xs text-zinc-500 font-mono mb-1">NAME & ROLE</div>
                <div className="text-sm text-zinc-200 flex items-center gap-2">
                  {agent.name} - {agent.role}
                  {agent.workspace && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 flex items-center gap-1">
                      <WorkspaceIcon workspace={agent.workspace} size={12} />
                      {agent.workspace}
                    </span>
                  )}
                </div>
              </div>

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
                  <div className="flex items-center justify-between bg-zinc-900/50 p-2 rounded border border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-emerald-400" />
                      <div>
                        <div className="text-xs text-zinc-200">Internal APIs</div>
                        <div className="text-[10px] text-zinc-500">
                          Full read/write access to internal microservices
                        </div>
                      </div>
                    </div>
                    <div className="w-8 h-4 bg-emerald-500/20 rounded-full flex items-center p-0.5 border border-emerald-500/30 cursor-pointer">
                      <div className="w-3 h-3 bg-emerald-400 rounded-full translate-x-4"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/50 p-2 rounded border border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <Cloud size={14} className="text-amber-400" />
                      <div>
                        <div className="text-xs text-zinc-200">External Web</div>
                        <div className="text-[10px] text-zinc-500">
                          Read-only access to public internet
                        </div>
                      </div>
                    </div>
                    <div className="w-8 h-4 bg-amber-500/20 rounded-full flex items-center p-0.5 border border-amber-500/30 cursor-pointer">
                      <div className="w-3 h-3 bg-amber-400 rounded-full translate-x-4"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: File Access Scope */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-6">
              <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3 h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-400" /> FILE ACCESS SCOPE
                  </div>
                  <button className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 transition-colors">
                    Modify
                  </button>
                </div>
                <div className="bg-zinc-900/80 rounded border border-zinc-800/80 p-2 font-mono text-xs text-zinc-300 space-y-1.5 overflow-x-auto flex-1">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Folder size={12} className="fill-emerald-400/20" /> src/
                  </div>
                  <div className="flex items-center gap-1.5 pl-4 text-emerald-400">
                    <Folder size={12} className="fill-emerald-400/20" /> components/{" "}
                    <span className="text-[9px] ml-2 text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/10 px-1 rounded">
                      R/W
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-4 text-zinc-500">
                    <Folder size={12} /> utils/{" "}
                    <span className="text-[9px] ml-2 text-zinc-600 border border-zinc-700 px-1 rounded">
                      No Access
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Folder size={12} className="fill-amber-400/20" /> config/{" "}
                    <span className="text-[9px] ml-2 text-amber-500/70 border border-amber-500/20 bg-amber-500/10 px-1 rounded">
                      Read Only
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <File size={12} /> package.json{" "}
                    <span className="text-[9px] ml-2 text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/10 px-1 rounded">
                      R/W
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Radar Chart */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col items-center justify-start">
              <div className="text-xs text-zinc-500 font-mono mb-2 w-full text-left">
                AGENT CAPABILITIES
              </div>
              <div className="w-full h-64 bg-zinc-800/20 rounded-lg border border-zinc-800/50 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={capabilities}>
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

            {/* Column 4: Skills & Tools */}
            <div className="w-full xl:w-0 xl:flex-1 flex flex-col gap-6">
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
                  <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal size={14} className="text-zinc-400" />
                      <span className="text-xs text-zinc-300 font-medium">Shell Execution</span>
                    </div>
                    <select className="bg-zinc-800 text-[10px] text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 outline-none focus:border-emerald-500 cursor-pointer">
                      <option>Allowed</option>
                      <option>Ask First</option>
                      <option>Denied</option>
                    </select>
                  </div>
                  <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-zinc-400" />
                      <span className="text-xs text-zinc-300 font-medium">Database Query</span>
                    </div>
                    <select className="bg-zinc-800 text-[10px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 outline-none focus:border-amber-500 cursor-pointer">
                      <option>Ask First</option>
                      <option>Allowed</option>
                      <option>Denied</option>
                    </select>
                  </div>
                  <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-zinc-400" />
                      <span className="text-xs text-zinc-300 font-medium">Web Browsing</span>
                    </div>
                    <select className="bg-zinc-800 text-[10px] text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 outline-none focus:border-emerald-500 cursor-pointer">
                      <option>Allowed</option>
                      <option>Ask First</option>
                      <option>Denied</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
