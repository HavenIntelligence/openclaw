import type { Command } from "commander";
import type { ClawDockAgent, FleetSnapshot, Task, TeamConfig } from "../company/types.js";
import { callGatewayCli } from "../gateway/call.js";

// ── Shared helper: call a company.* method on the local gateway ───────────
async function companyRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return await callGatewayCli<T>({ method, params });
}

// ── Table formatters ──────────────────────────────────────────────────────
function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    active: "● active",
    idle: "○ idle",
    crashed: "✕ crashed",
    starting: "◌ starting",
    stopping: "◌ stopping",
    paused: "⏸ paused",
  };
  return badges[status] ?? status;
}

function truncate(s: string | undefined, max: number): string {
  const v = s ?? "";
  if (v.length <= max) {
    return v;
  }
  return v.slice(0, max - 1) + "…";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printAgentsTable(agents: ClawDockAgent[]): void {
  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }
  const header = `${pad("ID", 20)} ${pad("NAME", 20)} ${pad("ROLE", 18)} ${pad("TEAM", 14)} ${pad("STATUS", 16)} ${pad("RUNTIME", 14)} TASKS`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const a of agents) {
    console.log(
      `${pad(truncate(a.id, 20), 20)} ${pad(truncate(a.name, 20), 20)} ${pad(truncate(a.role, 18), 18)} ${pad(truncate(a.team, 14), 14)} ${pad(statusBadge(a.status ?? "idle"), 16)} ${pad(a.runtime ?? "openclaw", 14)} ${a.tasksCompleted ?? 0}`,
    );
  }
}

function printFleetTable(snap: FleetSnapshot): void {
  console.log(`Fleet snapshot at ${new Date(snap.ts).toLocaleTimeString()}`);
  console.log(
    `  Running: ${snap.totalRunning}  Idle: ${snap.totalIdle}  Crashed: ${snap.totalCrashed}  Total tasks: ${snap.totalTasks}`,
  );
  console.log();
  const header = `${pad("AGENT ID", 24)} ${pad("STATUS", 16)} ${pad("CPU%", 8)} ${pad("MEM MB", 8)} TOKENS`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const m of snap.agents) {
    console.log(
      `${pad(truncate(m.agentId, 24), 24)} ${pad(statusBadge(m.status ?? "idle"), 16)} ${pad((m.cpuPercent ?? 0).toFixed(1), 8)} ${pad((m.memoryMb ?? 0).toFixed(0), 8)} ${m.tokensUsed ?? 0}`,
    );
  }
}

function printTasksTable(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }
  const header = `${pad("ID", 28)} ${pad("TITLE", 32)} ${pad("STATUS", 14)} ${pad("PRIORITY", 10)} ASSIGNEE`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const t of tasks) {
    console.log(
      `${pad(truncate(t.id, 28), 28)} ${pad(truncate(t.title, 32), 32)} ${pad(t.status ?? "backlog", 14)} ${pad(t.priority ?? "medium", 10)} ${t.assignee ?? "-"}`,
    );
  }
}

function printTeamsTable(teams: TeamConfig[]): void {
  if (teams.length === 0) {
    console.log("No teams configured.");
    return;
  }
  const header = `${pad("ID", 28)} ${pad("NAME", 20)} ${pad("STRATEGY", 16)} AGENTS`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const t of teams) {
    console.log(
      `${pad(truncate(t.id, 28), 28)} ${pad(truncate(t.name, 20), 20)} ${pad(t.strategy, 16)} ${t.agents.join(", ")}`,
    );
  }
}

