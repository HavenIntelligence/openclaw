#!/usr/bin/env npx tsx
/**
 * Multi-agent group integration test — runs 2 agents in parallel, tests
 * team listing, task CRUD, profile, and fleet snapshot.
 *
 * Usage: npx tsx scripts/test-company-group.ts
 */
import { initCompanyService } from "../src/company/company-service.ts";
import type { LogEntry } from "../src/company/types.ts";

function broadcast(event: string, payload: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  if (event === "company.agent.log") {
    const { agentId, entry } = payload as { agentId: string; entry: LogEntry };
    const preview = entry.content.slice(0, 90).replace(/\n/g, " ");
    console.log(`  [${ts}] LOG  ${agentId.padEnd(12)} [${entry.type.padEnd(8)}] ${preview}`);
  } else if (event === "company.agent.status") {
    const { agentId, status } = payload as { agentId: string; status: string };
    console.log(`  [${ts}] STAT ${agentId.padEnd(12)} → ${status}`);
  }
}

console.log("🏢  ClawDock — multi-agent group test\n");

const svc = await initCompanyService(broadcast as Parameters<typeof initCompanyService>[0]);
const agents = svc.registry.getAgents();
console.log(`✅  ${agents.length} agents loaded\n`);

// ── 1. Run 2 agents in parallel ──────────────────────────────────────────
console.log("═══ Test 1: Parallel agent runs (ceo + devops) ═══");
const start = Date.now();
const [runCeo, runDevops] = await Promise.all([
  svc.processManager.runTask(
    "ceo",
    "What is the #1 priority for an AI startup in 2026? One sentence.",
  ),
  svc.processManager.runTask(
    "devops",
    "What is the best CI/CD tool for Node.js projects? One sentence.",
  ),
]);
console.log(`  CEO run: ${runCeo}, DevOps run: ${runDevops}\n`);

// Wait for both to finish
const POLL = 500;
const TIMEOUT = 120_000;
let waited = 0;
while (waited < TIMEOUT) {
  await new Promise((r) => setTimeout(r, POLL));
  waited += POLL;
  const s1 = svc.processManager.getState("ceo");
  const s2 = svc.processManager.getState("devops");
  if (
    (s1.status === "idle" || s1.status === "crashed") &&
    (s2.status === "idle" || s2.status === "crashed")
  ) {
    break;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const ceoState = svc.processManager.getState("ceo");
const devopsState = svc.processManager.getState("devops");
console.log(`\n  Parallel run finished in ${elapsed}s`);
console.log(
  `  CEO:    ${ceoState.status} (${ceoState.tasksCompleted} tasks, ${ceoState.tokensUsed} tok)`,
);
console.log(
  `  DevOps: ${devopsState.status} (${devopsState.tasksCompleted} tasks, ${devopsState.tokensUsed} tok)`,
);

// ── 2. Team listing ──────────────────────────────────────────────────────
console.log("\n═══ Test 2: Team listing ═══");
const teams = svc.teamStore.list();
console.log(
  `  Teams: ${teams.map((t) => `${t.name}(${t.agents.join(",")})`).join(", ") || "(none)"}`,
);

// ── 3. Task CRUD ─────────────────────────────────────────────────────────
console.log("\n═══ Test 3: Task CRUD ═══");
const task = await svc.taskStore.create({
  title: "Write quarterly report",
  description: "Summarize Q1 achievements",
  priority: "high",
  assignee: "writer",
});
console.log(`  Created: ${task.id} — "${task.title}" [${task.status}]`);

await svc.taskStore.update(task.id, { status: "in-progress" });
const updated = svc.taskStore.list().find((t) => t.id === task.id);
console.log(`  Updated status: ${updated?.status}`);

// ── 4. Profile ───────────────────────────────────────────────────────────
console.log("\n═══ Test 4: Company profile ═══");
const profile = svc.profileStore.get();
console.log(`  Name:    ${profile?.name ?? "(unset)"}`);
console.log(`  Mission: ${profile?.mission ?? "(unset)"}`);
console.log(`  Vision:  ${profile?.vision ?? "(unset)"}`);

// ── 5. Fleet snapshot ────────────────────────────────────────────────────
console.log("\n═══ Test 5: Fleet snapshot ═══");
const allStates = svc.processManager.getAllStates();
console.log(`  Active processes: ${allStates.filter((s) => s.status === "active").length}`);
console.log(`  Total agents:     ${allStates.length}`);
for (const s of allStates) {
  console.log(
    `    ${s.agentId.padEnd(12)} ${s.status.padEnd(8)} tasks=${s.tasksCompleted} tok=${s.tokensUsed}`,
  );
}

// ── 6. Log store check ──────────────────────────────────────────────────
console.log("\n═══ Test 6: Log store ═══");
for (const a of ["ceo", "devops"]) {
  const logs = svc.logStore.get(a);
  console.log(`  ${a}: ${logs.length} log entries`);
}

// ── Summary ──────────────────────────────────────────────────────────────
const allOk = ceoState.status === "idle" && devopsState.status === "idle";
console.log(`\n${allOk ? "✅" : "⚠️"}  Multi-agent group test ${allOk ? "PASSED" : "PARTIAL"}`);
process.exit(allOk ? 0 : 1);
