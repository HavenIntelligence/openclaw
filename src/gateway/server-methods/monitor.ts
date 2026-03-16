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
import { resolveStateDir } from "../../config/paths.js";
import {
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptsDirForAgent,
} from "../../config/sessions/paths.js";
import { loadSessionStore } from "../../config/sessions/store.js";
import type { GatewayRequestHandlers } from "./types.js";

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
  sessionHeader: { id?: string; timestamp?: string } | null;
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
      if (b.type === "tool_use" && typeof b.name === "string") {
        names.push(b.name);
      }
    }
  }
  return names;
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
        const toolNames = extractToolNames(content);
        messages.push({
          role,
          timestamp,
          content: contentText.slice(0, 500),
          usage: msg.usage as ParsedMessage["usage"],
          durationMs: msg.durationMs as number | undefined,
          stopReason: msg.stopReason as string | undefined,
          model: msg.model as string | undefined,
          toolNames: toolNames.length > 0 ? toolNames : undefined,
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

  const firstUser = messages.find((m) => m.role === "user");
  agentTelemetry[orchestratorLaneId] = {
    platforms: [{ name: "Terminal", icon: "Terminal", iconColor: "text-zinc-400" }],
    summary: firstUser?.content?.slice(0, 200) || "No summary",
    tasks: [],
    artifacts: [],
    toolUsage: [...toolCounts.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        icon: TOOL_ICON_MAP[name] || "Terminal",
        count,
      })),
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
  const chatMessages: MonitorChatMessage[] = [];
  let msgSeq = 0;
  for (const msg of messages) {
    if ((msg.role === "user" || msg.role === "assistant") && msg.content) {
      if (chatMessages.length >= 50) {
        break;
      }
      chatMessages.push({
        id: `msg-${++msgSeq}`,
        role: msg.role,
        content: msg.content.slice(0, 500),
      });
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
    agentConfigs: {},
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
};
