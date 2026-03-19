/**
 * Monitor server methods — reads JSONL session transcripts and builds
 * TaskSessionData objects for the Monitor dashboard.
 *
 * Non-invasive: purely reads existing files, no DB changes.
 *
 * Key insight: subagent sessions (runtime="subagent") do NOT create independent
 * JSONL files. Their lifecycle is embedded in the parent session's JSONL as
 * toolResult messages containing childSessionKey, yield/interrupt custom messages.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { resolveAgentConfig } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/io.js";
import { resolveStateDir } from "../../config/paths.js";
import {
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptsDirForAgent,
} from "../../config/sessions/paths.js";
import { loadSessionStore } from "../../config/sessions/store.js";
import type { GatewayRequestHandlers } from "./types.js";

// ── Build real AgentRuntimeConfig from openclaw.json + agent-meta ───────

interface MonitorAgentRuntimeConfig {
  capabilities: { subject: string; value: number }[];
  serviceAccess: {
    name: string;
    description: string;
    icon: string;
    iconColor: string;
    enabled: boolean;
  }[];
  fileAccess: {
    path: string;
    isFolder: boolean;
    indent: number;
    access: "rw" | "readonly" | "none";
  }[];
  toolPermissions: {
    name: string;
    icon: string;
    level: "allowed" | "ask" | "denied";
  }[];
}

function buildRealAgentConfig(agentId: string): MonitorAgentRuntimeConfig | null {
  try {
    const cfg = loadConfig();
    const agentCfg = resolveAgentConfig(cfg, agentId);
    console.log(
      `[monitor] buildRealAgentConfig("${agentId}"):`,
      agentCfg ? "found" : "NOT FOUND",
      "agents in config:",
      (cfg.agents?.list ?? []).map((a: { id?: string }) => a?.id).join(", "),
    );

    const tools = agentCfg?.tools;
    const exec = tools?.exec;
    const fs = tools?.fs;
    const profile = tools?.profile ?? "full";
    const allowList = tools?.allow ?? [];
    const denyList = tools?.deny ?? [];

    // ── Tool Permissions (from exec config) ──
    const execSecurity = exec?.security ?? "deny";
    const execAsk = exec?.ask ?? "on-miss";
    const shellLevel: "allowed" | "ask" | "denied" =
      execSecurity === "full"
        ? "allowed"
        : execSecurity === "allowlist"
          ? execAsk === "off"
            ? "allowed"
            : "ask"
          : "denied";

    const hasWebSearch = !denyList.includes("web_search");
    const hasWebFetch = !denyList.includes("web_fetch");
    const hasDbQuery = !denyList.includes("database_query");

    const toolPermissions = [
      { name: "Shell Execution", icon: "Terminal", level: shellLevel },
      {
        name: "Web Browsing",
        icon: "Globe",
        level: hasWebSearch || hasWebFetch ? "allowed" : "denied",
      },
      {
        name: "Database Query",
        icon: "Database",
        level: hasDbQuery ? "ask" : "denied",
      },
    ];

    // ── Service Access (from tools allow/deny) ──
    const serviceAccess = [
      {
        name: "Internal APIs",
        description: "Agent-to-agent messaging and task delegation",
        icon: "Server",
        iconColor: "text-emerald-400",
        enabled: profile === "full" || allowList.includes("sessions_spawn"),
      },
      {
        name: "External Web",
        description: hasWebSearch
          ? "Search + fetch enabled"
          : hasWebFetch
            ? "Fetch only"
            : "Disabled",
        icon: "Cloud",
        iconColor: "text-amber-400",
        enabled: hasWebSearch || hasWebFetch,
      },
    ];

    // ── File Access (from workspace + fs config) ──
    const workspace = agentCfg?.workspace;
    const workspaceOnly = fs?.workspaceOnly ?? false;
    const fileAccess = workspace
      ? [
          {
            path: workspace.replace(/^.*\//, "") + "/",
            isFolder: true,
            indent: 0,
            access: "rw" as const,
          },
          ...(workspaceOnly
            ? [{ path: "(other paths)", isFolder: false, indent: 0, access: "none" as const }]
            : [{ path: "(system-wide)", isFolder: false, indent: 0, access: "readonly" as const }]),
        ]
      : [{ path: "(default workspace)", isFolder: true, indent: 0, access: "rw" as const }];

    // ── Capabilities (derived from profile + model) ──
    const model = typeof agentCfg?.model === "string" ? agentCfg.model : "";
    const isHighEnd = model.includes("opus") || model.includes("sonnet");
    const isCoding = profile === "coding" || profile === "full";
    const base = isHighEnd ? 80 : 60;

    const capabilities = [
      { subject: "Reasoning", value: Math.min(100, base + (isHighEnd ? 10 : 0)) },
      { subject: "Coding", value: Math.min(100, base + (isCoding ? 15 : -10)) },
      { subject: "Communication", value: Math.min(100, base + 5) },
      { subject: "Data Analysis", value: Math.min(100, base - 5) },
      { subject: "Planning", value: Math.min(100, base + (isHighEnd ? 10 : 0)) },
    ];

    return { capabilities, serviceAccess, fileAccess, toolPermissions };
  } catch {
    return null;
  }
}

// ── Wire types ──────────────────────────────────────────────────────────

interface MonitorAgent {
  id: string;
  name: string;
  role: string;
  parentId?: string;
  domain: string;
  skills: string[];
  lifecycle: "persistent" | "ephemeral" | "contract";
  workspace?: string;
}

interface MonitorEvent {
  id: string;
  agentId: string;
  timestamp: number;
  type: string;
  targetId?: string;
  details?: string;
}

interface MonitorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentId?: string;
  agentName?: string;
  /** Seconds offset from session start (for timeline-synced playback). */
  ts?: number;
}

interface MonitorToolUsage {
  name: string;
  icon: string;
  count: number;
}

interface MonitorTaskSession {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime: number | null;
  maxTime: number;
  agents: MonitorAgent[];
  events: MonitorEvent[];
  annotations: unknown[];
  agentConfigs: Record<string, unknown>;
  agentTelemetry: Record<
    string,
    {
      platforms: { name: string; icon: string; iconColor: string }[];
      summary: string;
      tasks: unknown[];
      artifacts: unknown[];
      toolUsage: MonitorToolUsage[];
      systemMetrics: unknown[];
    }
  >;
  metrics: { avgLatency: string; totalTokens: number; bottleneckCount: number };
  chatMessages: MonitorChatMessage[];
}

interface TaskSessionSummary {
  id: string;
  name: string;
  startTime: number;
  endTime: number | null;
  agentCount: number;
  eventCount: number;
}

// ── Parsed JSONL types ──────────────────────────────────────────────────

interface ParsedMessage {
  role: string;
  timestamp: number;
  content: string;
  usage?: { totalTokens?: number; cost?: { total?: number } };
  durationMs?: number;
  stopReason?: string;
  model?: string;
  toolNames?: string[];
  toolCalls?: { name: string; filePath?: string }[];
}

interface SubagentSpawn {
  childSessionKey: string;
  agentId: string;
  task: string;
  spawnTimestamp: number;
  completeTimestamp?: number;
}

interface YieldEvent {
  timestamp: number;
  message: string;
}

interface ParsedSession {
  sessionHeader: { id?: string; timestamp?: string; cwd?: string } | null;
  messages: ParsedMessage[];
  subagentSpawns: SubagentSpawn[];
  yieldEvents: YieldEvent[];
  yieldInterrupts: { timestamp: number }[];
}

// ── JSONL parsing ───────────────────────────────────────────────────────

function parseTimestamp(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return new Date(value).getTime();
  }
  return 0;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block) {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractToolNames(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const names: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block) {
      const b = block as Record<string, unknown>;
      if ((b.type === "tool_use" || b.type === "toolCall") && typeof b.name === "string") {
        names.push(b.name);
      }
    }
  }
  return names;
}

function extractToolCalls(content: unknown): { name: string; filePath?: string }[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const calls: { name: string; filePath?: string }[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block) {
      const b = block as Record<string, unknown>;
      if ((b.type === "tool_use" || b.type === "toolCall") && typeof b.name === "string") {
        // tool_use uses "input", toolCall uses "arguments"
        const input = (b.input ?? b.arguments) as Record<string, unknown> | undefined;
        const filePath = (input?.file_path ?? input?.path) as string | undefined;
        calls.push({ name: b.name, filePath: filePath || undefined });
      }
    }
  }
  return calls;
}

/** Extract agentId from "agent:<agentId>:subagent:<uuid>" */
function agentIdFromSessionKey(key: string): string {
  const parts = key.split(":");
  return parts.length >= 2 && parts[0] === "agent" ? parts[1] : "unknown";
}

