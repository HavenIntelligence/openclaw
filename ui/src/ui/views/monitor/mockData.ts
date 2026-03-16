import type { TaskSessionData, AgentRuntimeConfig, AgentTelemetry } from "./types";

// ── Default fallbacks ───────────────────────────────────────────────────

const defaultAgentConfig: AgentRuntimeConfig = {
  capabilities: [
    { subject: "Reasoning", value: 75 },
    { subject: "Coding", value: 60 },
    { subject: "Communication", value: 70 },
    { subject: "Data Analysis", value: 55 },
    { subject: "Planning", value: 80 },
  ],
  serviceAccess: [
    {
      name: "Internal APIs",
      description: "Full read/write access to internal microservices",
      icon: "Server",
      iconColor: "text-emerald-400",
      enabled: true,
    },
    {
      name: "External Web",
      description: "Read-only access to public internet",
      icon: "Cloud",
      iconColor: "text-amber-400",
      enabled: true,
    },
  ],
  fileAccess: [
    { path: "src/", isFolder: true, indent: 0, access: "rw" },
    { path: "components/", isFolder: true, indent: 1, access: "rw" },
    { path: "utils/", isFolder: true, indent: 1, access: "none" },
    { path: "config/", isFolder: true, indent: 0, access: "readonly" },
    { path: "package.json", isFolder: false, indent: 0, access: "rw" },
  ],
  toolPermissions: [
    { name: "Shell Execution", icon: "Terminal", level: "allowed" },
    { name: "Database Query", icon: "Database", level: "ask" },
    { name: "Web Browsing", icon: "Globe", level: "allowed" },
  ],
};

const defaultAgentTelemetry: AgentTelemetry = {
  platforms: [
    { name: "Terminal", icon: "Terminal", iconColor: "text-zinc-400" },
    { name: "VS Code", icon: "Code", iconColor: "text-blue-400" },
    { name: "Browser", icon: "Globe", iconColor: "text-emerald-400" },
  ],
  summary:
    "Analyzed user request, gathered context from the codebase, and drafted an initial response plan for the new feature implementation.",
  tasks: [
    { id: "t1", label: "Analyze user request and gather context", completed: true },
    { id: "t2", label: "Draft initial response plan", completed: true },
    { id: "t3", label: "Execute code modifications", completed: false },
  ],
  artifacts: [
    {
      id: "art-1",
      title: "Update README.md",
      description: "Added installation instructions and API usage examples.",
      icon: "FileText",
      iconColor: "text-blue-400",
      additions: 45,
      deletions: 12,
      additionUnit: "LoC",
    },
    {
      id: "art-2",
      title: "Status Update Email",
      description: "To: engineering@company.com",
      icon: "Mail",
      iconColor: "text-purple-400",
      additions: 1,
      additionUnit: "Email",
    },
    {
      id: "art-3",
      title: "src/utils/auth.ts",
      description: "Refactored JWT validation logic.",
      icon: "Code",
      iconColor: "text-emerald-400",
      additions: 128,
      deletions: 42,
      additionUnit: "LoC",
    },
  ],
  toolUsage: [
    { name: "API Call", icon: "Cloud", count: 18 },
    { name: "Web Search", icon: "Globe", count: 14 },
    { name: "Linter", icon: "Shield", count: 11 },
    { name: "Read File", icon: "FileText", count: 10 },
    { name: "DB Query", icon: "Database", count: 7 },
    { name: "Execute Cmd", icon: "Terminal", count: 6 },
    { name: "Write File", icon: "Code", count: 4 },
    { name: "Git Commit", icon: "File", count: 3 },
  ],
  systemMetrics: Array.from({ length: 20 }).map((_, i) => ({
    time: `T${i * 5}`,
    cpu: 20 + Math.sin(i) * 15 + 10,
    memory: 40 + Math.cos(i) * 20 + 5,
    context: Math.min(100, 10 + i * 4.5),
  })),
};

// ── The single mock task session ────────────────────────────────────────

