import type { LogEntry } from "./types.js";

const MAX_BUFFER = 200;

function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-memory ring-buffer log store per agent.
 * Optionally persists logs as NDJSON files on disk (handled by process-manager).
 */
export class LogStore {
  private buffers: Map<string, LogEntry[]> = new Map();

  append(entry: Partial<LogEntry> & { agentId: string; runId: string }): LogEntry {
    const full: LogEntry = {
      id: generateId(),
      type: "output",
      content: "",
      ts: Date.now(),
      ...entry,
    };
    if (!this.buffers.has(full.agentId)) {
      this.buffers.set(full.agentId, []);
    }
    const buf = this.buffers.get(full.agentId)!;
    buf.push(full);
    // Trim to ring buffer limit
    if (buf.length > MAX_BUFFER) {
      buf.splice(0, buf.length - MAX_BUFFER);
    }
    return full;
  }

  get(agentId: string, opts?: { limit?: number; sinceTs?: number }): LogEntry[] {
    const buf = this.buffers.get(agentId) ?? [];
    let result = buf;
    if (opts?.sinceTs !== undefined) {
      result = result.filter((e) => e.ts > opts.sinceTs!);
    }
    if (opts?.limit !== undefined && opts.limit > 0) {
      result = result.slice(-opts.limit);
    }
    return result;
  }

  clear(agentId: string): void {
    this.buffers.delete(agentId);
  }
}