// ── CLI registrar ─────────────────────────────────────────────────────────
export function registerClawDockCli(program: Command): void {
  const company = program
    .command("clawdock")
    .description("ClawDock multi-agent orchestration — manage agents, fleet, tasks, teams");

  // ── ps ──────────────────────────────────────────────────────────────────
  company
    .command("ps")
    .description("List all agents with runtime status")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const agents = await companyRpc<ClawDockAgent[]>("company.agents.list");
      if (opts.json) {
        console.log(JSON.stringify(agents, null, 2));
      } else {
        printAgentsTable(agents);
      }
    });

  // ── start ────────────────────────────────────────────────────────────────
  company
    .command("start <id>")
    .description("Start an agent")
    .option("-m, --message <msg>", "Initial task prompt")
    .action(async (id, opts) => {
      const result = await companyRpc("company.agents.start", {
        id,
        task: opts.message,
      });
      console.log(JSON.stringify(result));
    });

  // ── stop ─────────────────────────────────────────────────────────────────
  company
    .command("stop <id>")
    .description("Stop an agent gracefully")
    .action(async (id) => {
      await companyRpc("company.agents.stop", { id });
      console.log(`Stopped ${id}`);
    });

  // ── restart ──────────────────────────────────────────────────────────────
  company
    .command("restart <id>")
    .description("Restart an agent")
    .action(async (id) => {
      await companyRpc("company.agents.restart", { id });
      console.log(`Restarted ${id}`);
    });

  // ── pause / resume ───────────────────────────────────────────────────────
  company
    .command("pause <id>")
    .description("Pause an agent (SIGSTOP)")
    .action(async (id) => {
      await companyRpc("company.agents.pause", { id });
      console.log(`Paused ${id}`);
    });

  company
    .command("resume <id>")
    .description("Resume a paused agent (SIGCONT)")
    .action(async (id) => {
      await companyRpc("company.agents.resume", { id });
      console.log(`Resumed ${id}`);
    });

  // ── run ──────────────────────────────────────────────────────────────────
  company
    .command("run <id>")
    .description("Run a one-shot task on an agent")
    .requiredOption("-m, --message <msg>", "Task prompt")
    .action(async (id, opts) => {
      const result = await companyRpc<{ runId: string }>("company.agents.run", {
        id,
        prompt: opts.message,
      });
      console.log(`Run started: ${result.runId}`);
    });

  // ── logs ─────────────────────────────────────────────────────────────────
  company
    .command("logs <id>")
    .description("Tail agent execution logs")
    .option("--tail <n>", "Number of log entries to show", "50")
    .action(async (id, opts) => {
      const limit = parseInt(String(opts.tail), 10);
      const logs = await companyRpc<Array<{ ts: number; type: string; content: string }>>(
        "company.agents.logs",
        { id, limit },
      );
      for (const entry of logs) {
        const time = new Date(entry.ts).toLocaleTimeString();
        console.log(`[${time}] [${entry.type}] ${entry.content}`);
      }
    });

  // ── fleet ────────────────────────────────────────────────────────────────
  company
    .command("fleet")
    .description("Show fleet metrics")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const snap = await companyRpc<FleetSnapshot>("company.fleet.snapshot");
      if (opts.json) {
        console.log(JSON.stringify(snap, null, 2));
      } else {
        printFleetTable(snap);
      }
    });

  // ── agent subgroup ────────────────────────────────────────────────────────
  const agent = company.command("agent").description("Manage agent metadata");

  agent
    .command("create")
    .description("Create or update ClawDock agent metadata")
    .requiredOption("--id <id>", "Agent ID")
    .option("--role <role>", "Agent role (e.g. CEO, Researcher)")
    .option("--team <team>", "Team name")
    .option("--emoji <emoji>", "Emoji avatar")
    .option("--color <color>", "Color hex code")
    .option("--description <desc>", "Description")
    .option("--runtime <runtime>", "Runtime: openclaw|claude-code|gemini|codex|aider")
    .option("--report-to <id>", "Parent agent ID")
    .action(async (opts) => {
      const result = await companyRpc("company.agents.update", {
        id: opts.id,
        role: opts.role,
        team: opts.team,
        emoji: opts.emoji,
        color: opts.color,
        description: opts.description,
        runtime: opts.runtime,
        reportTo: opts.reportTo,
      });
      console.log(JSON.stringify(result, null, 2));
    });

  agent
    .command("update <id>")
    .description("Update agent metadata")
    .option("--role <role>")
    .option("--team <team>")
    .option("--emoji <emoji>")
    .option("--color <color>")
    .option("--description <desc>")
    .option("--runtime <runtime>")
    .option("--report-to <id>")
    .action(async (id, opts) => {
      const result = await companyRpc("company.agents.update", {
        id,
        role: opts.role,
        team: opts.team,
        emoji: opts.emoji,
        color: opts.color,
        description: opts.description,
        runtime: opts.runtime,
        reportTo: opts.reportTo,
      });
      console.log(JSON.stringify(result, null, 2));
    });

  agent
    .command("delete <id>")
    .description("Delete agent ClawDock metadata")
    .action(async (id) => {
      await companyRpc("company.agents.delete", { id });
      console.log(`Deleted metadata for ${id}`);
    });

  // ── team subgroup ─────────────────────────────────────────────────────────
  const team = company.command("team").description("Manage team configurations");

  team
    .command("list")
    .description("List team configurations")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const teams = await companyRpc<TeamConfig[]>("company.teams.list");
      if (opts.json) {
        console.log(JSON.stringify(teams, null, 2));
      } else {
        printTeamsTable(teams);
      }
    });

  team
    .command("create")
    .description("Create a team")
    .requiredOption("--name <name>", "Team name")
    .option("--agents <ids>", "Comma-separated agent IDs")
    .option(
      "--strategy <strategy>",
      "Supervision strategy: one-for-one|one-for-all|rest-for-one|singleton",
      "one-for-one",
    )
    .option("--color <color>")
    .option("--description <desc>")
    .action(async (opts) => {
      const result = await companyRpc("company.teams.create", {
        name: opts.name,
        agents: opts.agents
          ? String(opts.agents)
              .split(",")
              .map((s: string) => s.trim())
          : [],
        strategy: opts.strategy,
        color: opts.color,
        description: opts.description,
      });
      console.log(JSON.stringify(result, null, 2));
    });

  team
    .command("delete <id>")
    .description("Delete a team")
    .action(async (id) => {
      await companyRpc("company.teams.delete", { id });
      console.log(`Deleted team ${id}`);
    });

  team
    .command("suspend <id>")
    .description("Stop all agents in a team")
    .action(async (id) => {
      const teams = await companyRpc<TeamConfig[]>("company.teams.list");
      const t = teams.find((t) => t.id === id);
      if (!t) {
        console.error(`Team "${id}" not found`);
        process.exit(1);
      }
      for (const agentId of t.agents) {
        await companyRpc("company.agents.stop", { id: agentId });
        console.log(`Stopped ${agentId}`);
      }
    });

  team
    .command("resume <id>")
    .description("Start all agents in a team")
    .action(async (id) => {
      const teams = await companyRpc<TeamConfig[]>("company.teams.list");
      const t = teams.find((t) => t.id === id);
      if (!t) {
        console.error(`Team "${id}" not found`);
        process.exit(1);
      }
      for (const agentId of t.agents) {
        await companyRpc("company.agents.start", { id: agentId });
        console.log(`Started ${agentId}`);
      }
    });

  // ── task subgroup ─────────────────────────────────────────────────────────
  const task = company.command("task").description("Manage Kanban tasks");

  task
    .command("list")
    .description("List tasks")
    .option("--status <status>", "Filter by status: backlog|in_progress|review|done")
    .option("--assignee <id>", "Filter by assignee agent ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const tasks = await companyRpc<Task[]>("company.tasks.list", {
        status: opts.status,
        assignee: opts.assignee,
      });
      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
      } else {
        printTasksTable(tasks);
      }
    });

  task
    .command("create")
    .description("Create a task")
    .requiredOption("--title <title>", "Task title")
    .option("--description <desc>")
    .option("--priority <priority>", "critical|high|medium|low", "medium")
    .option("--assignee <id>", "Assign to agent ID")
    .option("--project <project>")
    .action(async (opts) => {
      const result = await companyRpc("company.tasks.create", {
        title: opts.title,
        description: opts.description,
        priority: opts.priority,
        assignee: opts.assignee,
        project: opts.project,
        status: "backlog",
      });
      console.log(JSON.stringify(result, null, 2));
    });

  task
    .command("update <id>")
    .description("Update a task")
    .option("--status <status>")
    .option("--priority <priority>")
    .option("--title <title>")
    .option("--assignee <id>")
    .action(async (id, opts) => {
      const result = await companyRpc("company.tasks.update", {
        id,
        status: opts.status,
        priority: opts.priority,
        title: opts.title,
        assignee: opts.assignee,
      });
      console.log(JSON.stringify(result, null, 2));
    });

  task
    .command("assign <taskId> <agentId>")
    .description("Assign a task to an agent")
    .action(async (taskId, agentId) => {
      const result = await companyRpc("company.tasks.assign", { taskId, agentId });
      console.log(JSON.stringify(result, null, 2));
    });

  // ── profile ────────────────────────────────────────────────────────────────
  company
    .command("profile")
    .description("Show or update company profile")
    .option("--set", "Update profile (use with --name, --mission, etc.)")
    .option("--name <name>")
    .option("--mission <mission>")
    .option("--vision <vision>")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      if (opts.set) {
        const result = await companyRpc("company.profile.set", {
          name: opts.name,
          mission: opts.mission,
          vision: opts.vision,
        });
        console.log(JSON.stringify(result, null, 2));
      } else {
        const profile = await companyRpc("company.profile.get");
        if (opts.json) {
          console.log(JSON.stringify(profile, null, 2));
        } else {
          console.log(JSON.stringify(profile, null, 2));
        }
      }
    });
}