export const mockTaskSession: TaskSessionData = {
  id: "ts-1",
  name: "Data Aggregation Pipeline",
  description: "End-to-end build and deploy of the data aggregation pipeline.",
  startTime: 0,
  endTime: null,

  agents: [
    {
      id: "a1",
      name: "Orchestrator",
      role: "Mission Control",
      domain: "Management",
      skills: ["Planning", "Routing"],
      lifecycle: "persistent",
    },
    {
      id: "a2",
      name: "Frontend Lead",
      role: "UI Systems",
      parentId: "a1",
      domain: "Frontend",
      skills: ["React", "Design Systems"],
      lifecycle: "persistent",
      workspace: "Browser",
    },
    {
      id: "a3",
      name: "Backend Lead",
      role: "API Systems",
      parentId: "a1",
      domain: "Backend",
      skills: ["Node.js", "Contracts"],
      lifecycle: "persistent",
      workspace: "Postgres",
    },
    {
      id: "a4",
      name: "Research Scout",
      role: "Context Fetcher",
      parentId: "a3",
      domain: "Research",
      skills: ["Docs", "Tracing"],
      lifecycle: "ephemeral",
      workspace: "Notion",
    },
    {
      id: "a5",
      name: "Crash Analyzer",
      role: "Recovery Branch",
      parentId: "a2",
      domain: "Frontend",
      skills: ["Debugging", "Fallbacks"],
      lifecycle: "ephemeral",
      workspace: "Sentry",
    },
    {
      id: "a6",
      name: "QA Runner",
      role: "Regression Sweep",
      parentId: "a1",
      domain: "Testing",
      skills: ["E2E", "Verification"],
      lifecycle: "contract",
      workspace: "Staging",
    },
    {
      id: "a7",
      name: "Release Manager",
      role: "Launch Coordinator",
      parentId: "a1",
      domain: "Management",
      skills: ["Approvals", "Rollouts"],
      lifecycle: "contract",
      workspace: "GitHub",
    },
  ],

  events: [
    { id: "e1", agentId: "a1", timestamp: 0, type: "spawn" },
    { id: "e2", agentId: "a1", timestamp: 4, type: "start" },
    { id: "e3", agentId: "a1", timestamp: 14, type: "split", targetId: "a2" },
    { id: "e4", agentId: "a2", timestamp: 14, type: "spawn" },
    { id: "e5", agentId: "a1", timestamp: 18, type: "split", targetId: "a3" },
    { id: "e6", agentId: "a3", timestamp: 18, type: "spawn" },
    { id: "e7", agentId: "a2", timestamp: 20, type: "start" },
    { id: "e8", agentId: "a3", timestamp: 24, type: "start" },
    { id: "e9", agentId: "a3", timestamp: 52, type: "split", targetId: "a4" },
    { id: "e10", agentId: "a4", timestamp: 52, type: "spawn" },
    { id: "e11", agentId: "a4", timestamp: 58, type: "start" },
    { id: "e12", agentId: "a4", timestamp: 82, type: "merge", targetId: "a3" },
    { id: "e13", agentId: "a4", timestamp: 84, type: "archive" },
    { id: "e14", agentId: "a2", timestamp: 96, type: "pause", details: "Waiting on API contract" },
    { id: "e15", agentId: "a3", timestamp: 100, type: "handoff", targetId: "a2" },
    { id: "e16", agentId: "a2", timestamp: 104, type: "resume" },
    { id: "e17", agentId: "a2", timestamp: 118, type: "error", details: "Token refresh loop" },
    { id: "e18", agentId: "a2", timestamp: 124, type: "split", targetId: "a5" },
    { id: "e19", agentId: "a5", timestamp: 124, type: "spawn" },
    { id: "e20", agentId: "a5", timestamp: 130, type: "start" },
    { id: "e21", agentId: "a5", timestamp: 150, type: "merge", targetId: "a2" },
    { id: "e22", agentId: "a5", timestamp: 152, type: "archive" },
    { id: "e23", agentId: "a2", timestamp: 156, type: "resume" },
    { id: "e24", agentId: "a1", timestamp: 168, type: "split", targetId: "a6" },
    { id: "e25", agentId: "a6", timestamp: 168, type: "spawn" },
    { id: "e26", agentId: "a6", timestamp: 174, type: "start" },
    { id: "e27", agentId: "a6", timestamp: 196, type: "merge", targetId: "a1" },
    { id: "e28", agentId: "a6", timestamp: 198, type: "archive" },
    { id: "e29", agentId: "a1", timestamp: 206, type: "split", targetId: "a7" },
    { id: "e30", agentId: "a7", timestamp: 206, type: "spawn" },
    { id: "e31", agentId: "a7", timestamp: 212, type: "start" },
    { id: "e32", agentId: "a2", timestamp: 220, type: "pause", details: "Ready for release" },
    { id: "e33", agentId: "a3", timestamp: 220, type: "pause", details: "Ready for release" },
    { id: "e34", agentId: "a7", timestamp: 230, type: "merge", targetId: "a1" },
    { id: "e35", agentId: "a7", timestamp: 232, type: "archive" },
    { id: "e36", agentId: "a1", timestamp: 236, type: "pause", details: "Awaiting approval" },
  ],

  annotations: [
    {
      id: "ann-1",
      timestamp: 18,
      agentId: "a1",
      type: "dispatch",
      title: "Primary Branches Opened",
      description:
        "The orchestrator fans out into frontend and backend tracks to keep the main flow readable.",
    },
    {
      id: "ann-2",
      timestamp: 58,
      agentId: "a4",
      type: "insight",
      title: "Research Spike",
      description:
        "A short-lived scout branch validates backend assumptions, then folds back quickly.",
    },
    {
      id: "ann-3",
      timestamp: 118,
      agentId: "a2",
      type: "bottleneck",
      title: "Frontend Blocked",
      description: "The primary UI lane hits an auth loop and needs a focused recovery branch.",
      placement: "bottom",
    },
    {
      id: "ann-4",
      timestamp: 124,
      agentId: "a2",
      type: "decision",
      title: "Recovery Spawned",
      description:
        "The crash analyzer is dispatched as a single-purpose branch instead of adding more parallel workers.",
    },
    {
      id: "ann-5",
      timestamp: 174,
      agentId: "a6",
      type: "dispatch",
      title: "Regression Sweep",
      description:
        "A single QA lane verifies the release path after the critical UI issue is resolved.",
    },
    {
      id: "ann-6",
      timestamp: 230,
      agentId: "a1",
      type: "decision",
      title: "Release Package Ready",
      description:
        "The monitor now converges back to one final approval lane instead of several late-stage branches.",
    },
  ],

  agentConfigs: {
    a1: {
      capabilities: [
        { subject: "Reasoning", value: 82 },
        { subject: "Coding", value: 65 },
        { subject: "Communication", value: 73 },
        { subject: "Data Analysis", value: 60 },
        { subject: "Planning", value: 83 },
      ],
      serviceAccess: [
        {
          name: "Internal APIs",
          description: "Full read/write access to internal microservices",
          icon: "Server",
          iconColor: "text-emerald-400",
          enabled: true,
        },
        {
          name: "External Web",
          description: "Read-only access to public internet",
          icon: "Cloud",
          iconColor: "text-amber-400",
          enabled: true,
        },
      ],
      fileAccess: [
        { path: "src/", isFolder: true, indent: 0, access: "rw" },
        { path: "components/", isFolder: true, indent: 1, access: "rw" },
        { path: "utils/", isFolder: true, indent: 1, access: "none" },
        { path: "config/", isFolder: true, indent: 0, access: "readonly" },
        { path: "package.json", isFolder: false, indent: 0, access: "rw" },
      ],
      toolPermissions: [
        { name: "Shell Execution", icon: "Terminal", level: "allowed" },
        { name: "Database Query", icon: "Database", level: "ask" },
        { name: "Web Browsing", icon: "Globe", level: "allowed" },
      ],
    },
    a2: {
      capabilities: [
        { subject: "Reasoning", value: 82 },
        { subject: "Coding", value: 90 },
        { subject: "Communication", value: 76 },
        { subject: "Data Analysis", value: 55 },
        { subject: "Planning", value: 70 },
      ],
      serviceAccess: [
        {
          name: "Internal APIs",
          description: "Full read/write access to internal microservices",
          icon: "Server",
          iconColor: "text-emerald-400",
          enabled: true,
        },
        {
          name: "External Web",
          description: "Read-only access to public internet",
          icon: "Cloud",
          iconColor: "text-amber-400",
          enabled: true,
        },
      ],
      fileAccess: [
        { path: "src/", isFolder: true, indent: 0, access: "rw" },
        { path: "components/", isFolder: true, indent: 1, access: "rw" },
        { path: "styles/", isFolder: true, indent: 1, access: "rw" },
        { path: "config/", isFolder: true, indent: 0, access: "readonly" },
        { path: "package.json", isFolder: false, indent: 0, access: "rw" },
      ],
      toolPermissions: [
        { name: "Shell Execution", icon: "Terminal", level: "allowed" },
        { name: "Database Query", icon: "Database", level: "denied" },
        { name: "Web Browsing", icon: "Globe", level: "allowed" },
      ],
    },
  },

  agentTelemetry: {
    a1: defaultAgentTelemetry,
    a2: defaultAgentTelemetry,
    a3: defaultAgentTelemetry,
    a4: defaultAgentTelemetry,
    a5: defaultAgentTelemetry,
    a6: defaultAgentTelemetry,
    a7: defaultAgentTelemetry,
  },

  metrics: {
    avgLatency: "245ms",
    totalTokens: 52,
    bottleneckCount: 1,
  },

  chatMessages: [
    {
      id: "msg-1",
      role: "user",
      content: "Dispatch an agent to investigate the memory leak in the payment service.",
    },
    {
      id: "msg-2",
      role: "assistant",
      content:
        'Agent <span class="text-emerald-400 font-mono">Debugger-01</span> dispatched to <span class="text-blue-400 font-mono">payment-service</span>.<br/><span class="text-zinc-500 mt-1 block text-xs">Estimated time to initial report: 2m.</span>',
    },
    {
      id: "msg-3",
      role: "user",
      content: "Update schedule for Data-Processor to run every hour instead of every 6 hours.",
    },
    {
      id: "msg-4",
      role: "assistant",
      content:
        'Schedule updated for <span class="text-emerald-400 font-mono">Data-Processor</span>.<br/><span class="text-zinc-500 mt-1 block text-xs">Next run scheduled at T+60m.</span>',
    },
  ],
};

// ── Convenience accessors (used by components during mock phase) ─────────

export const mockTimelineEnd = 250;

export function getMockAgentConfig(agentId: string): AgentRuntimeConfig {
  return mockTaskSession.agentConfigs[agentId] ?? defaultAgentConfig;
}

export function getMockAgentTelemetry(agentId: string): AgentTelemetry {
  return mockTaskSession.agentTelemetry[agentId] ?? defaultAgentTelemetry;
}

// Re-exports for components that still reference these directly
export const mockAgents = mockTaskSession.agents;
export const mockEvents = mockTaskSession.events;
export const mockAnnotations = mockTaskSession.annotations;
export const mockTaskSessionData = mockTaskSession;
