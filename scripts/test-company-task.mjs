#!/usr/bin/env node
/**
 * Integration test: runs a task via ProcessManager using the OpenClaw runner
 * and prints every log entry broadcast to the console.
 *
 * Usage: node scripts/test-company-task.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "../dist/index.js");

// Dynamically import the built output so we test the real compiled code.
const { initCompanyService } = await import(dist).catch(() => {
  console.error("❌  dist/index.js not found — run pnpm build first");
  process.exit(1);
});

// ── Mock broadcast so we can capture events ────────────────────────────────
const events = [];
function broadcast(event, payload) {
  const ts = new Date().toISOString().slice(11, 23);
  events.push({ event, payload });
  if (event === "company.agent.log") {
    const e = payload.entry;
    console.log(`  [${ts}] [${e.type.padEnd(10)}] ${payload.agentId}: ${e.content.slice(0, 120)}`);
  } else if (event === "company.agent.status") {
    console.log(`  [${ts}] [STATUS    ] ${payload.agentId} → ${payload.status}`);
  } else {
    console.log(`  [${ts}] [${event}]`, JSON.stringify(payload).slice(0, 80));
  }
}

console.log("🏢  ClawDock task runner integration test\n");

// ── Init company service ───────────────────────────────────────────────────
const svc = await initCompanyService(broadcast);
const agents = svc.registry.getAgents();
console.log(
  `✅  Loaded ${agents.length} agents:`,
  agents.map((a) => `${a.emoji} ${a.id}(${a.runtime})`).join(", "),
);
console.log("");

// ── Pick the researcher agent (or first available) ────────────────────────
const target = agents.find((a) => a.id === "researcher") ?? agents[0];
if (!target) {
  console.error("❌  No agents configured");
  process.exit(1);
}

console.log(`🚀  Running task on agent: ${target.emoji} ${target.id} (runtime: ${target.runtime})`);
console.log(`📋  Prompt: "List 3 key trends in AI development for 2026. Be concise."\n`);
console.log("─".repeat(70));

const start = Date.now();
try {
  const runId = await svc.processManager.runTask(
    target.id,
    "List 3 key trends in AI development for 2026. Be concise, 2-3 sentences each.",
  );
  console.log(
    `\n✅  Task completed (runId: ${runId}) in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );

  const logCount = events.filter((e) => e.event === "company.agent.log").length;
  const statusEvents = events
    .filter((e) => e.event === "company.agent.status")
    .map((e) => e.payload.status);
  console.log(`\n📊  Summary:`);
  console.log(`    Log entries broadcast: ${logCount}`);
  console.log(`    Status transitions: ${statusEvents.join(" → ")}`);

  // Print log store contents
  console.log(`\n📜  Log store for ${target.id}:`);
  const storedLogs = svc.logStore.get(target.id);
  for (const e of storedLogs) {
    console.log(`    [${e.type.padEnd(10)}] ${e.content.slice(0, 100)}`);
  }
} catch (err) {
  console.error(`\n❌  Task failed:`, err.message);
  process.exit(1);
}

// Wait for process to settle then exit.
await new Promise((r) => setTimeout(r, 500));
process.exit(0);
