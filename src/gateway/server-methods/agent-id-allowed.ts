import { listAgentIds } from "../../agents/agent-scope.js";
import { getCompanyService } from "../../company/company-service.js";
import { loadConfig } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";

/**
 * Agent IDs allowed for gateway methods that take an agentId: config agents list
 * plus company registry (ClawDock) agents, so that Control UI and company fleet
 * can load files, tools, and skills for any listed agent.
 */
export function allowedAgentIds(cfg: ReturnType<typeof loadConfig>): Set<string> {
  const allowed = new Set(listAgentIds(cfg));
  try {
    for (const a of getCompanyService().registry.getAgents()) {
      if (a?.id) {
        allowed.add(normalizeAgentId(a.id));
      }
    }
  } catch {
    // Company service not initialized
  }
  return allowed;
}