async function parseJsonlFile(filePath: string): Promise<ParsedSession> {
  const messages: ParsedMessage[] = [];
  const subagentSpawns: SubagentSpawn[] = [];
  const yieldEvents: YieldEvent[] = [];
  const yieldInterrupts: { timestamp: number }[] = [];
  let sessionHeader: ParsedSession["sessionHeader"] = null;

  // Track pending spawn results to match childSessionKey to timestamps
  const pendingSpawnKeys = new Set<string>();

  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = obj.type as string | undefined;

      // ── Session header ──
      if (type === "session") {
        sessionHeader = {
          id: obj.id as string | undefined,
          timestamp: obj.timestamp as string | undefined,
          cwd: obj.cwd as string | undefined,
        };
        continue;
      }

      // ── Custom messages: yield / yield_interrupt ──
      if (type === "custom_message") {
        const customType = obj.customType as string | undefined;
        const ts = parseTimestamp(obj.timestamp);

        if (customType === "openclaw.sessions_yield" && ts) {
          const content = obj.content as string | undefined;
          yieldEvents.push({ timestamp: ts, message: content?.slice(0, 100) || "" });
        } else if (customType === "openclaw.sessions_yield_interrupt" && ts) {
          yieldInterrupts.push({ timestamp: ts });
        }
        continue;
      }

      if (type !== "message") {
        continue;
      }

      const msg = obj.message as Record<string, unknown> | undefined;
      if (!msg) {
        continue;
      }

      const role = msg.role as string;
      const timestamp = msg.timestamp as number | undefined;
      if (!timestamp) {
        continue;
      }

      const content = msg.content;
      const contentText = extractTextContent(content);

      // ── Detect subagent spawns from toolResult ──
      if (role === "toolResult") {
        // Try to parse as spawn result JSON
        const text = contentText || (typeof content === "string" ? content : "");
        if (text.includes("childSessionKey") && text.includes("accepted")) {
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            if (parsed.status === "accepted" && typeof parsed.childSessionKey === "string") {
              const childKey = parsed.childSessionKey;
              const agentId = agentIdFromSessionKey(childKey);
              subagentSpawns.push({
                childSessionKey: childKey,
                agentId,
                task: "",
                spawnTimestamp: timestamp,
              });
              pendingSpawnKeys.add(childKey);
            }
          } catch {
            /* not valid JSON */
          }
        }
      }

      // ── Detect subagent completion from user messages with provenance ──
      if (role === "user") {
        const provenance = msg.provenance as Record<string, unknown> | undefined;
        const sourceKey = provenance?.sourceSessionKey as string | undefined;
        if (sourceKey && pendingSpawnKeys.has(sourceKey)) {
          const spawn = subagentSpawns.find(
            (s) => s.childSessionKey === sourceKey && !s.completeTimestamp,
          );
          if (spawn) {
            spawn.completeTimestamp = timestamp;
            pendingSpawnKeys.delete(sourceKey);
          }
        }
      }

      // ── Standard message parsing ──
      if (["user", "assistant", "toolResult"].includes(role)) {
        const toolCalls = extractToolCalls(content);
        const toolNames =
          toolCalls.length > 0 ? toolCalls.map((tc) => tc.name) : extractToolNames(content);
        messages.push({
          role,
          timestamp,
          content: contentText.slice(0, 8000),
          usage: msg.usage as ParsedMessage["usage"],
          durationMs: msg.durationMs as number | undefined,
          stopReason: msg.stopReason as string | undefined,
          model: msg.model as string | undefined,
          toolNames: toolNames.length > 0 ? toolNames : undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
    }
  } finally {
    rl.close();
    fileStream.destroy();
  }

  // For spawns that never got a completion, estimate from yield_interrupt timing
  for (const spawn of subagentSpawns) {
    if (spawn.completeTimestamp) {
      continue;
    }
    // Find the next yield_interrupt after spawn time
    const nextInterrupt = yieldInterrupts.find((yi) => yi.timestamp > spawn.spawnTimestamp);
    if (nextInterrupt) {
      spawn.completeTimestamp = nextInterrupt.timestamp;
    }
  }

  return { sessionHeader, messages, subagentSpawns, yieldEvents, yieldInterrupts };
}

// ── Build TaskSession from a single session with embedded subagent data ─

const TOOL_ICON_MAP: Record<string, string> = {
  bash: "Terminal",
  read: "FileText",
  read_file: "FileText",
  write: "Code",
  write_file: "Code",
  edit: "Code",
  edit_file: "Code",
  grep: "Globe",
  glob: "Folder",
  agent: "Activity",
  web_search: "Globe",
  web_fetch: "Globe",
  sessions_spawn: "Activity",
  sessions_list: "Activity",
  sessions_yield: "Activity",
};

const TOOL_DISPLAY_MAP: Record<string, string> = {
  bash: "Shell",
  read: "Read File",
  read_file: "Read File",
  write: "Write File",
  write_file: "Write File",
  edit: "Edit File",
  edit_file: "Edit File",
  grep: "Search",
  glob: "Find Files",
  agent: "Sub-Agent",
  web_search: "Web Search",
  web_fetch: "Web Fetch",
  sessions_spawn: "Spawn Agent",
  sessions_list: "List Sessions",
  sessions_yield: "Yield",
};

function derivePlatforms(
  toolCounts: Map<string, number>,
): { name: string; icon: string; iconColor: string }[] {
  const platforms: { name: string; icon: string; iconColor: string }[] = [];
  const has = (...names: string[]) => names.some((n) => toolCounts.has(n));

  if (has("bash")) {
    platforms.push({ name: "Terminal", icon: "Terminal", iconColor: "text-zinc-400" });
  }
  if (has("read", "write", "edit", "read_file", "write_file", "edit_file", "grep", "glob")) {
    platforms.push({ name: "IDE / Editor", icon: "Code", iconColor: "text-blue-400" });
  }
  if (has("web_search", "web_fetch")) {
    platforms.push({ name: "Browser", icon: "Globe", iconColor: "text-emerald-400" });
  }
  if (has("agent", "sessions_spawn")) {
    platforms.push({ name: "Agent System", icon: "Activity", iconColor: "text-purple-400" });
  }
  if (platforms.length === 0) {
    platforms.push({ name: "Terminal", icon: "Terminal", iconColor: "text-zinc-400" });
  }

  return platforms;
}

