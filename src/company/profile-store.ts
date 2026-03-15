import fs from "node:fs/promises";
import path from "node:path";
import type { CompanyProfile } from "./types.js";

const DEFAULT_PROFILE: CompanyProfile = {
  name: "My Company",
  updatedAt: 0,
};

export class ProfileStore {
  private filePath: string;
  private cache: CompanyProfile | null = null;

  constructor(clawdockDir: string) {
    this.filePath = path.join(clawdockDir, "profile.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.cache = JSON.parse(raw) as CompanyProfile;
    } catch {
      this.cache = { ...DEFAULT_PROFILE };
    }
  }

  get(): CompanyProfile {
    return this.cache ?? { ...DEFAULT_PROFILE };
  }

  async set(partial: Partial<Omit<CompanyProfile, "updatedAt">>): Promise<CompanyProfile> {
    const current = this.get();
    const updated: CompanyProfile = {
      ...current,
      ...partial,
      updatedAt: Date.now(),
    };
    this.cache = updated;
    await this.persist();
    return updated;
  }

  private async persist(): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.cache, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }
}
