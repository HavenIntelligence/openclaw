import fs from "node:fs/promises";
import path from "node:path";
import type { SupervisionStrategy, TeamConfig } from "./types.js";

function generateId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class TeamStore {
  private filePath: string;
  private teams: TeamConfig[] = [];

  constructor(clawdockDir: string) {
    this.filePath = path.join(clawdockDir, "teams.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.teams = JSON.parse(raw) as TeamConfig[];
    } catch {
      this.teams = [];
    }
  }

  list(): TeamConfig[] {
    return this.teams;
  }

  get(id: string): TeamConfig | null {
    return this.teams.find((t) => t.id === id) ?? null;
  }

  async create(params: Omit<TeamConfig, "id">): Promise<TeamConfig> {
    const team: TeamConfig = {
      ...params,
      id: generateId(),
    };
    this.teams.push(team);
    await this.persist();
    return team;
  }

  async update(id: string, partial: Partial<Omit<TeamConfig, "id">>): Promise<TeamConfig | null> {
    const idx = this.teams.findIndex((t) => t.id === id);
    if (idx < 0) {
      return null;
    }
    // Filter out undefined values so they don't overwrite existing fields
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined) {
        filtered[k] = v;
      }
    }
    this.teams[idx] = { ...this.teams[idx], ...filtered, id };
    await this.persist();
    return this.teams[idx];
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.teams.findIndex((t) => t.id === id);
    if (idx < 0) {
      return false;
    }
    this.teams.splice(idx, 1);
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.teams, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }
}

// Re-export types for convenience
export type { TeamConfig, SupervisionStrategy };
