import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayBroadcastFn } from "../gateway/server-broadcast.js";
import { resolveConfigDir } from "../utils.js";
import { FleetMonitor } from "./fleet-monitor.js";
import { LogStore } from "./log-store.js";
import { MessageBus } from "./message-bus.js";
import { Orchestrator } from "./orchestrator.js";
import { ProcessManager } from "./process-manager.js";
import { ProfileStore } from "./profile-store.js";
import { AgentRegistry } from "./registry.js";
import { AiderRunner } from "./runners/aider-runner.js";
import { ClaudeCodeRunner } from "./runners/claude-code-runner.js";
import { CodexRunner } from "./runners/codex-runner.js";
import { GeminiRunner } from "./runners/gemini-runner.js";
import { OpenClawRunner } from "./runners/openclaw-runner.js";
import { TaskStore } from "./task-store.js";
import { TeamStore } from "./team-store.js";
import type { TeamConfig } from "./types.js";

/**
 * CompanyService — top-level façade for ClawDock multi-agent orchestration.
 *
 * Wires together all sub-services and is initialized once at gateway startup.
 */
export class CompanyService {
  readonly registry: AgentRegistry;
  readonly processManager: ProcessManager;
  readonly orchestrator: Orchestrator;
  readonly fleetMonitor: FleetMonitor;
  readonly logStore: LogStore;
  readonly taskStore: TaskStore;
  readonly teamStore: TeamStore;
  readonly profileStore: ProfileStore;
  readonly messageBus: MessageBus;

  private constructor(
    private readonly clawdockDir: string,
    readonly broadcast: GatewayBroadcastFn,
  ) {
    this.registry = new AgentRegistry(clawdockDir);
    this.logStore = new LogStore();
    this.messageBus = new MessageBus();
    this.taskStore = new TaskStore(clawdockDir);
    this.teamStore = new TeamStore(clawdockDir);
    this.profileStore = new ProfileStore(clawdockDir);

    const runners = [
      new OpenClawRunner(),
      new ClaudeCodeRunner(),
      new GeminiRunner(),
      new CodexRunner(),
      new AiderRunner(),
    ];

    this.processManager = new ProcessManager(this.registry, this.logStore, broadcast, runners);
    this.orchestrator = new Orchestrator(
      this.processManager,
      this.registry,
      this.logStore,
      this.messageBus,
      broadcast,
      this.taskStore,
    );
    this.fleetMonitor = new FleetMonitor(this.processManager, broadcast);

    // Wire message bus → broadcast
    this.messageBus.onMessage((msg) => {
      broadcast("company.agent.message", { msg });
    });
  }

  static async create(broadcast: GatewayBroadcastFn): Promise<CompanyService> {
    const configDir = resolveConfigDir();
    const clawdockDir = path.join(configDir, "clawdock");
    await fs.mkdir(clawdockDir, { recursive: true });
    await fs.mkdir(path.join(clawdockDir, "logs"), { recursive: true });

    const svc = new CompanyService(clawdockDir, broadcast);
    await svc.init();
    return svc;
  }

  async init(): Promise<void> {
    await Promise.all([
      this.registry.load(),
      this.taskStore.load(),
      this.teamStore.load(),
      this.profileStore.load(),
    ]);
    this.fleetMonitor.start();
  }

  /**
   * Sync agent meta (team, reportTo) from team config so org chart, office, and teams
   * stay consistent. Call after team create/update/delete.
   * @param team - Updated team; members get team.name and reportTo = team.leaderId.
   * @param previousAgentIds - Agents that were in the team before; those no longer in team get team "general" and reportTo cleared.
   */
  async syncAgentMetaFromTeam(
    team: TeamConfig | null,
    previousAgentIds: string[] = [],
  ): Promise<void> {
    const currentIds = new Set(team?.agents ?? []);
    const toClear = previousAgentIds.filter((id) => !currentIds.has(id));
    for (const agentId of toClear) {
      await this.registry.upsertMeta(agentId, { team: "general", reportTo: undefined });
    }
    if (team) {
      for (const agentId of team.agents) {
        await this.registry.upsertMeta(agentId, {
          team: team.name,
          reportTo: team.leaderId?.trim() || undefined,
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    this.fleetMonitor.stop();
  }
}

// Singleton instance — set once by gateway startup
let _instance: CompanyService | null = null;

export function getCompanyService(): CompanyService {
  if (!_instance) {
    throw new Error("CompanyService not initialized");
  }
  return _instance;
}

export async function initCompanyService(broadcast: GatewayBroadcastFn): Promise<CompanyService> {
  _instance = await CompanyService.create(broadcast);
  return _instance;
}
