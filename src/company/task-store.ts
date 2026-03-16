import fs from "node:fs/promises";
import path from "node:path";
import type { Task, TaskPriority, TaskStatus } from "./types.js";

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class TaskStore {
  private filePath: string;
  private tasks: Task[] = [];

  constructor(clawdockDir: string) {
    this.filePath = path.join(clawdockDir, "tasks.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.tasks = JSON.parse(raw) as Task[];
    } catch {
      this.tasks = [];
    }
  }

  list(filters?: {
    status?: TaskStatus;
    assignee?: string;
    project?: string;
    missionId?: string;
  }): Task[] {
    let result = this.tasks;
    if (filters?.status) {
      result = result.filter((t) => t.status === filters.status);
    }
    if (filters?.assignee) {
      result = result.filter((t) => t.assignee === filters.assignee);
    }
    if (filters?.project) {
      result = result.filter((t) => t.project === filters.project);
    }
    if (filters?.missionId) {
      result = result.filter((t) => t.missionId === filters.missionId);
    }
    return result;
  }

  /** Return distinct missions with summary info for dropdown selectors. */
  listMissions(): Array<{
    missionId: string;
    title: string;
    startTime: number;
    endTime: number | null;
    agentCount: number;
    taskCount: number;
  }> {
    const grouped = new Map<string, Task[]>();
    for (const t of this.tasks) {
      if (!t.missionId) {
        continue;
      }
      const list = grouped.get(t.missionId) ?? [];
      list.push(t);
      grouped.set(t.missionId, list);
    }
    return [...grouped.entries()]
      .map(([missionId, tasks]) => {
        const top = tasks.find((t) => t.assignedBy === "human") ?? tasks[0];
        const agentIds = new Set(tasks.map((t) => t.agentId).filter(Boolean));
        const starts = tasks.map((t) => t.startTime ?? t.createdAt).filter(Boolean);
        const ends = tasks.map((t) => t.endTime).filter((e): e is number => e != null);
        return {
          missionId,
          title: top.title,
          startTime: starts.length > 0 ? Math.min(...starts) : top.createdAt,
          endTime: ends.length === tasks.length && ends.length > 0 ? Math.max(...ends) : null,
          agentCount: agentIds.size,
          taskCount: tasks.length,
        };
      })
      .toSorted((a, b) => b.startTime - a.startTime);
  }

  get(id: string): Task | null {
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  async create(
    params: Omit<Task, "id" | "createdAt" | "updatedAt"> & { status?: TaskStatus },
  ): Promise<Task> {
    const now = Date.now();
    const status = params.status ?? "backlog";
    const task: Task = {
      ...params,
      status,
      id: generateId(),
      agentId: params.agentId ?? params.assignee,
      startTime: params.startTime ?? (status === "in_progress" ? now : undefined),
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    await this.persist();
    return task;
  }

  async update(id: string, partial: Partial<Omit<Task, "id" | "createdAt">>): Promise<Task | null> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) {
      return null;
    }
    const now = Date.now();
    const prev = this.tasks[idx];
    const next: Task = {
      ...prev,
      ...partial,
      id,
      createdAt: prev.createdAt,
      updatedAt: now,
    };
    if (partial.assignee !== undefined) {
      next.agentId = partial.agentId ?? partial.assignee;
    }
    if (
      partial.status === "in_progress" &&
      prev.status !== "in_progress" &&
      next.startTime == null
    ) {
      next.startTime = now;
    }
    if (partial.status === "done" && next.endTime == null) {
      next.endTime = now;
    }
    this.tasks[idx] = next;
    await this.persist();
    return this.tasks[idx];
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) {
      return false;
    }
    this.tasks.splice(idx, 1);
    await this.persist();
    return true;
  }

  async assign(taskId: string, agentId: string): Promise<Task | null> {
    return this.update(taskId, { assignee: agentId, agentId });
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.tasks, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }
}

// Re-export types for convenience
export type { Task, TaskStatus, TaskPriority };
