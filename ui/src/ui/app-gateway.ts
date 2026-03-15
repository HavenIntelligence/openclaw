import {
  GATEWAY_EVENT_UPDATE_AVAILABLE,
  type GatewayUpdateAvailableEventPayload,
} from "../../../src/gateway/events.js";
import { ConnectErrorDetailCodes } from "../../../src/gateway/protocol/connect-error-details.js";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat.ts";
import type { EventLogEntry } from "./app-events.ts";
import {
  applySettings,
  loadCron,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import type { OpenClawApp } from "./app.ts";
import { shouldReloadHistoryForFinalEvent } from "./chat-event-reload.ts";
import type {
  AgentMessage,
  ClawDockAgent,
  FleetSnapshot,
  LogEntry as CompanyLogEntry,
  Task,
  TeamConfig,
} from "./company-types.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat.ts";
import { loadCompanyAll } from "./controllers/company.ts";
import { loadDevices } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval.ts";
import { loadHealthState } from "./controllers/health.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions } from "./controllers/sessions.ts";
import {
  resolveGatewayErrorDetailCode,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from "./gateway.ts";
import { GatewayBrowserClient } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import type {
  AgentsListResult,
  PresenceEntry,
  HealthSummary,
  StatusSummary,
  UpdateAvailable,
} from "./types.ts";

function isGenericBrowserFetchFailure(message: string): boolean {
  return /^(?:typeerror:\s*)?(?:fetch failed|failed to fetch)$/i.test(message.trim());
}

function formatAuthCloseErrorMessage(code: string | null, fallback: string): string {
  const resolvedCode = code ?? "";
  if (resolvedCode === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH) {
    return "unauthorized: gateway token mismatch (open dashboard URL with current token)";
  }
  if (resolvedCode === ConnectErrorDetailCodes.AUTH_RATE_LIMITED) {
    return "unauthorized: too many failed authentication attempts (retry later)";
  }
  if (resolvedCode === ConnectErrorDetailCodes.AUTH_UNAUTHORIZED) {
    return "unauthorized: authentication failed";
  }
  return fallback;
}

type GatewayHost = {
  settings: UiSettings;
  password: string;
  clientInstanceId: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastErrorCode: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  healthLoading: boolean;
  healthResult: HealthSummary | null;
  healthError: string | null;
  debugHealth: HealthSummary | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  serverVersion: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  updateAvailable: UpdateAvailable | null;
  companyAgents: ClawDockAgent[];
  companyFleetSnapshot: FleetSnapshot | null;
  companyTasks: Task[];
  companyTeams: TeamConfig[];
  companyAgentLogs: Map<string, CompanyLogEntry[]>;
  companyMessages: AgentMessage[];
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

export function resolveControlUiClientVersion(params: {
  gatewayUrl: string;
  serverVersion: string | null;
  pageUrl?: string;
}): string | undefined {
  const serverVersion = params.serverVersion?.trim();
  if (!serverVersion) {
    return undefined;
  }
  const pageUrl =
    params.pageUrl ?? (typeof window === "undefined" ? undefined : window.location.href);
  if (!pageUrl) {
    return undefined;
  }
  try {
    const page = new URL(pageUrl);
    const gateway = new URL(params.gatewayUrl, page);
    const allowedProtocols = new Set(["ws:", "wss:", "http:", "https:"]);
    if (!allowedProtocols.has(gateway.protocol) || gateway.host !== page.host) {
      return undefined;
    }
    return serverVersion;
  } catch {
    return undefined;
  }
}

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) {
    return raw;
  }
  if (!raw) {
    return mainSessionKey;
  }
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) {
    return;
  }
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.lastErrorCode = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;

  const previousClient = host.client;
  const clientVersion = resolveControlUiClientVersion({
    gatewayUrl: host.settings.gatewayUrl,
    serverVersion: host.serverVersion,
  });
  const client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    clientVersion,
    mode: "webchat",
    instanceId: host.clientInstanceId,
    onHello: (hello) => {
      if (host.client !== client) {
        return;
      }
      host.connected = true;
      host.lastError = null;
      host.lastErrorCode = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadHealthState(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
      // Load company data on every connect/reconnect so views start with real data.
      void loadCompanyAll(host as unknown as import("./controllers/company.ts").CompanyState);
    },
    onClose: ({ code, reason, error }) => {
      if (host.client !== client) {
        return;
      }
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      host.lastErrorCode =
        resolveGatewayErrorDetailCode(error) ??
        (typeof error?.code === "string" ? error.code : null);
      if (code !== 1012) {
        if (error?.message) {
          host.lastError =
            host.lastErrorCode && isGenericBrowserFetchFailure(error.message)
              ? formatAuthCloseErrorMessage(host.lastErrorCode, error.message)
              : error.message;
          return;
        }
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      } else {
        host.lastError = null;
        host.lastErrorCode = null;
      }
    },
    onEvent: (evt) => {
      if (host.client !== client) {
        return;
      }
      handleGatewayEvent(host, evt);
    },
    onGap: ({ expected, received }) => {
      if (host.client !== client) {
        return;
      }
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
      host.lastErrorCode = null;
    },
  });
  host.client = client;
  previousClient?.stop();
  client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleTerminalChatEvent(
  host: GatewayHost,
  payload: ChatEventPayload | undefined,
  state: ReturnType<typeof handleChatEvent>,
): boolean {
  if (state !== "final" && state !== "error" && state !== "aborted") {
    return false;
  }
  // Check if tool events were seen before resetting (resetToolStream clears toolStreamOrder).
  const toolHost = host as unknown as Parameters<typeof resetToolStream>[0];
  const hadToolEvents = toolHost.toolStreamOrder.length > 0;
  resetToolStream(toolHost);
  void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
  const runId = payload?.runId;
  if (runId && host.refreshSessionsAfterChat.has(runId)) {
    host.refreshSessionsAfterChat.delete(runId);
    if (state === "final") {
      void loadSessions(host as unknown as OpenClawApp, {
        activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
      });
    }
  }
  // Reload history when tools were used so the persisted tool results
  // replace the now-cleared streaming state.
  if (hadToolEvents && state === "final") {
    void loadChatHistory(host as unknown as OpenClawApp);
    return true;
  }
  return false;
}

