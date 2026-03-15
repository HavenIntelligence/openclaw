# ClawDock — CLI Reference

The `openclaw clawdock` command group provides terminal access to all ClawDock features, including automatic multi-agent orchestration.

**Source file:** `src/cli/company-cli.ts`
**Registered in:** `src/cli/program/register.subclis.ts`

All commands communicate with the local gateway via `callGatewayCli()` (same WebSocket RPC layer as the web UI).

---

## Usage

```
openclaw clawdock <command> [options]
```

---

## Agent Commands

### `openclaw clawdock agents list`

List all agents with their current runtime status.

```
openclaw clawdock agents list

ID                   NAME                 ROLE               TEAM           STATUS           RUNTIME        TASKS
--------------------------------------------------------------------------------------------------------------
ai-director          AI Director          CEO / Director     executive      ● active         openclaw       12
ops-prime            Ops Prime            COO                executive      ○ idle           claude-code    8
```

**Status badges:**

| Badge        | Status         |
| ------------ | -------------- |
| `● active`   | Running a task |
| `○ idle`     | Available      |
| `✕ crashed`  | Non-zero exit  |
| `◌ starting` | Being spawned  |
| `◌ stopping` | SIGTERM sent   |
| `⏸ paused`   | SIGSTOP sent   |

---

### `openclaw clawdock agents get <id>`

Show detailed info for a single agent.

```
openclaw clawdock agents get ai-director
```

Output: JSON representation of the `ClawDockAgent` object.

---

### `openclaw clawdock agents start <id> [--task <prompt>]`

Dispatch a task to an agent.

```
openclaw clawdock agents start ai-director --task "Review Q2 roadmap and summarize key risks"
```

**Options:**

- `--task <text>` — Prompt to run (default: `"Start and await tasks"`)

Output: `{ ok: true, runId: "run_..." }`

---

### `openclaw clawdock agents stop <id>`

Send SIGTERM to the agent's process (SIGKILL after 5 s).

```
openclaw clawdock agents stop ops-prime
```

---

### `openclaw clawdock agents restart <id>`

Stop and restart the agent.

```
openclaw clawdock agents restart ops-prime
```

---

### `openclaw clawdock agents logs <id> [--limit N]`

Show recent execution logs for an agent.

```
openclaw clawdock agents logs ai-director --limit 50
```

**Options:**

- `--limit <n>` — Max entries to show (default: 100)

Output format:

```
12:34:01 [output  ] ai-director  Q2 roadmap has 3 critical risks: ...
12:34:05 [tool    ] ai-director  Read({"path": "/docs/roadmap.md"})
12:34:07 [error   ] ai-director  File not found: /docs/roadmap.md
```

---

## Orchestration Commands

### `openclaw clawdock orchestrate <id> -m <prompt> [--max-depth N]`

Run a task with automatic delegation through the org hierarchy. The target agent plans subtasks, delegates them to subordinates (recursively), then synthesizes the results.

```
openclaw clawdock orchestrate ceo -m "Create a quarterly development plan"
```

**Options:**

- `-m, --message <text>` — Required; task prompt
- `--max-depth <n>` — Max delegation depth (default: 3)

**Output:**

```
Orchestrating via ceo…

── researcher ──
Market analysis shows 3 key trends...

── devops ──
Technical infrastructure plan...

── Final (synthesized) ──
Quarterly Development Plan: ...

(orchestrated, 103.0s, 3229 tokens)
```

**How it works:**

1. **Plan**: The agent analyzes the task and its direct reports, producing a JSON delegation plan
2. **Delegate**: Subtasks are dispatched to subordinates in parallel (recursive — subordinates with their own reports also orchestrate)
3. **Synthesize**: The agent collects all subordinate outputs and produces a unified response

Leaf agents (no direct reports) execute tasks directly without delegation.

---

## Fleet Commands

### `openclaw clawdock fleet`

Show the current fleet snapshot (CPU, memory, tokens, uptime).

