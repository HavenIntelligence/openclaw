#!/usr/bin/env npx tsx
/**
 * Orchestrator integration test — sends a task to the CEO, verifies
 * automatic delegation through the org hierarchy:
 *   CEO → researcher, devops (parallel) → writer (via researcher)
 *
 * Usage: npx tsx scripts/test-orchestrator.ts
 */
import { initCompanyService } from "../src/company/company-service.ts";
import type { LogEntry } from "../src/company/types.ts";

function broadcast(event: string, payload: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  if (event === "company.orchestration.phase") {
    const p = payload as { agentId: string; phase: string; depth: number };
    const indent = "  ".repeat(p.depth + 1);
    console.log(`  [${ts}] ${indent}⚙️  ${p.agentId} → ${p.phase}`);
  } else if (event === "company.agent.log") {
    const { agentId, entry } = payload as { agentId: string; entry: LogEntry };
    if (entry.type === "output") {
      const preview = entry.content.slice(0, 100).replace(/\n/g, " ");
      console.log(`  [${ts}]   📝 ${agentId}: ${preview}`);
    } else if (entry.type === "system" && entry.content.startsWith("Delegated")) {
      console.log(`  [${ts}]   📨 ${agentId}: ${entry.content.slice(0, 120)}`);
    }
  } else if (event === "company.agent.message") {
    const { msg } = payload as { msg: { from: string; to: string; content: string; kind: string } };
    const arrow = msg.kind === "task" ? "→" : "←";
    console.log(`  [${ts}]   💬 ${msg.from} ${arrow} ${msg.to}: ${msg.content.slice(0, 80)}`);
  }
}

console.log("🏢  ClawDock — Orchestrator Test: CEO delegates across org hierarchy\n");

const svc = await initCompanyService(broadcast as Parameters<typeof initCompanyService>[0]);
const agents = svc.registry.getAgents();
console.log(`✅  ${agents.length} agents loaded`);

// Show org structure
for (const a of agents) {
  const reports = svc.registry.getDirectReports(a.id);
  const reportsStr = reports.length > 0 ? ` → [${reports.join(", ")}]` : " (leaf)";
  console.log(`  ${a.emoji} ${a.id} (${a.role})${reportsStr}`);
}
console.log();

const prompt =
  "Our AI startup OpenClaw Labs needs a development plan for the next quarter. " +
  "Consider market trends, technical infrastructure, content strategy, and competitive positioning. " +
  "Produce a concrete, actionable plan.";

console.log(`📋  Task: "${prompt.slice(0, 100)}…"\n`);
console.log("━".repeat(72));

const start = Date.now();
const result = await svc.orchestrator.execute("ceo", prompt, { maxDepth: 3 });
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log("━".repeat(72));
console.log(`\n✅  Orchestration complete in ${elapsed}s\n`);

// Print tree
function printTree(r: typeof result, indent = 0): void {
  const pad = "  ".repeat(indent);
  const phase = r.phase === "orchestrated" ? "🌳" : "🍃";
  console.log(
    `${pad}${phase} ${r.agentId} (${r.tokensUsed} tok, ${(r.durationMs / 1000).toFixed(1)}s)`,
  );
  if (r.subtasks) {
    for (const sub of r.subtasks) {
      printTree(sub, indent + 1);
    }
  }
}

console.log("📊  Delegation Tree:");
printTree(result);

console.log(`\n📝  Final Synthesized Output:\n${"─".repeat(72)}`);
console.log(result.content);
console.log(`${"─".repeat(72)}\n`);
console.log(`Total tokens: ${result.tokensUsed}`);

process.exit(0);
