import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/io.js";
import type { AgentMeta, ClawDockAgent, ClawDockRuntime } from "./types.js";

// ── Defaults when no ClawDock meta exists for an agent ────────────────────
const DEFAULT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

function defaultColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

// ── AgentRegistry ─────────────────────────────────────────────────────────
export class AgentRegistry {
  private metaFilePath: string;
  private metaById: Map<string, AgentMeta> = new Map();

  constructor(clawdockDir: string) {
    this.metaFilePath = path.join(clawdockDir, "agents-meta.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.metaFilePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, AgentMeta>;
      this.metaById = new Map(Object.entries(parsed));
    } catch {
      this.metaById = new Map();
    }
  }

  /** Merge core agent configs with ClawDock meta to produce ClawDockAgent list. */
  getAgents(): ClawDockAgent[] {
    const cfg = loadConfig();
    const list = cfg.agents?.list ?? [];
    const seen = new Set<string>();
    const result: ClawDockAgent[] = [];

    // 1. Agents from core config (merged with ClawDock meta if present)
    for (const a of list) {
      if (!a?.id) {
        continue;
      }
      seen.add(a.id);
      result.push(this.mergeAgent(a.id, a));
    }

    // 2. Standalone ClawDock agents (meta only, no core config entry)
    for (const [id, meta] of this.metaById) {
      if (seen.has(id)) {
        continue;
      }
      result.push(this.metaOnlyAgent(id, meta));
    }

    return result;
  }

  getAgent(id: string): ClawDockAgent | null {
    const cfg = loadConfig();
    const entry = (cfg.agents?.list ?? []).find((a) => a?.id === id);
    if (entry) {
      return this.mergeAgent(id, entry);
    }
    // Fall back to meta-only agent
    const meta = this.metaById.get(id);
    if (meta) {
      return this.metaOnlyAgent(id, meta);
    }
    return null;
  }

  async upsertMeta(id: string, partial: Partial<AgentMeta>): Promise<AgentMeta> {
    const existing = this.metaById.get(id) ?? this.defaultMeta(id);
    const updated: AgentMeta = { ...existing, ...partial, id };
    this.metaById.set(id, updated);
    await this.persistMeta();
    return updated;
  }

  async deleteMeta(id: string): Promise<void> {
    this.metaById.delete(id);
    await this.persistMeta();
  }

  getMeta(id: string): AgentMeta | null {
    return this.metaById.get(id) ?? null;
  }

  /** Compute direct reports by scanning all agents' reportTo field. */
  getDirectReports(agentId: string): string[] {
    const reports: string[] = [];
    for (const [id, meta] of this.metaById) {
      if (meta.reportTo === agentId) {
        reports.push(id);
      }
    }
    return reports;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private mergeAgent(
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentEntry: any,
  ): ClawDockAgent {
    const meta = this.metaById.get(id) ?? this.defaultMeta(id);
    // Resolve model string from AgentModelConfig or raw string
    const modelRaw = agentEntry.model;
    const model =
      typeof modelRaw === "string"
        ? modelRaw
        : typeof modelRaw === "object" && modelRaw !== null && typeof modelRaw.primary === "string"
          ? modelRaw.primary
          : "default";

    // Count tools from config (approximation from tool sections)
    const toolCount = countTools(agentEntry.tools);
    const cronCount = 0; // resolved externally by CronService when needed

    return {
      id,
      name: agentEntry.name ?? id,
      model,
      skills: agentEntry.skills,
      role: meta.role,
      team: meta.team,
      emoji: meta.emoji,
      color: meta.color,
      description: meta.description,
      runtime: meta.runtime,
      reportTo: meta.reportTo,
      directReports: meta.directReports ?? [],
      toolCount,
      cronCount,
      status: "idle",
      tokensUsed: 0,
      tasksCompleted: 0,
    };
  }

  /** Build a ClawDockAgent from metadata only (no core config entry). */
  private metaOnlyAgent(id: string, meta: AgentMeta): ClawDockAgent {
    return {
      id,
      name: id,
      model: "default",
      role: meta.role,
      team: meta.team,
      emoji: meta.emoji,
      color: meta.color,
      description: meta.description,
      runtime: meta.runtime,
      reportTo: meta.reportTo,
      directReports: meta.directReports ?? [],
      toolCount: 0,
      cronCount: 0,
      status: "idle",
      tokensUsed: 0,
      tasksCompleted: 0,
    };
  }

  private defaultMeta(id: string): AgentMeta {
    return {
      id,
      role: "Agent",
      team: "general",
      emoji: "🤖",
      color: defaultColorForId(id),
      description: "",
      runtime: "openclaw" as ClawDockRuntime,
    };
  }

  private async persistMeta(): Promise<void> {
    const obj: Record<string, AgentMeta> = {};
    for (const [k, v] of this.metaById) {
      obj[k] = v;
    }
    const tmp = `${this.metaFilePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf-8");
    await fs.rename(tmp, this.metaFilePath);
  }
}

// ── Utility: estimate tool count from AgentToolsConfig ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countTools(tools: any): number {
  if (!tools || typeof tools !== "object") {
    return 0;
  }
  let count = 0;
  // Rough count — each top-level non-null key in tools config is a tool group
  for (const key of Object.keys(tools)) {
    if (tools[key] !== null && tools[key] !== false) {
      count++;
    }
  }
  return count;
}