```
openclaw clawdock fleet

Fleet snapshot at 14:22:03
  Running: 2  Idle: 5  Crashed: 1  Total tasks: 47

AGENT ID                 STATUS           CPU%     MEM MB   TOKENS
-------------------------------------------------------------------------
ai-director              ● active         12.4     38       15420
ops-prime                ○ idle           0.0      0        8300
content-director         ● active         8.1      44       22100
review-gamma             ✕ crashed        0.0      0        4200
```

---

## Task Commands

### `openclaw clawdock tasks list [--status <status>] [--assignee <id>] [--project <name>]`

List Kanban tasks with optional filters.

```
openclaw clawdock tasks list --status in_progress
```

Output table columns: ID, TITLE, STATUS, PRIORITY, ASSIGNEE

---

### `openclaw clawdock tasks create --title <text> [options]`

Create a new task.

```
openclaw clawdock tasks create \
  --title "Write competitive analysis" \
  --priority high \
  --assignee research-alpha \
  --project "Content Pipeline"
```

**Options:**

- `--title <text>` — Required
- `--description <text>`
- `--status <status>` — Default: `backlog`
- `--priority <priority>` — Default: `medium`
- `--assignee <agentId>`
- `--project <name>`

---

### `openclaw clawdock tasks assign <taskId> <agentId>`

Assign a task to an agent.

```
openclaw clawdock tasks assign task_1710000000_abc123 code-agent
```

---

## Team Commands

### `openclaw clawdock teams list`

List all teams.

```
openclaw clawdock teams list
```

---

### `openclaw clawdock teams create --name <name> [options]`

Create a new team.

```
openclaw clawdock teams create \
  --name "Content Team" \
  --agents research-alpha,writing-beta,review-gamma \
  --strategy one-for-one
```

**Options:**

- `--name <text>` — Required
- `--agents <id,id,...>` — Comma-separated agent IDs
- `--strategy <strategy>` — Default: `one-for-one`
- `--color <hex>`
- `--description <text>`

---

## Message Commands

### `openclaw clawdock message send <text>`

Send a message to the company (routes to AI Director).

```
openclaw clawdock message send "What is the status of Project Alpha?"
```

Output: `{ ok: true, runId: "run_...", msgId: "msg_..." }`

The AI Director will receive the message and run a task. Use `openclaw clawdock agents logs ai-director` to see the response.

---

### `openclaw clawdock messages list [--limit N]`

Show recent message history (human ↔ company).

```
openclaw clawdock messages list --limit 20
```

---

## Profile Commands

### `openclaw clawdock profile get`

Show the company profile.

```
openclaw clawdock profile get
```

Output: JSON representation of `CompanyProfile`.

---

### `openclaw clawdock profile set [options]`

Update the company profile.

```
openclaw clawdock profile set \
  --name "Acme AI Corp" \
  --mission "Automate everything worth automating"
```

**Options:**

- `--name <text>`
- `--mission <text>`
- `--vision <text>`
- `--business-model <text>`

---

## Examples

### Start a full company pipeline

```bash
# 1. Check current status
openclaw clawdock fleet

# 2. Send a task to the company (auto-orchestrates if director has subordinates)
openclaw clawdock message send "Research the top 5 AI coding tools and write a comparison blog post"

# 3. Watch the director's log
openclaw clawdock agents logs ceo --limit 20

# 4. Check task board
openclaw clawdock tasks list
```

### Run an orchestrated task across the org hierarchy

```bash
# CEO delegates to researcher + devops, researcher may delegate to writer
openclaw clawdock orchestrate ceo -m "Create a quarterly development plan with market analysis and infrastructure roadmap"

# Run a leaf agent directly (no delegation)
openclaw clawdock run devops -m "What CI/CD tool is best for Node.js?"
```

### Recover a crashed agent

```bash
# See which agents crashed
openclaw clawdock fleet

# Restart the agent
openclaw clawdock agents restart review-gamma

# Verify it recovered
openclaw clawdock agents get review-gamma
```

### Inspect inter-agent communication

```bash
# See recent messages between agents
openclaw clawdock messages list --limit 50
```
