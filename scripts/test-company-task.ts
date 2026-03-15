#!/usr/bin/env bun
/**
 * Integration test: runs a task via ProcessManager + OpenClaw runner.
 * Prints every broadcast event so we can verify logs flow correctly.
 *
 * Usage: bun scripts/test-company-task.ts
 */
import { initCompanyService } from "../src/company/company-service.ts";
import type { AgentMessage, LogEntry } from "../src/company/types.ts";

// ── Capture broadcast events ───────────────────────────────────────────────
const events: Array<{ event: string; payload: unknown }> = [];

function broadcast(event: string, payload: unknown): void {
  events.push({ event, payload });
  const ts = new Date().toISOString().slice(11, 23);

  if (event === "company.agent.log") {
    const { agentId, entry } = payload as { agentId: string; runId: string; entry: LogEntry };
    const preview = entry.content.slice(0, 110).replace(/\n/g, " ");
    const tokens = entry.tokensUsed ? ` (${entry.tokensUsed} tok)` : "";
    console.log(`  [${ts}] [${entry.type.padEnd(10)}] ${agentId}: ${preview}${tokens}`);
  } else if (event === "company.agent.status") {
    const { agentId, status } = payload as { agentId: string; status: string };
    console.log(`  [${ts}] [STATUS    ] ${agentId} → ${status}`);
  } else if (event === "company.agent.message") {
    const { msg } = payload as { msg: AgentMessage };
    console.log(`  [${ts}] [MSG       ] ${msg.from} → ${msg.to}: ${msg.content.slice(0, 80)}`);
  }
}

console.log("🏢  ClawDock — task runner integration test\n");

// ── Init service ───────────────────────────────────────────────────────────
console.log("⚙️   Initializing CompanyService…");
const svc = await initCompanyService(broadcast as Parameters<typeof initCompanyService>[0]);
const agents = svc.registry.getAgents();

console.log(
  `✅  Loaded ${agents.length} agent(s): ${agents.map((a) => `${a.emoji} ${a.id}(${a.runtime})`).join(", ")}`,
);
console.log("");

if (agents.length === 0) {
  console.error("❌  No agents in ~/.openclaw/clawdock/agents-meta.json");
  process.exit(1);
}

// ── Pick target agent ──────────────────────────────────────────────────────
const target = agents.find((a) => a.id === "researcher") ?? agents[0];
const prompt =
  "List 3 key trends in AI agent development for 2026. For each trend write 1-2 sentences. Be direct.";

console.log(`🚀  Running task on: ${target.emoji} ${target.id} (runtime: ${target.runtime})`);
console.log(`📋  Prompt: "${prompt}"\n`);
console.log("─".repeat(72));

// ── Run the task ───────────────────────────────────────────────────────────
const start = Date.now();
let runId: string;
try {
  runId = await svc.processManager.runTask(target.id, prompt);
} catch (err) {
  console.error("\n❌  runTask() threw:", (err as Error).message);
  process.exit(1);
}

// Wait for the child process to finish (it exits on completion).
// Poll the runtime state until status returns to idle/crashed.
const POLL_MS = 500;
const TIMEOUT_MS = 120_000;
let waited = 0;
while (waited < TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  waited += POLL_MS;
  const state = svc.processManager.getState(target.id);
  if (state.status === "idle" || state.status === "crashed") {
    break;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const finalState = svc.processManager.getState(target.id);

console.log("─".repeat(72));
console.log(`\n✅  Task finished in ${elapsed}s  (runId: ${runId})`);
console.log(`    Final agent status: ${finalState.status}`);
console.log(`    Tasks completed:    ${finalState.tasksCompleted}`);
console.log(`    Tokens used:        ${finalState.tokensUsed}`);

// ── Print log store ────────────────────────────────────────────────────────
const storedLogs = svc.logStore.get(target.id);
console.log(`\n📜  Log store (${storedLogs.length} entries for ${target.id}):`);
for (const e of storedLogs) {
  const preview = e.content.slice(0, 100).replace(/\n/g, " ");
  const tokens = e.tokensUsed ? ` [${e.tokensUsed} tok]` : "";
  console.log(`    [${e.type.padEnd(10)}] ${preview}${tokens}`);
}

// ── Broadcast event summary ────────────────────────────────────────────────
const logEvents = events.filter((e) => e.event === "company.agent.log");
const statusEvents = events
  .filter((e) => e.event === "company.agent.status")
  .map((e) => (e.payload as { status: string }).status);

console.log(`\n📡  Broadcast summary:`);
console.log(`    company.agent.log    : ${logEvents.length} event(s)`);
console.log(`    company.agent.status : ${statusEvents.join(" → ")}`);

if (finalState.status === "crashed") {
  console.warn("\n⚠️   Agent crashed — check stderr output above.");
  process.exit(1);
}

process.exit(0);