function buildTaskSession(
  parsed: ParsedSession & {
    agentId: string;
    agentName: string;
    sessionId: string;
  },
): MonitorTaskSession | null {
  const { messages, subagentSpawns } = parsed;

  const allTimestamps = messages.map((m) => m.timestamp);
  if (allTimestamps.length === 0) {
    return null;
  }

  const globalStart = Math.min(...allTimestamps);
  const globalEnd = Math.max(...allTimestamps);
  const durationSec = Math.ceil((globalEnd - globalStart) / 1000);
  const offsetSec = (ts: number) => Math.max(0, Math.floor((ts - globalStart) / 1000));

  const hasSubagents = subagentSpawns.length > 0;
  const orchestratorLaneId = parsed.sessionId;

  // ── Build agent lanes ──
  const agents: MonitorAgent[] = [];

  // Orchestrator / main agent lane (always persistent)
  agents.push({
    id: orchestratorLaneId,
    name: parsed.agentName,
    role: hasSubagents ? "Orchestrator" : "Agent",
    domain: parsed.agentId,
    skills: [],
    lifecycle: "persistent",
    workspace: parsed.sessionHeader?.cwd,
  });

  // Subagent lanes
  const spawnCountByAgent = new Map<string, number>();
  const spawnLaneIds = new Map<string, string>(); // childSessionKey → laneId

  for (const spawn of subagentSpawns) {
    const count = (spawnCountByAgent.get(spawn.agentId) || 0) + 1;
    spawnCountByAgent.set(spawn.agentId, count);

    const uuid = spawn.childSessionKey.split(":").pop()?.slice(0, 8) || String(count);
    const laneId = `sub-${spawn.agentId}-${uuid}`;
    spawnLaneIds.set(spawn.childSessionKey, laneId);

    agents.push({
      id: laneId,
      name: `${spawn.agentId} #${count}`,
      role: "Subagent Session",
      parentId: orchestratorLaneId,
      domain: spawn.agentId,
      skills: [],
      lifecycle: "ephemeral",
      workspace: parsed.sessionHeader?.cwd,
    });
  }

  // ── Build events ──
  const events: MonitorEvent[] = [];
  let seq = 0;
  const ev = (
    agentId: string,
    timestamp: number,
    type: string,
    opts?: { targetId?: string; details?: string },
  ) => {
    events.push({ id: `e${++seq}`, agentId, timestamp, type, ...opts });
  };

  // Orchestrator: start
  ev(orchestratorLaneId, 0, "start");

  if (hasSubagents) {
    // Build orchestrator pause/resume from spawn batches.
    // When orchestrator spawns subagents, it pauses until they complete.
    // Group spawns that happen at the same second into batches.
    const spawnsByOffset = new Map<number, SubagentSpawn[]>();
    for (const spawn of subagentSpawns) {
      const offset = offsetSec(spawn.spawnTimestamp);
      const list = spawnsByOffset.get(offset) || [];
      list.push(spawn);
      spawnsByOffset.set(offset, list);
    }

    for (const [offset, batch] of spawnsByOffset) {
      // Find the latest completion in this batch
      const completions = batch.filter((s) => s.completeTimestamp).map((s) => s.completeTimestamp!);
      const latestCompletion = completions.length > 0 ? Math.max(...completions) : 0;
      const resumeOffset = latestCompletion ? offsetSec(latestCompletion) : 0;

      if (resumeOffset > offset + 2) {
        ev(orchestratorLaneId, offset + 1, "pause", { details: "Waiting for subagents" });
        ev(orchestratorLaneId, resumeOffset, "resume");
      }
    }

    // Orchestrator errors and idle gaps (applies even with subagents)
    const GAP_THRESHOLD_MS = 5 * 60_000; // 5 minutes
    let lastOrcTs = globalStart;
    let orchInError = false;
    for (const msg of messages) {
      const gap = msg.timestamp - lastOrcTs;

      // After error: pause at last error time, resume when next non-error message arrives
      if (orchInError && msg.stopReason !== "error") {
        const pauseOffset = offsetSec(lastOrcTs) + 1;
        const resumeOffset = offsetSec(msg.timestamp);
        ev(orchestratorLaneId, pauseOffset, "pause", { details: "Stopped after error" });
        if (resumeOffset > pauseOffset) {
          ev(orchestratorLaneId, resumeOffset, "resume");
        }
        orchInError = false;
      }
      // Long idle gap → pause/resume
      else if (!orchInError && gap > GAP_THRESHOLD_MS && lastOrcTs !== globalStart) {
        const pauseOffset = offsetSec(lastOrcTs) + 1;
        const resumeOffset = offsetSec(msg.timestamp);
        const alreadyPaused = events.some(
          (e) =>
            e.agentId === orchestratorLaneId &&
            e.type === "pause" &&
            Math.abs(e.timestamp - pauseOffset) <= 3,
        );
        if (!alreadyPaused && resumeOffset > pauseOffset + 2) {
          ev(orchestratorLaneId, pauseOffset, "pause", {
            details: `Idle for ${Math.round(gap / 1000)}s`,
          });
          ev(orchestratorLaneId, resumeOffset, "resume");
        }
      }

      // Error events
      if (msg.stopReason === "error") {
        const errOffset = offsetSec(msg.timestamp);
        ev(orchestratorLaneId, errOffset, "error", {
          details: msg.content.slice(0, 100) || "Error",
        });
        orchInError = true;
      }

      lastOrcTs = msg.timestamp;
    }

    // Note: if ended in error state, the gap detection above already handles
    // the pause (since the next message after error is > 5min away)

    // Subagent events — no time stagger, visual offset handled by frontend
    for (const spawn of subagentSpawns) {
      const laneId = spawnLaneIds.get(spawn.childSessionKey)!;
      const spawnOffset = offsetSec(spawn.spawnTimestamp);

      ev(orchestratorLaneId, spawnOffset, "split", { targetId: laneId });
      ev(laneId, spawnOffset, "spawn");
      ev(laneId, spawnOffset + 1, "start");

      if (spawn.completeTimestamp) {
        const archiveOffset = offsetSec(spawn.completeTimestamp);
        ev(laneId, archiveOffset, "merge", { targetId: orchestratorLaneId });
        ev(laneId, archiveOffset, "archive");
      }
    }
  } else {
    // Simple agent: detect gaps and errors from messages
    const sessionDuration = globalEnd - globalStart;
    const GAP_THRESHOLD_MS = Math.max(5 * 60_000, sessionDuration * 0.2);
    let lastTs = globalStart;
    let inError = false;

    for (const msg of messages) {
      const gap = msg.timestamp - lastTs;

      if (inError && msg.role === "assistant" && msg.stopReason !== "error") {
        ev(orchestratorLaneId, offsetSec(msg.timestamp), "resume");
        inError = false;
      }

      if (!inError && gap > GAP_THRESHOLD_MS && lastTs !== globalStart) {
        ev(orchestratorLaneId, offsetSec(lastTs) + 1, "pause", {
          details: `Idle for ${Math.round(gap / 1000)}s`,
        });
        ev(orchestratorLaneId, offsetSec(msg.timestamp), "resume");
      }

      if (msg.stopReason === "error") {
        ev(orchestratorLaneId, offsetSec(msg.timestamp), "error", {
          details: msg.content.slice(0, 100) || "Error",
        });
        inError = true;
      }

      lastTs = msg.timestamp;
    }
  }

  // Orchestrator: end
  ev(orchestratorLaneId, durationSec + 1, "pause", { details: "Session end" });

  // Sort events
  events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  // ── Telemetry ──
  const agentTelemetry: MonitorTaskSession["agentTelemetry"] = {};
  let totalTokens = 0;
  let totalLatencyMs = 0;
  let latencyCount = 0;
  let errorCount = 0;

  // Orchestrator telemetry from messages
  const toolCounts = new Map<string, number>();
  for (const msg of messages) {
    if (msg.toolNames) {
      for (const name of msg.toolNames) {
        const lower = name.toLowerCase();
        toolCounts.set(lower, (toolCounts.get(lower) || 0) + 1);
      }
    }
    if (msg.usage?.totalTokens) {
      totalTokens += msg.usage.totalTokens;
    }
    if (msg.durationMs) {
      totalLatencyMs += msg.durationMs;
      latencyCount++;
    }
    if (msg.stopReason === "error") {
      errorCount++;
    }
  }

  // ── Derive platforms from tools used ──
  const platforms = derivePlatforms(toolCounts);

  // ── Merge tool counts using display names ──
  const displayToolCounts = new Map<string, { icon: string; count: number }>();
  for (const [name, count] of toolCounts) {
    const displayName = TOOL_DISPLAY_MAP[name] || name;
    const icon = TOOL_ICON_MAP[name] || "Terminal";
    const existing = displayToolCounts.get(displayName);
    if (existing) {
      existing.count += count;
    } else {
      displayToolCounts.set(displayName, { icon, count });
    }
  }
  const toolUsage = [...displayToolCounts.entries()]
    .toSorted((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, { icon, count }]) => ({ name, icon, count }));

  // ── Build tasks from user messages ──
  const tasks = messages
    .filter((m) => m.role === "user" && m.content)
    .slice(0, 10)
    .map((m, i) => {
      const label = m.content.length > 80 ? m.content.slice(0, 77) + "..." : m.content;
      const nextAssistant = messages.find(
        (nm) => nm.role === "assistant" && nm.timestamp > m.timestamp && nm.stopReason !== "error",
      );
      return { id: `t${i}`, label, completed: !!nextAssistant };
    });

  // ── Build artifacts from write/edit tool calls ──
  const artifactMap = new Map<string, { writes: number; edits: number }>();
  for (const msg of messages) {
    if (!msg.toolCalls) {
      continue;
    }
    for (const tc of msg.toolCalls) {
      if (!tc.filePath) {
        continue;
      }
      const lower = tc.name.toLowerCase();
      if (lower === "write" || lower === "write_file") {
        const entry = artifactMap.get(tc.filePath) ?? { writes: 0, edits: 0 };
        entry.writes++;
        artifactMap.set(tc.filePath, entry);
      } else if (lower === "edit" || lower === "edit_file") {
        const entry = artifactMap.get(tc.filePath) ?? { writes: 0, edits: 0 };
        entry.edits++;
        artifactMap.set(tc.filePath, entry);
      }
    }
  }
  const artifacts = [...artifactMap.entries()].slice(0, 10).map(([filePath, counts], i) => ({
    id: `art-${i}`,
    title: filePath.split("/").pop() ?? filePath,
    description: filePath,
    icon: counts.writes > 0 ? "Code" : "FileText",
    iconColor: counts.writes > 0 ? "text-emerald-400" : "text-blue-400",
    additions: counts.writes > 0 ? counts.writes : undefined,
    deletions: counts.edits > 0 ? counts.edits : undefined,
    additionUnit: counts.writes > 0 ? "writes" : undefined,
  }));

  const firstUser = messages.find((m) => m.role === "user");
  agentTelemetry[orchestratorLaneId] = {
    platforms,
    summary: firstUser?.content?.slice(0, 200) || "No summary",
    tasks,
    artifacts,
    toolUsage,
    systemMetrics: [],
  };

  // Subagent telemetry (minimal — from spawn data)
  for (const spawn of subagentSpawns) {
    const laneId = spawnLaneIds.get(spawn.childSessionKey)!;
    const duration = spawn.completeTimestamp
      ? Math.round((spawn.completeTimestamp - spawn.spawnTimestamp) / 1000)
      : 0;
    agentTelemetry[laneId] = {
      platforms: [{ name: "Terminal", icon: "Terminal", iconColor: "text-zinc-400" }],
      summary: spawn.task || `${spawn.agentId} subagent session (${duration}s)`,
      tasks: [],
      artifacts: [],
      toolUsage: [],
      systemMetrics: [],
    };
  }

  // ── Chat messages ──
  // Only the first user message is the actual human request;
  // subsequent "user" messages are system prompts, tool results, or orchestrator injections.
  const chatMessages: MonitorChatMessage[] = [];
  let msgSeq = 0;
  let seenFirstUser = false;
  // Content limit: delegation plans can be large; use 8000 (consistent with mission path).
  const CHAT_CONTENT_LIMIT = 8000;
  const CHAT_MSG_LIMIT = 500;
  for (const msg of messages) {
    if (chatMessages.length >= CHAT_MSG_LIMIT) {
      break;
    }

    if (msg.role === "user" && msg.content) {
      if (!seenFirstUser) {
        seenFirstUser = true;
        const raw = msg.content;
        chatMessages.push({
          id: `msg-${++msgSeq}`,
          role: "user",
          content: raw.length > CHAT_CONTENT_LIMIT ? raw.slice(0, CHAT_CONTENT_LIMIT) + "…" : raw,
          ts: msg.timestamp ? offsetSec(msg.timestamp) : 0,
        });
      }
      // Skip subsequent user messages (system prompts / tool results)
    } else if (msg.role === "assistant") {
      const text = msg.content?.trim();
      if (text) {
        chatMessages.push({
          id: `msg-${++msgSeq}`,
          role: "assistant",
          content:
            text.length > CHAT_CONTENT_LIMIT ? text.slice(0, CHAT_CONTENT_LIMIT) + "…" : text,
          agentId: orchestratorLaneId,
          agentName: parsed.agentName,
          ts: msg.timestamp ? offsetSec(msg.timestamp) : undefined,
        });
      } else if (msg.toolNames?.length) {
        const names = msg.toolNames.map((n) => TOOL_DISPLAY_MAP[n.toLowerCase()] || n);
        chatMessages.push({
          id: `msg-${++msgSeq}`,
          role: "assistant",
          content: `[${names.join(", ")}]`,
          agentId: orchestratorLaneId,
          agentName: parsed.agentName,
        });
      }
    }
  }

  const avgLatency = latencyCount > 0 ? `${Math.round(totalLatencyMs / latencyCount)}ms` : "N/A";

  return {
    id: parsed.sessionId,
    name: deriveSessionName(messages),
    startTime: 0,
    endTime: durationSec,
    maxTime: durationSec + 10,
    agents,
    events,
    annotations: [],
    agentConfigs: Object.fromEntries(
      agents
        .map((a) => [a.id, buildRealAgentConfig(a.domain ?? a.id)])
        .filter(([, cfg]) => cfg != null),
    ),
    agentTelemetry,
    metrics: { avgLatency, totalTokens, bottleneckCount: errorCount },
    chatMessages,
  };
}

