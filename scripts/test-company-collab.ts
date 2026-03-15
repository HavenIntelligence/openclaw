#!/usr/bin/env npx tsx
/**
 * Multi-agent collaboration test — agents discuss company development strategy.
 *
 * Flow:
 *  1. CEO outlines 3 strategic priorities
 *  2. Researcher + DevOps analyze in parallel (given CEO's output)
 *  3. Writer synthesizes all inputs into a final memo
 *
 * Usage: npx tsx scripts/test-company-collab.ts
 */
import { initCompanyService } from "../src/company/company-service.ts";
import type { CompanyService } from "../src/company/company-service.ts";
import type { LogEntry } from "../src/company/types.ts";

// ── Broadcast logger ─────────────────────────────────────────────────────
function broadcast(event: string, payload: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  if (event === "company.agent.log") {
    const { agentId, entry } = payload as { agentId: string; entry: LogEntry };
    if (entry.type === "output") {
      const preview = entry.content.slice(0, 120).replace(/\n/g, " ");
      console.log(`  [${ts}] 📝 ${agentId.padEnd(12)} ${preview}`);
    }
  } else if (event === "company.agent.status") {
    const { agentId, status } = payload as { agentId: string; status: string };
    console.log(`  [${ts}] ⚡ ${agentId.padEnd(12)} → ${status}`);
  }
}

// ── Wait for agent to finish ─────────────────────────────────────────────
async function waitForAgent(
  svc: CompanyService,
  agentId: string,
  timeoutMs = 120_000,
): Promise<string> {
  const POLL = 500;
  let waited = 0;
  while (waited < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL));
    waited += POLL;
    const state = svc.processManager.getState(agentId);
    if (state.status === "idle" || state.status === "crashed") {
      // Return the last output log entry
      const logs = svc.logStore.get(agentId);
      const outputLogs = logs.filter((l) => l.type === "output");
      return outputLogs.length > 0 ? outputLogs[outputLogs.length - 1].content : "(no output)";
    }
  }
  return "(timeout)";
}

console.log("🏢  ClawDock — Multi-Agent Collaboration: Company Strategy Discussion\n");

const svc = await initCompanyService(broadcast as Parameters<typeof initCompanyService>[0]);
const agents = svc.registry.getAgents();
console.log(
  `✅  ${agents.length} agents ready: ${agents.map((a) => `${a.emoji} ${a.id}`).join(", ")}\n`,
);

const totalStart = Date.now();

// ── Phase 1: CEO sets direction ──────────────────────────────────────────
console.log("━".repeat(72));
console.log("📌  Phase 1: CEO — Strategic Vision");
console.log("━".repeat(72));

await svc.processManager.runTask(
  "ceo",
  "You are leading an AI agent orchestration startup called OpenClaw Labs. " +
    "Outline exactly 3 strategic priorities for the next 12 months. " +
    "For each priority: name it, explain why it matters, and suggest one concrete action. " +
    "Keep it under 200 words total. Be direct and specific.",
);
const ceoOutput = await waitForAgent(svc, "ceo");
console.log(`\n📋  CEO Output:\n${ceoOutput}\n`);

// ── Phase 2: Researcher + DevOps analyze in parallel ─────────────────────
console.log("━".repeat(72));
console.log("📌  Phase 2: Researcher + DevOps — Parallel Analysis");
console.log("━".repeat(72));

const ceoSummary = ceoOutput.slice(0, 500);

await Promise.all([
  svc.processManager.runTask(
    "researcher",
    `The CEO proposed these strategic priorities:\n\n${ceoSummary}\n\n` +
      "As a research analyst, evaluate these priorities. " +
      "For each one: is the market evidence strong? What's the biggest risk? " +
      "Suggest one adjustment if needed. Keep it under 150 words total.",
  ),
  svc.processManager.runTask(
    "devops",
    `The CEO proposed these strategic priorities:\n\n${ceoSummary}\n\n` +
      "As a DevOps engineer, evaluate the technical feasibility. " +
      "For each priority: what infrastructure is needed? What's the main technical challenge? " +
      "Keep it under 150 words total.",
  ),
]);

const [researcherOutput, devopsOutput] = await Promise.all([
  waitForAgent(svc, "researcher"),
  waitForAgent(svc, "devops"),
]);
console.log(`\n🔍  Researcher Output:\n${researcherOutput}\n`);
console.log(`\n🛠  DevOps Output:\n${devopsOutput}\n`);

// ── Phase 3: Writer synthesizes ──────────────────────────────────────────
console.log("━".repeat(72));
console.log("📌  Phase 3: Writer — Final Strategy Memo");
console.log("━".repeat(72));

await svc.processManager.runTask(
  "writer",
  "Write a brief strategy memo for OpenClaw Labs based on these team inputs:\n\n" +
    `CEO PRIORITIES:\n${ceoOutput.slice(0, 400)}\n\n` +
    `RESEARCH ANALYSIS:\n${researcherOutput.slice(0, 400)}\n\n` +
    `DEVOPS ASSESSMENT:\n${devopsOutput.slice(0, 400)}\n\n` +
    "Synthesize into a concise memo with: Executive Summary (2-3 sentences), " +
    "Top 3 Action Items (one line each), and Key Risk (one sentence). " +
    "Keep the whole memo under 200 words. Write in a professional but direct tone.",
);
const writerOutput = await waitForAgent(svc, "writer");
console.log(`\n✍️  Final Memo:\n${writerOutput}\n`);

// ── Summary ──────────────────────────────────────────────────────────────
const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log("━".repeat(72));
console.log("📊  Collaboration Summary");
console.log("━".repeat(72));

const allStates = svc.processManager.getAllStates();
let totalTokens = 0;
for (const s of allStates) {
  totalTokens += s.tokensUsed;
  if (s.tasksCompleted > 0) {
    console.log(
      `  ${s.agentId.padEnd(12)} ${s.status.padEnd(8)} tasks=${s.tasksCompleted}  tokens=${s.tokensUsed}`,
    );
  }
}

console.log(`\n  Total time:   ${totalElapsed}s`);
console.log(`  Total tokens: ${totalTokens}`);
console.log(`  Agents used:  ${allStates.filter((s) => s.tasksCompleted > 0).length}/4`);

const allOk = allStates.every((s) => s.status !== "crashed");
console.log(
  `\n${allOk ? "✅" : "⚠️"}  Collaboration ${allOk ? "COMPLETED" : "PARTIAL — some agents crashed"}`,
);
process.exit(allOk ? 0 : 1);
