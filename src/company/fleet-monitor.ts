import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { GatewayBroadcastFn } from "../gateway/server-broadcast.js";
import type { ProcessManager } from "./process-manager.js";
import type { FleetMetric, FleetSnapshot } from "./types.js";

const execAsync = promisify(exec);
const POLL_INTERVAL_MS = 5000;

/**
 * Polls CPU and memory for tracked agent processes every 5 s.
 * Emits company.fleet.metrics broadcast after each poll.
 */
export class FleetMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: FleetSnapshot | null = null;

  constructor(
    private readonly processManager: ProcessManager,
    private readonly broadcast: GatewayBroadcastFn,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): FleetSnapshot | null {
    return this.lastSnapshot;
  }

  private async poll(): Promise<void> {
    const states = this.processManager.getAllStates();
    const metrics: FleetMetric[] = [];

    // Collect PIDs for bulk ps query
    const pidToAgentId = new Map<number, string>();
    for (const s of states) {
      if (s.pid) {
        pidToAgentId.set(s.pid, s.agentId);
      }
    }

    // Query CPU+RSS via ps if any PIDs exist
    const pidMetrics = new Map<number, { cpu: number; memMb: number }>();
    if (pidToAgentId.size > 0) {
      const pids = Array.from(pidToAgentId.keys()).join(",");
      try {
        const { stdout } = await execAsync(`ps -p ${pids} -o pid=,pcpu=,rss= 2>/dev/null || true`);
        for (const line of stdout.split("\n")) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const pid = parseInt(parts[0], 10);
            const cpu = parseFloat(parts[1]);
            const rssMb = parseInt(parts[2], 10) / 1024; // rss is in KB
            if (!isNaN(pid) && !isNaN(cpu) && !isNaN(rssMb)) {
              pidMetrics.set(pid, { cpu, memMb: rssMb });
            }
          }
        }
      } catch {
        // ps failed — continue without metrics
      }
    }

    let totalRunning = 0;
    let totalIdle = 0;
    let totalCrashed = 0;
    let totalTasks = 0;

    for (const s of states) {
      const ps = s.pid ? pidMetrics.get(s.pid) : undefined;
      const metric: FleetMetric = {
        agentId: s.agentId,
        status: s.status,
        cpuPercent: ps?.cpu ?? 0,
        memoryMb: ps?.memMb ?? s.memoryMb ?? 0,
        tokensUsed: s.tokensUsed,
        tasksCompleted: s.tasksCompleted,
        uptimePct: computeUptime(s),
        lastActiveAt: s.lastActiveAt,
      };
      metrics.push(metric);

      if (s.status === "active" || s.status === "starting") {
        totalRunning++;
      } else if (s.status === "idle" || s.status === "paused") {
        totalIdle++;
      } else if (s.status === "crashed") {
        totalCrashed++;
      }
      totalTasks += s.tasksCompleted;
    }

    const snapshot: FleetSnapshot = {
      agents: metrics,
      totalRunning,
      totalIdle,
      totalCrashed,
      totalTasks,
      ts: Date.now(),
    };
    this.lastSnapshot = snapshot;
    this.broadcast("company.fleet.metrics", snapshot, { dropIfSlow: true });
  }
}

function computeUptime(state: {
  startedAt?: number;
  lastActiveAt?: number;
  status: string;
}): number {
  if (!state.startedAt) {
    return 0;
  }
  const now = Date.now();
  const total = now - state.startedAt;
  if (total <= 0) {
    return 100;
  }
  if (state.status === "crashed") {
    // Crashed: use lastActiveAt as end of uptime
    const active = (state.lastActiveAt ?? state.startedAt) - state.startedAt;
    return Math.round(Math.max(0, Math.min(100, (active / total) * 100)));
  }
  return 100;
}