function deriveSessionName(messages: ParsedMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser?.content) {
    const text = firstUser.content.replace(/\n/g, " ").trim();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  }
  return "Untitled Session";
}

// ── Discover sessions ───────────────────────────────────────────────────

async function discoverTaskSessions(opts?: {
  limit?: number;
}): Promise<{ sessions: MonitorTaskSession[]; list: TaskSessionSummary[] }> {
  const stateDir = resolveStateDir();
  const agentsDir = path.join(stateDir, "agents");

  let agentDirs: string[] = [];
  try {
    const entries = await fs.promises.readdir(agentsDir, { withFileTypes: true });
    agentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { sessions: [], list: [] };
  }

  // Collect all session files across agents
  const allSessions: {
    agentId: string;
    sessionId: string;
    sessionFile: string;
    updatedAt: number;
  }[] = [];

  for (const agentId of agentDirs) {
    const storePath = resolveDefaultSessionStorePath(agentId);
    let store: Record<string, unknown> = {};
    try {
      store = loadSessionStore(storePath);
    } catch {
      continue;
    }

    for (const [, entry] of Object.entries(store)) {
      const e = entry as Record<string, unknown>;
      if (!e.sessionId || !e.sessionFile) {
        continue;
      }

      const rawFile = e.sessionFile as string;
      const sessionFile = path.isAbsolute(rawFile)
        ? rawFile
        : path.join(resolveSessionTranscriptsDirForAgent(agentId), rawFile);

      try {
        await fs.promises.access(sessionFile);
      } catch {
        continue;
      }

      allSessions.push({
        agentId,
        sessionId: e.sessionId as string,
        sessionFile,
        updatedAt: (e.updatedAt as number) || 0,
      });
    }
  }

  // Sort by updatedAt descending (newest first)
  allSessions.sort((a, b) => b.updatedAt - a.updatedAt);

  const limit = opts?.limit ?? 10;
  const taskSessions: MonitorTaskSession[] = [];
  const summaries: TaskSessionSummary[] = [];

  for (const session of allSessions.slice(0, limit)) {
    const parsed = await parseJsonlFile(session.sessionFile);
    if (parsed.messages.length === 0) {
      continue;
    }

    const ts = buildTaskSession({
      ...parsed,
      agentId: session.agentId,
      agentName: session.agentId,
      sessionId: session.sessionId,
    });

    if (ts) {
      taskSessions.push(ts);
      summaries.push({
        id: ts.id,
        name: ts.name,
        startTime: ts.startTime,
        endTime: ts.endTime,
        agentCount: ts.agents.length,
        eventCount: ts.events.length,
      });
    }
  }

  // Sort: sessions with more agents first (orchestrator sessions are more interesting)
  taskSessions.sort((a, b) => b.agents.length - a.agents.length);
  summaries.sort((a, b) => b.agentCount - a.agentCount);

  return { sessions: taskSessions, list: summaries };
}

// ── Mission-based session builder ────────────────────────────────────────

