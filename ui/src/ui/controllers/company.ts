import type {
  AgentMessage,
  ClawDockAgent,
  CompanyProfile,
  FleetSnapshot,
  LogEntry,
  Task,
  TeamConfig,
} from "../company-types.ts";
import type { GatewayBrowserClient } from "../gateway.ts";

// ── State slice ────────────────────────────────────────────────────────────
export type CompanyState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  companyAgents: ClawDockAgent[];
  companyAgentsLoading: boolean;
  companyFleetSnapshot: FleetSnapshot | null;
  companyTasks: Task[];
  companyTeams: TeamConfig[];
  companyProfile: CompanyProfile | null;
  companyAgentLogs: Map<string, LogEntry[]>;
  companyMessages: AgentMessage[];
};

// ── Loaders ────────────────────────────────────────────────────────────────

export async function loadCompanyAgents(state: CompanyState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.companyAgentsLoading = true;
  try {
    state.companyAgents = await state.client.request<ClawDockAgent[]>("company.agents.list", {});
  } catch {
    // best-effort — leave existing state
  } finally {
    state.companyAgentsLoading = false;
  }
}

export async function loadCompanyFleet(state: CompanyState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    state.companyFleetSnapshot = await state.client.request<FleetSnapshot>(
      "company.fleet.snapshot",
      {},
    );
  } catch {
    // best-effort
  }
}

export async function loadCompanyTasks(
  state: CompanyState,
  filters?: { status?: string; assignee?: string; project?: string },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    state.companyTasks = await state.client.request<Task[]>("company.tasks.list", filters ?? {});
  } catch {
    // best-effort
  }
}

export async function loadCompanyTeams(state: CompanyState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    state.companyTeams = await state.client.request<TeamConfig[]>("company.teams.list", {});
  } catch {
    // best-effort
  }
}

export async function loadCompanyProfile(state: CompanyState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    state.companyProfile = await state.client.request<CompanyProfile>("company.profile.get", {});
  } catch {
    // best-effort
  }
}

/** Load all company data in parallel. */
export async function loadCompanyAll(state: CompanyState): Promise<void> {
  await Promise.all([
    loadCompanyAgents(state),
    loadCompanyFleet(state),
    loadCompanyTasks(state),
    loadCompanyTeams(state),
    loadCompanyProfile(state),
    loadCompanyMessages(state),
  ]);
  // Load logs after agents are fetched (loadCompanyAgents populates state.companyAgents).
  await loadAllAgentLogs(state);
}

// ── Agent creation ────────────────────────────────────────────────────────

export type CreateAgentParams = {
  name: string;
  id?: string;
  role?: string;
  team?: string;
  emoji?: string;
  color?: string;
  runtime?: string;
  description?: string;
};

export async function createAgent(
  state: CompanyState,
  params: CreateAgentParams,
): Promise<ClawDockAgent | null> {
  if (!state.client) {
    return null;
  }
  try {
    const agent = await state.client.request<ClawDockAgent>("company.agents.create", params);
    await loadCompanyAgents(state);
    return agent;
  } catch {
    return null;
  }
}

export async function updateAgent(
  state: CompanyState,
  agentId: string,
  partial: Record<string, unknown>,
): Promise<ClawDockAgent | null> {
  if (!state.client) {
    return null;
  }
  try {
    const agent = await state.client.request<ClawDockAgent>("company.agents.update", {
      id: agentId,
      ...partial,
    });
    await loadCompanyAgents(state);
    return agent;
  } catch {
    return null;
  }
}

// ── Agent actions ─────────────────────────────────────────────────────────

export async function startAgent(
  state: CompanyState,
  agentId: string,
  task?: string,
): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.agents.start", { id: agentId, task });
}

export async function stopAgent(state: CompanyState, agentId: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.agents.stop", { id: agentId });
}

export async function restartAgent(state: CompanyState, agentId: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.agents.restart", { id: agentId });
}

export async function pauseAgent(state: CompanyState, agentId: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.agents.pause", { id: agentId });
}

export async function resumeAgent(state: CompanyState, agentId: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.agents.resume", { id: agentId });
}

export async function sendMessageToCompany(
  state: CompanyState,
  content: string,
): Promise<string | null> {
  if (!state.client) {
    return null;
  }
  const result = await state.client.request<{ runId?: string; msgId: string }>(
    "company.message.send",
    { content },
  );
  return result.runId ?? null;
}

export async function loadCompanyMessages(state: CompanyState, limit = 100): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    state.companyMessages = await state.client.request<AgentMessage[]>("company.messages.list", {
      limit,
    });
  } catch {
    // best-effort
  }
}

export async function runAgentTask(
  state: CompanyState,
  agentId: string,
  prompt: string,
): Promise<string | null> {
  if (!state.client) {
    return null;
  }
  const result = await state.client.request<{ runId: string }>("company.agents.run", {
    id: agentId,
    prompt,
  });
  return result.runId ?? null;
}

export async function loadAgentLogs(
  state: CompanyState,
  agentId: string,
  limit = 100,
): Promise<void> {
  if (!state.client) {
    return;
  }
  const logs = await state.client.request<LogEntry[]>("company.agents.logs", {
    id: agentId,
    limit,
  });
  // Use immutable update to trigger @state() reactivity.
  const newMap = new Map(state.companyAgentLogs);
  newMap.set(agentId, logs);
  state.companyAgentLogs = newMap;
}

/** Load logs for all known agents. Called on connect and after agent list changes. */
export async function loadAllAgentLogs(state: CompanyState, limit = 100): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  for (const agent of state.companyAgents) {
    await loadAgentLogs(state, agent.id, limit);
  }
}

// ── Task actions ──────────────────────────────────────────────────────────

export async function createTask(
  state: CompanyState,
  params: Omit<Task, "id" | "createdAt" | "updatedAt">,
): Promise<Task | null> {
  if (!state.client) {
    return null;
  }
  return await state.client.request<Task>("company.tasks.create", params);
}

export async function updateTask(
  state: CompanyState,
  id: string,
  partial: Partial<Task>,
): Promise<Task | null> {
  if (!state.client) {
    return null;
  }
  return await state.client.request<Task>("company.tasks.update", { id, ...partial });
}

export async function deleteTask(state: CompanyState, id: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.tasks.delete", { id });
}

export async function assignTask(
  state: CompanyState,
  taskId: string,
  agentId: string,
): Promise<Task | null> {
  if (!state.client) {
    return null;
  }
  return await state.client.request<Task>("company.tasks.assign", { taskId, agentId });
}

// ── Team actions ──────────────────────────────────────────────────────────

export async function createTeam(
  state: CompanyState,
  params: Omit<TeamConfig, "id">,
): Promise<TeamConfig | null> {
  if (!state.client) {
    return null;
  }
  return await state.client.request<TeamConfig>("company.teams.create", params);
}

export async function updateTeam(
  state: CompanyState,
  id: string,
  partial: Partial<Omit<TeamConfig, "id">>,
): Promise<TeamConfig | null> {
  if (!state.client) {
    return null;
  }
  return await state.client.request<TeamConfig>("company.teams.update", { id, ...partial });
}

export async function deleteTeam(state: CompanyState, id: string): Promise<void> {
  if (!state.client) {
    return;
  }
  await state.client.request("company.teams.delete", { id });
}

// ── Profile actions ────────────────────────────────────────────────────────

export async function saveCompanyProfile(
  state: CompanyState,
  partial: Partial<Omit<CompanyProfile, "updatedAt">>,
): Promise<void> {
  if (!state.client) {
    return;
  }
  state.companyProfile = await state.client.request<CompanyProfile>("company.profile.set", partial);
}
