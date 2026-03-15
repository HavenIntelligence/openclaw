# ClawDock — CLI Reference

The `openclaw company` command group provides terminal access to all ClawDock features.

**Source file:** `src/cli/company-cli.ts`
**Registered in:** `src/cli/program/register.subclis.ts`

All commands communicate with the local gateway via `callGatewayCli()` (same WebSocket RPC layer as the web UI).

---

## Usage

```
openclaw company <command> [options]
```

---

## Agent Commands

### `openclaw company agents list`

List all agents with their current runtime status.

```
openclaw company agents list

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

### `openclaw company agents get <id>`

Show detailed info for a single agent.

```
openclaw company agents get ai-director
```

Output: JSON representation of the `ClawDockAgent` object.

---

### `openclaw company agents start <id> [--task <prompt>]`

Dispatch a task to an agent.

```
openclaw company agents start ai-director --task "Review Q2 roadmap and summarize key risks"
```

**Options:**

- `--task <text>` — Prompt to run (default: `"Start and await tasks"`)

Output: `{ ok: true, runId: "run_..." }`

---

### `openclaw company agents stop <id>`

Send SIGTERM to the agent's process (SIGKILL after 5 s).

```
openclaw company agents stop ops-prime
```

---

### `openclaw company agents restart <id>`

Stop and restart the agent.

```
openclaw company agents restart ops-prime
```

---

### `openclaw company agents logs <id> [--limit N]`

Show recent execution logs for an agent.

```
openclaw company agents logs ai-director --limit 50
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

## Fleet Commands

### `openclaw company fleet`

Show the current fleet snapshot (CPU, memory, tokens, uptime).

```
openclaw company fleet

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

### `openclaw company tasks list [--status <status>] [--assignee <id>] [--project <name>]`

List Kanban tasks with optional filters.

```
openclaw company tasks list --status in_progress
```

Output table columns: ID, TITLE, STATUS, PRIORITY, ASSIGNEE

---

### `openclaw company tasks create --title <text> [options]`

Create a new task.

```
openclaw company tasks create \
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

### `openclaw company tasks assign <taskId> <agentId>`

Assign a task to an agent.

```
openclaw company tasks assign task_1710000000_abc123 code-agent
```

---

## Team Commands

### `openclaw company teams list`

List all teams.

```
openclaw company teams list
```

---

### `openclaw company teams create --name <name> [options]`

Create a new team.

```
openclaw company teams create \
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

### `openclaw company message send <text>`

Send a message to the company (routes to AI Director).

```
openclaw company message send "What is the status of Project Alpha?"
```

Output: `{ ok: true, runId: "run_...", msgId: "msg_..." }`

The AI Director will receive the message and run a task. Use `openclaw company agents logs ai-director` to see the response.

---

### `openclaw company messages list [--limit N]`

Show recent message history (human ↔ company).

```
openclaw company messages list --limit 20
```

---

## Profile Commands

### `openclaw company profile get`

Show the company profile.

```
openclaw company profile get
```

Output: JSON representation of `CompanyProfile`.

---

### `openclaw company profile set [options]`

Update the company profile.

```
openclaw company profile set \
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
openclaw company fleet

# 2. Send a task to the company
openclaw company message send "Research the top 5 AI coding tools and write a comparison blog post"

# 3. Watch the director's log
openclaw company agents logs ai-director --limit 20

# 4. Check task board
openclaw company tasks list
```

### Recover a crashed agent

```bash
# See which agents crashed
openclaw company fleet

# Restart the agent
openclaw company agents restart review-gamma

# Verify it recovered
openclaw company agents get review-gamma
```

### Inspect inter-agent communication

```bash
# See recent messages between agents
openclaw company messages list --limit 50
```