function handleChatGatewayEvent(host: GatewayHost, payload: ChatEventPayload | undefined) {
  if (payload?.sessionKey) {
    setLastActiveSessionKey(
      host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
      payload.sessionKey,
    );
  }
  const state = handleChatEvent(host as unknown as OpenClawApp, payload);
  const historyReloaded = handleTerminalChatEvent(host, payload, state);
  if (state === "final" && !historyReloaded && shouldReloadHistoryForFinalEvent(payload)) {
    void loadChatHistory(host as unknown as OpenClawApp);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug" || host.tab === "overview") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    // Reload history after each tool result so the persisted text + tool
    // output replaces any truncated streaming fragments.
    const agentPayload = evt.payload as AgentEventPayload | undefined;
    const toolData = agentPayload?.data;
    if (
      agentPayload?.stream === "tool" &&
      typeof toolData?.phase === "string" &&
      toolData.phase === "result"
    ) {
      void loadChatHistory(host as unknown as OpenClawApp);
    }
    return;
  }

  if (evt.event === "chat") {
    handleChatGatewayEvent(host, evt.payload as ChatEventPayload | undefined);
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
    return;
  }

  if (evt.event === GATEWAY_EVENT_UPDATE_AVAILABLE) {
    const payload = evt.payload as GatewayUpdateAvailableEventPayload | undefined;
    host.updateAvailable = payload?.updateAvailable ?? null;
  }

  if (evt.event === "company.agent.status") {
    const { agentId, status } = evt.payload as { agentId: string; status: string };
    // Replace the agent object to trigger @state() reactive update
    const idx = host.companyAgents.findIndex((a) => a.id === agentId);
    if (idx >= 0) {
      const updated = { ...host.companyAgents[idx], status: status as ClawDockAgent["status"] };
      host.companyAgents = [
        ...host.companyAgents.slice(0, idx),
        updated,
        ...host.companyAgents.slice(idx + 1),
      ];
    }
    return;
  }

  if (evt.event === "company.agent.log") {
    const { agentId, entry } = evt.payload as { agentId: string; entry: CompanyLogEntry };
    if (!host.companyAgentLogs.has(agentId)) {
      host.companyAgentLogs.set(agentId, []);
    }
    const buf = host.companyAgentLogs.get(agentId)!;
    buf.push(entry);
    if (buf.length > 200) {
      buf.shift();
    }
    // companyAgentLogs is a Map (not @state), create a new Map reference to trigger reactivity
    host.companyAgentLogs = new Map(host.companyAgentLogs);
    return;
  }

  if (evt.event === "company.fleet.metrics") {
    host.companyFleetSnapshot = evt.payload as FleetSnapshot;
    return;
  }

  if (evt.event === "company.task.updated") {
    const { task } = evt.payload as { task: Task };
    const idx = host.companyTasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      host.companyTasks = [
        ...host.companyTasks.slice(0, idx),
        task,
        ...host.companyTasks.slice(idx + 1),
      ];
    } else {
      host.companyTasks = [...host.companyTasks, task];
    }
    return;
  }

  if (evt.event === "company.team.updated") {
    const { team } = evt.payload as { team: TeamConfig };
    const idx = host.companyTeams.findIndex((t) => t.id === team.id);
    if (idx >= 0) {
      host.companyTeams = [
        ...host.companyTeams.slice(0, idx),
        team,
        ...host.companyTeams.slice(idx + 1),
      ];
    } else {
      host.companyTeams = [...host.companyTeams, team];
    }
    return;
  }

  if (evt.event === "company.agent.message") {
    const { msg } = evt.payload as { msg: AgentMessage };
    const messages = host.companyMessages ?? [];
    host.companyMessages = [...messages.slice(-499), msg];
    return;
  }

  if (evt.event === "company.orchestration.phase") {
    const { agentId, phase } = evt.payload as { agentId: string; phase: string; depth: number };
    // Map orchestration phases to agent status so the animation reacts
    const phaseToStatus: Record<string, ClawDockAgent["status"]> = {
      planning: "active",
      delegating: "active",
      synthesizing: "active",
      verifying: "active",
      executing: "active",
      complete: "idle",
      failed: "crashed",
    };
    const mapped = phaseToStatus[phase];
    if (mapped) {
      const idx = host.companyAgents.findIndex((a) => a.id === agentId);
      if (idx >= 0) {
        const updated = { ...host.companyAgents[idx], status: mapped };
        host.companyAgents = [
          ...host.companyAgents.slice(0, idx),
          updated,
          ...host.companyAgents.slice(idx + 1),
        ];
      }
    }
    // Also inject a synthetic log entry so orchestration phases show in the execution log
    const phaseLabel: Record<string, string> = {
      planning: "Planning — analyzing task and determining delegation…",
      delegating: "Delegating subtasks to subordinates…",
      synthesizing: "Synthesizing subordinate results into final answer…",
      verifying: "Verifying result quality — checking if another round is needed…",
      executing: "Executing task directly…",
      complete: "Task completed.",
      failed: "Orchestration failed.",
    };
    if (phaseLabel[phase]) {
      const logEntry: CompanyLogEntry = {
        id: `orch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        runId: `orch_phase`,
        type: phase === "failed" ? "error" : "system",
        content: phaseLabel[phase],
        ts: Date.now(),
      };
      if (!host.companyAgentLogs.has(agentId)) {
        host.companyAgentLogs.set(agentId, []);
      }
      host.companyAgentLogs.get(agentId)!.push(logEntry);
      host.companyAgentLogs = new Map(host.companyAgentLogs);
    }
    return;
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSummary;
        sessionDefaults?: SessionDefaultsSnapshot;
        updateAvailable?: UpdateAvailable;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
    host.healthResult = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
  host.updateAvailable = snapshot?.updateAvailable ?? null;
}