async function buildMissionSession(missionId: string): Promise<MonitorTaskSession | null> {
  // Lazy import to avoid circular dependency at module load time
  const { getCompanyService } = await import("../../company/company-service.js");

  let svc: ReturnType<typeof getCompanyService>;
  try {
    svc = getCompanyService();
  } catch {
    return null;
  }

  const tasks = svc.taskStore.list({ missionId });
  if (tasks.length === 0) {
    return null;
  }

  // Find orchestrator task (assignedBy=human) and subtasks
  const orchTask = tasks.find((t) => t.assignedBy === "human") ?? tasks[0];
  const subtasks = tasks.filter((t) => t.id !== orchTask.id);

  // Global time range
  const allStarts = tasks.map((t) => t.startTime ?? t.createdAt).filter(Boolean);
  // Use endTime when available; for review/done tasks without endTime, use updatedAt
  const allEnds = tasks
    .map((t) => t.endTime ?? (t.status === "review" || t.status === "done" ? t.updatedAt : null))
    .filter((e): e is number => e != null);
  if (allStarts.length === 0) {
    return null;
  }

  const globalStart = Math.min(...allStarts);
  // Use latest completion time. Extend to Date.now() if the mission is still actively running
  // (orchestrator in_progress, or subtasks still running).
  // Consider the orchestrator "still running" only if status is in_progress AND
  // it was updated recently (within 5 min). Stale in_progress tasks are treated
  // as completed (e.g. process was killed without updating status).
  const STALE_MS = 5 * 60_000;
  const orchStillRunning =
    orchTask.status !== "done" &&
    orchTask.status !== "review" &&
    Date.now() - orchTask.updatedAt < STALE_MS;
  const subtasksDone = subtasks.every((t) => t.status === "done" || t.status === "review");
  const globalEnd = orchStillRunning
    ? Date.now() // mission still in progress — scan up to now
    : allEnds.length > 0
      ? subtasksDone
        ? Math.max(...allEnds) // all subtasks finished — use their completion time
        : Math.max(Math.max(...allEnds), Date.now()) // some still running
      : subtasksDone && subtasks.length > 0
        ? Math.max(...allStarts) + 120_000 // subtasks done but no end times at all — estimate 2min
        : Date.now();
  const durationSec = Math.ceil((globalEnd - globalStart) / 1000);
  const offsetSec = (ts: number) => Math.max(0, Math.floor((ts - globalStart) / 1000));

  // Build agent lanes
  const agents: MonitorAgent[] = [];
  const events: MonitorEvent[] = [];
  let seq = 0;
  const ev = (
    agentId: string,
    timestamp: number,
    type: string,
    opts?: { targetId?: string; details?: string },
  ) => {
    events.push({ id: `e${++seq}`, agentId, timestamp, type, ...opts });
  };

  const orchAgentId = orchTask.agentId ?? orchTask.assignee ?? "orchestrator";

  // ── Pre-scan JSONL to get real activity timestamps per task ──
  // Task store endTime can be stale (set by review/status updates long after actual
  // completion, or contaminated by later missions reusing the same session).
  // We scan each agent's JSONL within the task's own time window to find the real
  // last message, which is the true completion time.

  // Collect unique subordinate agent IDs
  const subAgentIds = [
    ...new Set(subtasks.map((t) => t.agentId ?? t.assignee).filter(Boolean)),
  ] as string[];

  // taskId → last JSONL message timestamp (absolute ms)
  const taskLastMsgTs = new Map<string, number>();

  // Cache parsed JSONL per agent to avoid re-parsing for each task
  const agentParsedCache = new Map<string, ParsedMessage[]>();

  for (const agentId of [orchAgentId, ...subAgentIds]) {
    try {
      const sessDir = resolveSessionTranscriptsDirForAgent(agentId);
      const allMessages: ParsedMessage[] = [];

      // Collect JSONL files: active sessions from store + archived .reset. files
      const fileSet = new Set<string>();
      try {
        const storePath = resolveDefaultSessionStorePath(agentId);
        const store = loadSessionStore(storePath);
        for (const [, entry] of Object.entries(store)) {
          const e = entry as Record<string, unknown>;
          if (!e.sessionFile) {
            continue;
          }
          const rawFile = e.sessionFile as string;
          fileSet.add(path.isAbsolute(rawFile) ? rawFile : path.join(sessDir, rawFile));
        }
      } catch {
        // best-effort
      }

      // Also scan for .reset. files (archived sessions that may contain mission data)
      try {
        const dirEntries = fs.readdirSync(sessDir);
        for (const entry of dirEntries) {
          if (entry.includes(".reset.") && entry.includes(".jsonl")) {
            fileSet.add(path.join(sessDir, entry));
          }
        }
      } catch {
        // best-effort
      }

      for (const filePath of fileSet) {
        try {
          const p = await parseJsonlFile(filePath);
          allMessages.push(...p.messages);
        } catch {
          // best-effort
        }
      }
      agentParsedCache.set(agentId, allMessages);
    } catch {
      // best-effort
    }
  }

  // For each task, find the last JSONL message within [task.startTime, nextTaskStart or orchTask.endTime]
  const allMissionTasks = [orchTask, ...subtasks];
  for (const task of allMissionTasks) {
    const agentId = task.agentId ?? task.assignee;
    if (!agentId) {
      continue;
    }
    const msgs = agentParsedCache.get(agentId);
    if (!msgs || msgs.length === 0) {
      continue;
    }

    const taskStart = task.startTime ?? task.createdAt;
    // Upper bound for JSONL scanning:
    // - For the orchestrator's own task: use its own endTime (it may overlap with other
    //   missions since orchestrator can accept new tasks while paused/waiting).
    // - For subordinate tasks: use the next task assigned to the same agent from ANY
    //   mission, so we don't bleed messages from a later mission into this one.
    let upperBound: number;
    if (task.id === orchTask.id) {
      // For in-progress missions, endTime may have been set early by onFinish
      // while processes are still running. Use Date.now() as upper bound.
      upperBound = orchStillRunning ? Date.now() : (orchTask.endTime ?? globalEnd);
    } else {
      const allAgentTasks = svc.taskStore
        .list({})
        .filter(
          (t: Task) =>
            t.id !== task.id &&
            (t.agentId ?? t.assignee) === agentId &&
            (t.startTime ?? t.createdAt) > taskStart,
        );
      const nextTaskStart =
        allAgentTasks.length > 0
          ? Math.min(...allAgentTasks.map((t: Task) => t.startTime ?? t.createdAt))
          : undefined;
      upperBound = nextTaskStart ?? orchTask.endTime ?? globalEnd;
    }

    let lastTs = 0;
    for (const m of msgs) {
      if (m.timestamp >= taskStart && m.timestamp <= upperBound) {
        if (m.timestamp > lastTs) {
          lastTs = m.timestamp;
        }
      }
    }
    if (lastTs > 0) {
      taskLastMsgTs.set(task.id, lastTs);
    }
  }

  /** Return real completion offset for a task: prefer JSONL last-message time, fall back to task endTime. */
  function realCompleteOffset(task: Task): number | null {
    const jsonlTs = taskLastMsgTs.get(task.id);
    if (jsonlTs) {
      return offsetSec(jsonlTs);
    }
    const taskEnd =
      task.endTime ?? (task.status === "review" || task.status === "done" ? task.updatedAt : null);
    return taskEnd ? offsetSec(taskEnd) : null;
  }

  // ── Build agent lanes & timeline events ──
  const orchMeta = svc.registry.getMeta(orchAgentId);
  agents.push({
    id: orchAgentId,
    name: orchMeta?.id ?? orchAgentId,
    role: orchMeta?.role ?? "Orchestrator",
    domain: orchAgentId,
    skills: [],
    lifecycle: "persistent",
  });

  ev(orchAgentId, 0, "start");

  // Subordinate lanes + events (using JSONL-corrected completion times)
  for (const subId of subAgentIds) {
    const meta = svc.registry.getMeta(subId);
    agents.push({
      id: subId,
      name: meta?.id ?? subId,
      role: meta?.role ?? "Agent",
      parentId: orchAgentId,
      domain: subId,
      skills: [],
      lifecycle: "persistent",
    });

    const agentTasks = subtasks.filter((t) => (t.agentId ?? t.assignee) === subId);
    for (const task of agentTasks) {
      const spawnOffset = offsetSec(task.startTime ?? task.createdAt);
      ev(orchAgentId, spawnOffset, "split", { targetId: subId });
      ev(subId, spawnOffset, "spawn");
      ev(subId, spawnOffset + 1, "start");

      const completeOffset = realCompleteOffset(task);
      if (completeOffset != null) {
        const isFailed = task.reviewNote?.startsWith("Failed");
        if (isFailed) {
          ev(subId, completeOffset, "error", { details: task.reviewNote ?? "Failed" });
          ev(subId, completeOffset, "merge", { targetId: orchAgentId });
        } else {
          ev(subId, completeOffset, "merge", { targetId: orchAgentId });
          ev(subId, completeOffset, "archive");
        }
      }
    }
  }

  // Orchestrator pause/resume — derived later from JSONL message gaps (see below).
  // We defer this until after orchRawMessages are loaded.

  // Orchestrator end
  if (orchTask.endTime) {
    ev(orchAgentId, offsetSec(orchTask.endTime), "archive");
  }

  // ── Convert persisted phase transitions to annotations + orchestrator events ──
  const phaseAnnotations: {
    id: string;
    timestamp: number;
    agentId: string;
    type: "dispatch" | "decision" | "insight";
    title: string;
    description: string;
    placement: "top" | "bottom";
  }[] = [];

  if (orchTask.phases && orchTask.phases.length > 0) {
    const PHASE_LABELS: Record<
      string,
      { title: string; type: "dispatch" | "decision" | "insight" }
    > = {
      planning: { title: "Planning", type: "dispatch" },
      delegating: { title: "Delegating", type: "dispatch" },
      executing: { title: "Executing", type: "dispatch" },
      synthesizing: { title: "Synthesizing", type: "insight" },
      verifying: { title: "Verifying", type: "decision" },
      complete: { title: "Complete", type: "insight" },
    };

    for (let i = 0; i < orchTask.phases.length; i++) {
      const p = orchTask.phases[i];
      const label = PHASE_LABELS[p.phase];
      if (!label || p.phase === "complete") {
        continue;
      }
      const phaseOffset = offsetSec(p.ts);
      phaseAnnotations.push({
        id: `phase-${i}`,
        timestamp: phaseOffset,
        agentId: orchAgentId,
        type: label.type,
        title: label.title,
        description: `Orchestrator entered ${p.phase} phase`,
        placement: "top",
      });
    }
  }

  // ── Build telemetry + chat from agent JSONL sessions ──
  const agentTelemetry: MonitorTaskSession["agentTelemetry"] = {};
  const agentConfigs: MonitorTaskSession["agentConfigs"] = {};
  let orchRawMessages: ParsedMessage[] = [];
  const agentParsedSessions = new Map<string, ParsedSession>();

  // Collect chat messages from all agents for merging
  const allAgentMsgs: {
    agentId: string;
    agentName: string;
    timestamp: number;
    role: "user" | "assistant";
    content: string;
  }[] = [];

  for (const agent of agents) {
    agentTelemetry[agent.id] = {
      platforms: [],
      summary: "",
      tasks: [],
      artifacts: [],
      toolUsage: [],
      systemMetrics: [],
    };
    agentConfigs[agent.id] = buildRealAgentConfig(agent.id) ?? {};

    // Load session JSONL for telemetry + chat (use pre-scanned cache when available)
    try {
      // Determine this agent's task time window for filtering
      const agentTask = allMissionTasks.find((t) => (t.agentId ?? t.assignee) === agent.id);
      const agentTaskStart = agentTask ? (agentTask.startTime ?? agentTask.createdAt) : globalStart;
      const agentJsonlEnd = agentTask ? (taskLastMsgTs.get(agentTask.id) ?? null) : null;
      // Upper bound: JSONL-derived end (already scoped per-task), or task endTime, or globalEnd
      const agentUpperBound = agentJsonlEnd
        ? agentJsonlEnd + 5000 // small buffer past last message
        : (agentTask?.endTime ?? globalEnd);

      // Reuse pre-scanned messages; find best ParsedSession for subagent extraction
      const allMessages = agentParsedCache.get(agent.id);
      let bestParsed: ParsedSession | null = null;

      // Find the session file with the most message overlap for spawn tracking
      const sessDir = resolveSessionTranscriptsDirForAgent(agent.id);
      const candidateFiles = new Set<string>();
      try {
        const storePath = resolveDefaultSessionStorePath(agent.id);
        const store = loadSessionStore(storePath);
        for (const [, entry] of Object.entries(store)) {
          const e = entry as Record<string, unknown>;
          if (e.sessionFile) {
            const rawFile = e.sessionFile as string;
            candidateFiles.add(path.isAbsolute(rawFile) ? rawFile : path.join(sessDir, rawFile));
          }
        }
      } catch {
        /* best-effort */
      }
      try {
        for (const entry of fs.readdirSync(sessDir)) {
          if (entry.includes(".reset.") && entry.includes(".jsonl")) {
            candidateFiles.add(path.join(sessDir, entry));
          }
        }
      } catch {
        /* best-effort */
      }

      console.log(
        `  [telemetry] ${agent.id}: candidateFiles=${candidateFiles.size}, agentTaskStart=${agentTaskStart}, agentUpperBound=${agentUpperBound}`,
      );
      for (const sf of candidateFiles) {
        try {
          const p = await parseJsonlFile(sf);
          const overlap = p.messages.filter(
            (m) => m.timestamp >= agentTaskStart && m.timestamp <= agentUpperBound,
          ).length;
          console.log(
            `  [telemetry] ${agent.id}: file=${path.basename(sf)} msgs=${p.messages.length} spawns=${p.subagentSpawns.length} overlap=${overlap}`,
          );
          if (
            overlap > 0 &&
            (!bestParsed ||
              overlap >
                bestParsed.messages.filter(
                  (m) => m.timestamp >= agentTaskStart && m.timestamp <= agentUpperBound,
                ).length)
          ) {
            bestParsed = p;
          }
        } catch {
          continue;
        }
      }

      const hasData = allMessages ? allMessages.length > 0 : bestParsed != null;
      if (hasData) {
        const parsed = bestParsed;
        const sourceMessages = allMessages ?? parsed?.messages ?? [];
        // Filter to this agent's task window only
        const missionMessages = sourceMessages.filter(
          (m) => m.timestamp >= agentTaskStart && m.timestamp <= agentUpperBound,
        );
        // Save parsed session for subagent extraction
        if (parsed) {
          agentParsedSessions.set(agent.id, parsed);
        }
        // Save orchestrator raw messages for phase splitting
        if (agent.id === orchAgentId) {
          orchRawMessages = missionMessages;
        }
        const toolCounts = new Map<string, number>();
        let totalTokens = 0;

        for (const msg of missionMessages) {
          totalTokens += msg.usage?.totalTokens ?? 0;
          for (const tool of msg.toolNames ?? []) {
            const lower = tool.toLowerCase();
            toolCounts.set(lower, (toolCounts.get(lower) ?? 0) + 1);
          }

          // Collect chat messages — only assistant messages from agent sessions.
          // User-role messages are system prompts / orchestrator injections, not human input.
          // The actual human request is already added as the mission description.
          if (msg.role === "assistant") {
            const text = msg.content?.trim();
            if (text) {
              allAgentMsgs.push({
                agentId: agent.id,
                agentName: agent.name,
                timestamp: msg.timestamp,
                role: "assistant",
                content: text,
              });
            } else if (msg.toolNames?.length) {
              const names = msg.toolNames.map((n) => TOOL_DISPLAY_MAP[n.toLowerCase()] || n);
              allAgentMsgs.push({
                agentId: agent.id,
                agentName: agent.name,
                timestamp: msg.timestamp,
                role: "assistant",
                content: `[${names.join(", ")}]`,
              });
            }
          }
        }

        // Telemetry: platforms
        agentTelemetry[agent.id].platforms = derivePlatforms(toolCounts);

        // Telemetry: tool usage with display names
        const displayCounts = new Map<string, { icon: string; count: number }>();
        for (const [name, count] of toolCounts) {
          const displayName = TOOL_DISPLAY_MAP[name] || name;
          const icon = TOOL_ICON_MAP[name] || "Terminal";
          const existing = displayCounts.get(displayName);
          if (existing) {
            existing.count += count;
          } else {
            displayCounts.set(displayName, { icon, count });
          }
        }
        agentTelemetry[agent.id].toolUsage = [...displayCounts.entries()]
          .toSorted((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([name, { icon, count }]) => ({ name, icon, count }));

        // Telemetry: artifacts from file operations
        const artifactMap = new Map<string, { writes: number; edits: number }>();
        for (const msg of missionMessages) {
          if (!msg.toolCalls) {
            continue;
          }
          for (const tc of msg.toolCalls) {
            if (!tc.filePath) {
              continue;
            }
            const lower = tc.name.toLowerCase();
            if (lower === "write" || lower === "write_file") {
              const entry = artifactMap.get(tc.filePath) ?? { writes: 0, edits: 0 };
              entry.writes++;
              artifactMap.set(tc.filePath, entry);
            } else if (lower === "edit" || lower === "edit_file") {
              const entry = artifactMap.get(tc.filePath) ?? { writes: 0, edits: 0 };
              entry.edits++;
              artifactMap.set(tc.filePath, entry);
            }
          }
        }
        agentTelemetry[agent.id].artifacts = [...artifactMap.entries()]
          .slice(0, 10)
          .map(([filePath, counts], i) => ({
            id: `art-${i}`,
            title: filePath.split("/").pop() ?? filePath,
            description: filePath,
            icon: counts.writes > 0 ? "Code" : "FileText",
            iconColor: counts.writes > 0 ? "text-emerald-400" : "text-blue-400",
            additions: counts.writes > 0 ? counts.writes : undefined,
            deletions: counts.edits > 0 ? counts.edits : undefined,
            additionUnit: counts.writes > 0 ? "writes" : undefined,
          }));

        // Telemetry: tasks from user messages
        const userMsgs = parsed.messages.filter((m) => m.role === "user" && m.content);
        agentTelemetry[agent.id].tasks = userMsgs.slice(0, 10).map((m, i) => {
          const truncated = m.content.length > 80;
          const label = truncated ? m.content.slice(0, 77) + "..." : m.content;
          const nextOk = parsed.messages.find(
            (nm) =>
              nm.role === "assistant" && nm.timestamp > m.timestamp && nm.stopReason !== "error",
          );
          return {
            id: `t${i}`,
            label,
            fullLabel: truncated ? m.content.slice(0, 2000) : undefined,
            completed: !!nextOk,
          };
        });

        agentTelemetry[agent.id].summary =
          `${totalTokens.toLocaleString()} tokens, ${missionMessages.length} messages`;
      }
    } catch {
      // best-effort
    }
  }

  // ── Orchestrator pause/resume: hybrid model ────────────────────────
  // 1. Delegation period: use task store times (orchestrator active until
  //    subtasks start, then paused until first JSONL message after delegation)
  // 2. Post-delegation: use JSONL message gaps to detect sessions_yield pauses
  if (orchRawMessages.length > 0) {
    const GAP_THRESHOLD_MS = 90_000; // 90s gap → pause/resume (LLM generation can take 30-60s)

    // Find delegation boundaries from task store
    const delegateStartTs =
      subtasks.length > 0
        ? Math.min(...subtasks.map((t) => t.startTime ?? t.createdAt).filter(Boolean))
        : null;

    // First JSONL message strictly after delegation start = orchestrator resumed
    const firstPostDelegationMsg = delegateStartTs
      ? orchRawMessages.find((m) => m.timestamp > delegateStartTs + GAP_THRESHOLD_MS)
      : null;

    if (delegateStartTs && firstPostDelegationMsg) {
      // Delegation pause + resume: orchestrator hands off then resumes
      const pauseOffset = offsetSec(delegateStartTs) + 1;
      const resumeOffset = offsetSec(firstPostDelegationMsg.timestamp);
      if (resumeOffset > pauseOffset + 1) {
        ev(orchAgentId, pauseOffset, "pause", {
          details: `Waiting for subordinates`,
        });
        ev(orchAgentId, resumeOffset, "resume");
      }

      // Post-delegation JSONL gap detection for sessions_yield pauses
      const postMsgs = orchRawMessages.filter(
        (m) => m.timestamp >= firstPostDelegationMsg.timestamp,
      );
      let lastMsgTs = postMsgs[0]?.timestamp ?? 0;
      for (let i = 1; i < postMsgs.length; i++) {
        const msg = postMsgs[i];
        const gap = msg.timestamp - lastMsgTs;
        if (gap > GAP_THRESHOLD_MS) {
          const gapPauseOffset = offsetSec(lastMsgTs) + 1;
          const gapResumeOffset = offsetSec(msg.timestamp);
          if (gapResumeOffset > gapPauseOffset + 1) {
            ev(orchAgentId, gapPauseOffset, "pause", {
              details: `Idle for ${Math.round(gap / 1000)}s`,
            });
            ev(orchAgentId, gapResumeOffset, "resume");
          }
        }
        lastMsgTs = msg.timestamp;
      }
    } else if (delegateStartTs && !firstPostDelegationMsg && subtasks.length > 0) {
      // Delegation started but orchestrator hasn't resumed yet (still waiting)
      const pauseOffset = offsetSec(delegateStartTs) + 1;
      ev(orchAgentId, pauseOffset, "pause", {
        details: `Waiting for subordinates`,
      });
    } else if (orchRawMessages.length >= 2) {
      // No subtasks — pure JSONL gap detection
      let lastMsgTs = orchRawMessages[0].timestamp;
      for (let i = 1; i < orchRawMessages.length; i++) {
        const msg = orchRawMessages[i];
        const gap = msg.timestamp - lastMsgTs;
        if (gap > GAP_THRESHOLD_MS) {
          const pauseOffset = offsetSec(lastMsgTs) + 1;
          const resumeOffset = offsetSec(msg.timestamp);
          if (resumeOffset > pauseOffset + 1) {
            ev(orchAgentId, pauseOffset, "pause", {
              details: `Idle for ${Math.round(gap / 1000)}s`,
            });
            ev(orchAgentId, resumeOffset, "resume");
          }
        }
        lastMsgTs = msg.timestamp;
      }
    }
  }

  // Split orchestrator telemetry into per-activity-window entries
  // so that planning phase and synthesis phase show different data
  if (orchRawMessages.length > 0) {
    const buildPhaseTelemetry = (msgs: ParsedMessage[]) => {
      const tc = new Map<string, number>();
      let tokens = 0;
      for (const m of msgs) {
        tokens += m.usage?.totalTokens ?? 0;
        for (const t of m.toolNames ?? []) {
          const l = t.toLowerCase();
          tc.set(l, (tc.get(l) ?? 0) + 1);
        }
      }
      const dc = new Map<string, { icon: string; count: number }>();
      for (const [name, count] of tc) {
        const dn = TOOL_DISPLAY_MAP[name] || name;
        const icon = TOOL_ICON_MAP[name] || "Terminal";
        const ex = dc.get(dn);
        if (ex) {
          ex.count += count;
        } else {
          dc.set(dn, { icon, count });
        }
      }
      const am = new Map<string, { writes: number; edits: number }>();
      for (const m of msgs) {
        if (!m.toolCalls) {
          continue;
        }
        for (const call of m.toolCalls) {
          if (!call.filePath) {
            continue;
          }
          const ln = call.name.toLowerCase();
          if (ln === "write" || ln === "write_file") {
            const e = am.get(call.filePath) ?? { writes: 0, edits: 0 };
            e.writes++;
            am.set(call.filePath, e);
          } else if (ln === "edit" || ln === "edit_file") {
            const e = am.get(call.filePath) ?? { writes: 0, edits: 0 };
            e.edits++;
            am.set(call.filePath, e);
          }
        }
      }
      return {
        platforms: derivePlatforms(tc),
        summary: `${tokens.toLocaleString()} tokens, ${msgs.length} messages`,
        tasks: [] as { id: string; label: string; completed: boolean }[],
        artifacts: [...am.entries()].slice(0, 10).map(([fp, c], i) => ({
          id: `art-${i}`,
          title: fp.split("/").pop() ?? fp,
          description: fp,
          icon: c.writes > 0 ? "Code" : "FileText",
          iconColor: c.writes > 0 ? "text-emerald-400" : "text-blue-400",
          additions: c.writes > 0 ? c.writes : undefined,
          deletions: c.edits > 0 ? c.edits : undefined,
          additionUnit: c.writes > 0 ? "writes" : undefined,
        })),
        toolUsage: [...dc.entries()]
          .toSorted((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([name, { icon, count }]) => ({ name, icon, count })),
        systemMetrics: [] as { time: string; cpu: number; memory: number; context: number }[],
      };
    };

    // Build per-activity-window telemetry for the orchestrator.
    // Activity windows are bounded by start/resume → pause/archive events.
    // Collect boundaries from the events we emitted for the orchestrator.
    const orchEvents = events
      .filter((e) => e.agentId === orchAgentId)
      .toSorted((a, b) => a.timestamp - b.timestamp);

    // Extract activity windows: each start/resume opens a window, each pause/archive closes it
    const orchWindows: { eventId: string; startTs: number; endTs: number }[] = [];
    let currentWindow: { eventId: string; startTs: number } | null = null;
    for (const e of orchEvents) {
      if (e.type === "start" || e.type === "resume") {
        currentWindow = { eventId: e.id, startTs: e.timestamp };
      } else if ((e.type === "pause" || e.type === "archive") && currentWindow) {
        orchWindows.push({ ...currentWindow, endTs: e.timestamp });
        currentWindow = null;
      }
    }
    // If still open, close at the end
    if (currentWindow) {
      orchWindows.push({ ...currentWindow, endTs: durationSec + 5 });
    }

    for (const win of orchWindows) {
      const winStartMs = globalStart + win.startTs * 1000;
      const winEndMs = globalStart + win.endTs * 1000;
      const winMsgs = orchRawMessages.filter(
        (m) => m.timestamp >= winStartMs && m.timestamp <= winEndMs,
      );
      if (winMsgs.length > 0) {
        agentTelemetry[`w_${win.eventId}`] = buildPhaseTelemetry(winMsgs);
      }
    }
  }

  // ── Add ephemeral subagent lanes from session JSONL ──
  console.log(
    `  [ephemeral] agentParsedSessions keys: [${[...agentParsedSessions.keys()].join(", ")}]`,
  );
  for (const [parentAgentId, parsed] of agentParsedSessions) {
    console.log(`  [ephemeral] ${parentAgentId}: ${parsed.subagentSpawns.length} total spawns`);
    const missionSpawns = parsed.subagentSpawns.filter(
      (s) => s.spawnTimestamp >= globalStart - 60_000 && s.spawnTimestamp <= globalEnd + 60_000,
    );
    console.log(
      `  [ephemeral] ${parentAgentId}: ${missionSpawns.length} mission spawns (window ${new Date(globalStart - 60_000).toISOString()} - ${new Date(globalEnd + 60_000).toISOString()})`,
    );
    if (missionSpawns.length === 0) {
      continue;
    }

    const spawnCountByAgent = new Map<string, number>();
    for (const spawn of missionSpawns) {
      const count = (spawnCountByAgent.get(spawn.agentId) || 0) + 1;
      spawnCountByAgent.set(spawn.agentId, count);

      const uuid = spawn.childSessionKey.split(":").pop()?.slice(0, 8) || String(count);
      const laneId = `sub-${parentAgentId}-${spawn.agentId}-${uuid}`;

      agents.push({
        id: laneId,
        name: `${spawn.agentId} #${count}`,
        role: "Subagent Session",
        parentId: parentAgentId,
        domain: spawn.agentId,
        skills: [],
        lifecycle: "ephemeral",
      });

      const spawnOffset = offsetSec(spawn.spawnTimestamp);
      ev(parentAgentId, spawnOffset, "split", { targetId: laneId });
      ev(laneId, spawnOffset, "spawn");
      ev(laneId, spawnOffset + 1, "start");

      if (spawn.completeTimestamp) {
        const completeOffset = offsetSec(spawn.completeTimestamp);
        ev(laneId, completeOffset, "merge", { targetId: parentAgentId });
        ev(laneId, completeOffset, "archive");
      }

      // Try to load subagent's own session JSONL for real telemetry
      const duration = spawn.completeTimestamp
        ? Math.round((spawn.completeTimestamp - spawn.spawnTimestamp) / 1000)
        : 0;
      let subTelemetry: MonitorTaskSession["agentTelemetry"][string] = {
        platforms: [],
        summary: spawn.task?.slice(0, 100) || `${spawn.agentId} subagent (${duration}s)`,
        tasks: [],
        artifacts: [],
        toolUsage: [],
        systemMetrics: [],
      };

      try {
        // Subagent sessions are stored under the agent's directory with childSessionKey as store key
        const subAgentDir = spawn.agentId;
        const subStorePath = resolveDefaultSessionStorePath(subAgentDir);
        const subStore = loadSessionStore(subStorePath);
        const subEntry = subStore[spawn.childSessionKey] as Record<string, unknown> | undefined;
        if (subEntry?.sessionFile) {
          const rawFile = subEntry.sessionFile as string;
          const subFile = path.isAbsolute(rawFile)
            ? rawFile
            : path.join(resolveSessionTranscriptsDirForAgent(subAgentDir), rawFile);
          const subParsed = await parseJsonlFile(subFile);

          const tc = new Map<string, number>();
          let tokens = 0;
          for (const m of subParsed.messages) {
            tokens += m.usage?.totalTokens ?? 0;
            for (const t of m.toolNames ?? []) {
              const l = t.toLowerCase();
              tc.set(l, (tc.get(l) ?? 0) + 1);
            }
          }
          const dc = new Map<string, { icon: string; count: number }>();
          for (const [name, count] of tc) {
            const dn = TOOL_DISPLAY_MAP[name] || name;
            const icon = TOOL_ICON_MAP[name] || "Terminal";
            const ex = dc.get(dn);
            if (ex) {
              ex.count += count;
            } else {
              dc.set(dn, { icon, count });
            }
          }
          const am = new Map<string, { writes: number; edits: number }>();
          for (const m of subParsed.messages) {
            if (!m.toolCalls) {
              continue;
            }
            for (const call of m.toolCalls) {
              if (!call.filePath) {
                continue;
              }
              const ln = call.name.toLowerCase();
              if (ln === "write" || ln === "write_file") {
                const e = am.get(call.filePath) ?? { writes: 0, edits: 0 };
                e.writes++;
                am.set(call.filePath, e);
              } else if (ln === "edit" || ln === "edit_file") {
                const e = am.get(call.filePath) ?? { writes: 0, edits: 0 };
                e.edits++;
                am.set(call.filePath, e);
              }
            }
          }

          subTelemetry = {
            platforms: derivePlatforms(tc),
            summary: `${tokens.toLocaleString()} tokens, ${subParsed.messages.length} msgs, ${duration}s`,
            tasks: subParsed.messages
              .filter((m) => m.role === "user" && m.content)
              .slice(0, 5)
              .map((m, i) => ({
                id: `t${i}`,
                label: m.content.length > 80 ? m.content.slice(0, 77) + "..." : m.content,
                completed: !!subParsed.messages.find(
                  (nm) =>
                    nm.role === "assistant" &&
                    nm.timestamp > m.timestamp &&
                    nm.stopReason !== "error",
                ),
              })),
            artifacts: [...am.entries()].slice(0, 10).map(([fp, c], i) => ({
              id: `art-${i}`,
              title: fp.split("/").pop() ?? fp,
              description: fp,
              icon: c.writes > 0 ? "Code" : "FileText",
              iconColor: c.writes > 0 ? "text-emerald-400" : "text-blue-400",
              additions: c.writes > 0 ? c.writes : undefined,
              deletions: c.edits > 0 ? c.edits : undefined,
              additionUnit: c.writes > 0 ? "writes" : undefined,
            })),
            toolUsage: [...dc.entries()]
              .toSorted((a, b) => b[1].count - a[1].count)
              .slice(0, 10)
              .map(([name, { icon, count }]) => ({ name, icon, count })),
            systemMetrics: [],
          };
        }
      } catch {
        // best-effort — keep minimal telemetry
      }

      agentTelemetry[laneId] = subTelemetry;
      agentConfigs[laneId] = {};
    }
  }

  // ── Merge chat messages from all agents, sorted chronologically ──
  // Only include messages from persistent agents (skip ephemeral subagents)
  const persistentIds = new Set(
    agents
      .filter((a) => a.lifecycle === "persistent" || a.lifecycle === "contract")
      .map((a) => a.id),
  );
  const missionEnd = globalStart + durationSec * 1000;
  const filteredMsgs = allAgentMsgs.filter(
    (m) =>
      (m.role === "user" || persistentIds.has(m.agentId)) &&
      m.timestamp >= globalStart &&
      m.timestamp <= missionEnd,
  );
  filteredMsgs.sort((a, b) => a.timestamp - b.timestamp);

  const chatMessages: MonitorChatMessage[] = [];
  // Lead with mission description
  chatMessages.push({
    id: "msg_mission",
    role: "user",
    content: orchTask.description ?? orchTask.title,
    ts: 0,
  });

  let msgSeq = 0;
  for (const chat of filteredMsgs) {
    if (chatMessages.length >= 200) {
      break;
    }
    if (!chat.content) {
      continue;
    }
    chatMessages.push({
      id: `msg-${++msgSeq}`,
      role: chat.role,
      content:
        chat.content.includes('"agentId"') && chat.content.includes('"subtask"')
          ? chat.content.slice(0, 8000) // delegation plans can be large
          : chat.content.slice(0, 1500),
      agentId: chat.role === "assistant" ? chat.agentId : undefined,
      agentName: chat.role === "assistant" ? chat.agentName : undefined,
      ts: offsetSec(chat.timestamp),
    });
  }

  // Total tokens
  const totalTokens = tasks.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0);

  // Effective duration: use the latest timeline event or chat message as the real end.
  // Events now use JSONL-derived timestamps, so they're already accurate.
  const lastEventTs = events.length > 0 ? Math.max(...events.map((e) => e.timestamp)) : 0;
  const lastChatTs =
    filteredMsgs.length > 0 ? offsetSec(filteredMsgs[filteredMsgs.length - 1].timestamp) : 0;
  const latestActivity = Math.max(lastEventTs, lastChatTs);
  const effectiveDuration = latestActivity > 0 ? latestActivity + 5 : durationSec;

  // ── Debug log ──
  console.log(`\n[monitor.mission] ═══ ${missionId} ═══`);
  console.log(`  globalStart: ${new Date(globalStart).toISOString()}`);
  console.log(`  durationSec: ${durationSec}s → effectiveDuration: ${effectiveDuration}s`);
  console.log(`  tasks (${allMissionTasks.length}):`);
  for (const t of allMissionTasks) {
    const aid = t.agentId ?? t.assignee ?? "?";
    const tStart = ((t.startTime ?? t.createdAt) - globalStart) / 1000;
    const tEnd = t.endTime ? (t.endTime - globalStart) / 1000 : "?";
    const jsonlEnd = taskLastMsgTs.get(t.id);
    const jEnd = jsonlEnd ? (jsonlEnd - globalStart) / 1000 : "no-jsonl";
    console.log(
      `    ${aid}: task ${tStart.toFixed(0)}s→${typeof tEnd === "number" ? tEnd.toFixed(0) : tEnd}s | jsonl→${typeof jEnd === "number" ? jEnd.toFixed(0) : jEnd}s | realComplete=${realCompleteOffset(t)}s`,
    );
  }
  console.log(
    `  agents (${agents.length}): ${agents.map((a) => `${a.id}(${a.lifecycle})`).join(", ")}`,
  );
  console.log(`  events (${events.length}):`);
  for (const e of events) {
    const target = (e as Record<string, unknown>).targetId
      ? ` →${String((e as Record<string, unknown>).targetId)}`
      : "";
    const details = (e as Record<string, unknown>).details
      ? ` [${String((e as Record<string, unknown>).details)}]`
      : "";
    console.log(`    ${e.id}: ${e.agentId} t=${e.timestamp}s ${e.type}${target}${details}`);
  }
  console.log(`  chatMessages (${chatMessages.length}):`);
  for (const m of chatMessages) {
    console.log(
      `    ts=${m.ts ?? "?"}s | ${m.role} | ${(m.agentName ?? "").padEnd(13)} | ${m.content.slice(0, 60)}`,
    );
  }
  console.log(`═══ end ${missionId} ═══\n`);

  return {
    id: missionId,
    name: orchTask.title,
    description: orchTask.description,
    startTime: 0,
    endTime: effectiveDuration,
    maxTime: effectiveDuration,
    globalStartMs: globalStart,
    agents,
    events,
    annotations: phaseAnnotations,
    agentConfigs,
    agentTelemetry,
    metrics: {
      avgLatency: "–",
      totalTokens,
      bottleneckCount: events.filter((e) => e.type === "error").length,
    },
    chatMessages,
  };
}

// ── Gateway handlers ────────────────────────────────────────────────────

export const monitorHandlers: GatewayRequestHandlers = {
  "monitor.sessions": async ({ respond, params, context }) => {
    try {
      context.logGateway.info("[monitor.sessions] request received");
      const limit = typeof params?.limit === "number" ? params.limit : 10;
      const result = await discoverTaskSessions({ limit });
      context.logGateway.info(`[monitor.sessions] returning ${result.sessions.length} sessions`);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, {
        code: -1,
        message: `monitor.sessions failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  "monitor.session": async ({ respond, params }) => {
    try {
      const sessionId = params?.sessionId as string | undefined;
      if (!sessionId) {
        respond(false, undefined, { code: -1, message: "sessionId required" });
        return;
      }
      const result = await discoverTaskSessions({ limit: 20 });
      const session = result.sessions.find((s) => s.id === sessionId);
      if (!session) {
        respond(false, undefined, { code: -1, message: `session not found: ${sessionId}` });
        return;
      }
      respond(true, session);
    } catch (err) {
      respond(false, undefined, {
        code: -1,
        message: `monitor.session failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  "monitor.missions.list": async ({ respond }) => {
    try {
      const { getCompanyService } = await import("../../company/company-service.js");
      const svc = getCompanyService();
      const missions = svc.taskStore.listMissions();
      respond(true, { missions });
    } catch (err) {
      respond(false, undefined, {
        code: -1,
        message: `monitor.missions.list failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  "monitor.mission": async ({ respond, params }) => {
    try {
      const missionId = params?.missionId as string | undefined;
      if (!missionId) {
        respond(false, undefined, { code: -1, message: "missionId required" });
        return;
      }
      const session = await buildMissionSession(missionId);
      if (!session) {
        respond(false, undefined, { code: -1, message: `mission not found: ${missionId}` });
        return;
      }
      // Debug: log events
      console.log(
        `[monitor.mission] ${missionId}: ${session.events.length} events, ${session.agents.length} agents`,
      );
      for (const e of [...session.events].toSorted((a, b) => a.timestamp - b.timestamp)) {
        console.log(
          `  T+${e.timestamp} ${e.agentId} ${e.type}${e.targetId ? " ->" + e.targetId : ""}`,
        );
      }
      respond(true, session);
    } catch (err) {
      respond(false, undefined, {
        code: -1,
        message: `monitor.mission failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
};
