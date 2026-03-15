# ClawDock — Inter-Agent Data Interaction

This document describes how agents exchange data during orchestrated execution: the message formats, delegation protocols, result aggregation, and real-time event flow.

---

## Overview

ClawDock agents do not communicate directly with each other. All data exchange is mediated by three backend subsystems:

```
┌────────────────────────────────────────────────────────────────────┐
│  Orchestrator (plan-delegate-synthesize)                           │
│  Drives the task lifecycle across multiple agents                  │
│                                                                    │
│  ┌────────────────────────┐    ┌─────────────────────────────┐    │
│  │    ProcessManager      │    │       MessageBus             │    │
│  │  spawns CLI processes  │    │  records inter-agent msgs    │    │
│  │  collects TaskResult   │    │  notifies WS clients         │    │
│  └────────────────────────┘    └─────────────────────────────┘    │
│                                                                    │
│  ┌────────────────────────┐    ┌─────────────────────────────┐    │
│  │      LogStore          │    │    GatewayBroadcast          │    │
│  │  ring buffer per agent │    │  pushes events to frontend   │    │
│  └────────────────────────┘    └─────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

**Key principle:** Agents are stateless CLI processes. They receive a prompt, produce output, and exit. The Orchestrator stitches multiple agent runs into a coherent task flow by:

1. Asking a manager agent to **plan** subtasks
2. **Dispatching** subtasks to subordinates (via ProcessManager)
3. **Collecting** results and asking the manager to **synthesize** them

---

## Data Structures

### `AgentMessage` — Inter-Agent Envelope

Every piece of data exchanged between agents is wrapped in an `AgentMessage`:

```typescript
interface AgentMessage {
  id: string; // "msg_<timestamp>_<random6>"
  from: string; // sender agentId, or "human"
  to: string; // receiver agentId, or "company"
  content: string; // message body (task description or result text)
  type: MessageType; // semantic tag for the message
  ts: number; // Unix timestamp (ms)
}

type MessageType = "task" | "result" | "query" | "notify";
```

| `type`   | Direction             | Usage                                                     |
| -------- | --------------------- | --------------------------------------------------------- |
| `task`   | human → company       | User sends a task to the company                          |
| `task`   | manager → subordinate | Orchestrator delegates a subtask                          |
| `result` | subordinate → manager | Subordinate's output sent back to the orchestrating agent |
| `query`  | agent → agent         | (Reserved) Direct question between agents                 |
| `notify` | agent → agent         | (Reserved) Fire-and-forget notification                   |

### `TaskResult` — Process Output

When an agent finishes a task, ProcessManager resolves with:

```typescript
interface TaskResult {
  runId: string; // "run_<timestamp>_<random6>"
  content: string; // final output text from the agent's stdout
  tokensUsed: number; // total output tokens consumed
  exitCode: number; // 0 = success, non-zero = error
}
```

### `OrchestrationResult` — Recursive Result Tree

The orchestrator returns a tree of results, mirroring the delegation hierarchy:

```typescript
interface OrchestrationResult {
  agentId: string; // which agent produced this
  content: string; // final output (synthesized or direct)
  tokensUsed: number; // cumulative: this agent + all subtasks
  subtasks: OrchestrationResult[]; // subordinate results (empty for leaf)
  phase: "leaf" | "orchestrated"; // whether delegation occurred
  durationMs: number; // wall-clock time for this subtree
}
```

### `DelegationEntry` — Plan Item

The JSON plan produced by a manager agent during the planning phase:

```typescript
interface DelegationEntry {
  agentId: string; // subordinate agent ID
  subtask: string; // task description for the subordinate
}
```

---

## Orchestration Protocol

### Phase Diagram

```
User sends message
       │
       ▼
┌─────────────────┐
│  Find Director  │  (role contains "director", id === "ai-director", or first agent)
└────────┬────────┘
         │
         ▼
   ┌─────────────┐   no subordinates
   │ Has direct  ├──────────────────► LEAF EXECUTION
   │  reports?   │                    (runTaskAwait → TaskResult)
   └──────┬──────┘
          │ yes
          ▼
   ╔═════════════╗
   ║  PHASE 1:   ║
   ║  PLANNING   ║  Agent receives buildPlanPrompt()
   ╚══════╤══════╝  → produces JSON: [{agentId, subtask}, ...]
          │
          ├──── empty plan? ──► LEAF EXECUTION (agent handles it directly)
          │
          ▼
   ╔═════════════╗
   ║  PHASE 2:   ║  For each entry in the plan:
   ║ DELEGATING  ║  1. messageBus.send(manager → subordinate, type: "task")
   ╚══════╤══════╝  2. orchestrator.execute(subordinate, subtask, depth+1) [RECURSIVE]
          │         3. All subtasks run in PARALLEL (Promise.all)
          │
          │         Each subordinate either:
          │         - Executes directly (leaf) → returns TaskResult
          │         - Orchestrates its own subordinates (recursive) → returns OrchestrationResult
          │
          ▼
   ╔═════════════╗  For each completed subtask:
   ║  PHASE 3:   ║  messageBus.send(subordinate → manager, type: "result")
   ║ SYNTHESIZE  ║
   ╚══════╤══════╝  Agent receives buildSynthesizePrompt() with all results
          │         → produces unified final response
          ▼
   ┌─────────────┐
   │  COMPLETE   │  Returns OrchestrationResult (tree)
   └─────────────┘
```

### Planning Phase — Prompt Format

The orchestrator constructs a planning prompt for the manager agent:

```
You are {role}. You have received a task and must delegate it to your team.

TASK:
{original user message}

YOUR TEAM:
- {agentId} ({role}): {description}
- {agentId} ({role}): {description}
...

Create a delegation plan. For each team member, describe a specific subtask
they should work on. Only assign subtasks that are genuinely needed — not
every member must be assigned.

Respond with ONLY a JSON array, no markdown fences, no explanation:
[{"agentId": "id", "subtask": "description"}, ...]

If you can handle this entirely yourself without delegation, respond with: []
```

### Planning Phase — Response Parsing

The plan parser uses a 3-strategy fallback chain:

````
Strategy 1: Direct JSON.parse(raw)
    │ failed
    ▼
Strategy 2: Extract from markdown code fence (```json ... ```)
    │ failed
    ▼
Strategy 3: Regex match first [...] in text, then JSON.parse
    │ failed
    ▼
Fallback: Return [] (empty plan → agent executes directly)
````

After parsing, each entry is validated:

- `agentId` must be a string matching a known subordinate ID
- `subtask` must be a non-empty string
- Invalid entries are silently dropped

### Delegation Phase — Parallel Dispatch

Subtasks are dispatched in parallel:

```typescript
// Record delegation in MessageBus (visible to frontend)
messageBus.send(managerId, subordinateId, subtask, "task");

// Execute subtasks in parallel, each may recursively orchestrate
const results = await Promise.all(
  plan.map((entry) => orchestrator.execute(entry.agentId, entry.subtask, opts, depth + 1)),
);
```

Each subordinate follows the same protocol recursively:

- If it has its own subordinates → plan → delegate → synthesize
- If it's a leaf → execute directly via `processManager.runTaskAwait()`

### Synthesis Phase — Prompt Format

After all subtasks complete, the orchestrator builds a synthesis prompt:

```
You are {role}. You delegated a task to your team and received their results.

ORIGINAL TASK:
{original user message}

TEAM RESULTS:
### {subordinate1_agentId}:
{subordinate1_output}

### {subordinate2_agentId}:
{subordinate2_output}

Synthesize these results into a single, cohesive final response.
Integrate key findings, resolve contradictions, and present a clear,
actionable answer.
```

---

## Message Flow Example

A concrete example: User asks "Create Q3 strategy" to a company with this org:

```
CEO (ai-director)
├── Researcher (researcher)
│   └── Writer (writer)
└── DevOps (devops)
```

### Step-by-step data exchange:

```
1. Human → Company
   AgentMessage { from: "human", to: "company", type: "task",
                  content: "Create Q3 strategy" }

2. CEO: Planning
   ProcessManager.runTaskAwait("ai-director", planPrompt)
   → TaskResult { content: '[{"agentId":"researcher","subtask":"Research market..."},
                              {"agentId":"devops","subtask":"Audit infrastructure..."}]' }

3. CEO → Researcher (delegation)
   AgentMessage { from: "ai-director", to: "researcher", type: "task",
                  content: "Research market trends..." }

4. CEO → DevOps (delegation)
   AgentMessage { from: "ai-director", to: "devops", type: "task",
                  content: "Audit infrastructure..." }

5. Researcher: Planning (has subordinate: Writer)
   ProcessManager.runTaskAwait("researcher", planPrompt)
   → TaskResult { content: '[{"agentId":"writer","subtask":"Draft research summary..."}]' }

6. Researcher → Writer (delegation)
   AgentMessage { from: "researcher", to: "writer", type: "task",
                  content: "Draft research summary..." }

7. Writer: Leaf Execution (no subordinates)
   ProcessManager.runTaskAwait("writer", "Draft research summary...")
   → TaskResult { content: "## Market Research Summary\n...", tokensUsed: 245 }

8. Writer → Researcher (result)
   AgentMessage { from: "writer", to: "researcher", type: "result",
                  content: "## Market Research Summary..." }

9. Researcher: Synthesis
   ProcessManager.runTaskAwait("researcher", synthesizePrompt)
   → TaskResult { content: "Research findings: ...", tokensUsed: 312 }

10. DevOps: Leaf Execution (parallel with steps 5-9)
    ProcessManager.runTaskAwait("devops", "Audit infrastructure...")
    → TaskResult { content: "Infrastructure report: ...", tokensUsed: 280 }

11. Researcher → CEO (result)
    AgentMessage { from: "researcher", to: "ai-director", type: "result",
                   content: "Research findings: ..." }

12. DevOps → CEO (result)
    AgentMessage { from: "devops", to: "ai-director", type: "result",
                   content: "Infrastructure report: ..." }

13. CEO: Synthesis
    ProcessManager.runTaskAwait("ai-director", synthesizePrompt)
    → TaskResult { content: "Q3 Strategy: ...", tokensUsed: 425 }

14. Final OrchestrationResult:
    { agentId: "ai-director",
      content: "Q3 Strategy: ...",
      tokensUsed: 1262,  // sum of all agents
      phase: "orchestrated",
      durationMs: 45000,
      subtasks: [
        { agentId: "researcher", content: "Research findings: ...",
          tokensUsed: 557, phase: "orchestrated",
          subtasks: [
            { agentId: "writer", content: "## Market Research...",
              tokensUsed: 245, phase: "leaf", subtasks: [] }
          ] },
        { agentId: "devops", content: "Infrastructure report: ...",
          tokensUsed: 280, phase: "leaf", subtasks: [] }
      ] }
```

---

## Real-time Event Stream

Throughout orchestration, the backend emits WebSocket broadcast events. The frontend receives these to animate the UI in real time.

### Event Timeline for the Example Above

```
t=0ms    company.agent.message     { from: "human", to: "company", type: "task" }
t=5ms    company.agent.status      { agentId: "ai-director", status: "active" }
t=10ms   company.orchestration.phase { agentId: "ai-director", phase: "planning", depth: 0 }

t=3000ms company.agent.log         { agentId: "ai-director", entry: { type: "output", ... } }
t=5000ms company.orchestration.phase { agentId: "ai-director", phase: "delegating", depth: 0 }
t=5005ms company.agent.message     { from: "ai-director", to: "researcher", type: "task" }
t=5010ms company.agent.message     { from: "ai-director", to: "devops", type: "task" }

         ┌─── Researcher subtree ───────────────────────────────┐
t=5015ms │ company.agent.status     { agentId: "researcher", status: "active" }
t=5020ms │ company.orchestration.phase { agentId: "researcher", phase: "planning", depth: 1 }
t=8000ms │ company.orchestration.phase { agentId: "researcher", phase: "delegating", depth: 1 }
t=8005ms │ company.agent.message    { from: "researcher", to: "writer", type: "task" }
t=8010ms │ company.agent.status     { agentId: "writer", status: "active" }
t=8015ms │ company.orchestration.phase { agentId: "writer", phase: "executing", depth: 2 }
         │  ... writer log entries stream ...
t=20000ms│ company.orchestration.phase { agentId: "writer", phase: "complete", depth: 2 }
t=20005ms│ company.agent.status     { agentId: "writer", status: "idle" }
t=20010ms│ company.agent.message    { from: "writer", to: "researcher", type: "result" }
t=20015ms│ company.orchestration.phase { agentId: "researcher", phase: "synthesizing", depth: 1 }
t=25000ms│ company.orchestration.phase { agentId: "researcher", phase: "complete", depth: 1 }
         └──────────────────────────────────────────────────────┘

         ┌─── DevOps subtree (parallel) ────────────────────────┐
t=5015ms │ company.agent.status     { agentId: "devops", status: "active" }
t=5020ms │ company.orchestration.phase { agentId: "devops", phase: "executing", depth: 1 }
         │  ... devops log entries stream ...
t=18000ms│ company.orchestration.phase { agentId: "devops", phase: "complete", depth: 1 }
t=18005ms│ company.agent.status     { agentId: "devops", status: "idle" }
         └──────────────────────────────────────────────────────┘

t=25005ms company.agent.message     { from: "researcher", to: "ai-director", type: "result" }
t=25010ms company.agent.message     { from: "devops", to: "ai-director", type: "result" }
t=25015ms company.orchestration.phase { agentId: "ai-director", phase: "synthesizing", depth: 0 }
         ... CEO synthesis log entries stream ...
t=30000ms company.orchestration.phase { agentId: "ai-director", phase: "complete", depth: 0 }
t=30005ms company.agent.status      { agentId: "ai-director", status: "idle" }
```

### Broadcast Event Summary

| Event                         | Payload Key Fields                                   | When Emitted                         |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `company.agent.status`        | `agentId`, `status`, `updatedAt`                     | Every process state transition       |
| `company.agent.log`           | `agentId`, `runId`, `entry: LogEntry`                | Every stdout/stderr line from runner |
| `company.agent.message`       | `msg: AgentMessage`                                  | Every MessageBus.send() call         |
| `company.orchestration.phase` | `orchestrationId`, `agentId`, `phase`, `depth`, `ts` | Each orchestration phase transition  |

---

## MessageBus Internals

The `MessageBus` is an in-process pub/sub with history:

```typescript
class MessageBus {
  private history: AgentMessage[]; // ring buffer, max 500
  private handlers: MessageHandler[];

  send(from, to, content, type): AgentMessage {
    // 1. Create AgentMessage with auto-generated ID + timestamp
    // 2. Append to history (trim oldest if > 500)
    // 3. Call all handlers (CompanyService wires: handler → broadcast to WS clients)
    // 4. Return the message
  }

  getHistory(opts?): AgentMessage[] {
    // Filter by from/to, apply limit (returns most recent)
  }
}
```

**Wiring in CompanyService:**

```typescript
// company-service.ts — during init
this.messageBus.onMessage((msg) => {
  broadcast("company.agent.message", { msg });
});
```

This means every `messageBus.send()` call automatically broadcasts to all WebSocket clients.

---

## Depth Guard and Recursion Safety

The orchestrator enforces a maximum recursion depth (default: 3):

```
depth=0  CEO orchestrates → plans, delegates to Researcher + DevOps
depth=1  Researcher orchestrates → plans, delegates to Writer
depth=2  Writer executes directly (even if it had subordinates)
depth=3  (never reached in this example)
```

At `depth >= maxDepth`, agents execute directly regardless of subordinates. This prevents:

- Infinite recursion from circular `reportTo` chains
- Excessively deep delegation trees
- Runaway token consumption

---

## Smart Plan Handling

The orchestrator supports intelligent delegation decisions by the LLM:

| Agent Response    | Behavior                                             |
| ----------------- | ---------------------------------------------------- |
| Valid JSON array  | Delegate subtasks to listed agents                   |
| Empty array `[]`  | Agent handles task directly (no delegation needed)   |
| Malformed JSON    | Fallback: agent handles task directly                |
| Unknown agent IDs | Invalid entries silently dropped; remaining are used |

This allows the LLM to decide at runtime whether a task actually needs delegation. Simple questions like "What's 4+4?" will produce an empty plan even if the agent has subordinates.

---

## Token Accounting

Tokens are tracked at every level and aggregated upward:

```
OrchestrationResult (CEO)
  tokensUsed = planTokens + synthTokens + sum(subtask.tokensUsed)
    ├── OrchestrationResult (Researcher)
    │     tokensUsed = planTokens + synthTokens + sum(subtask.tokensUsed)
    │       └── OrchestrationResult (Writer)
    │             tokensUsed = directExecutionTokens
    └── OrchestrationResult (DevOps)
          tokensUsed = directExecutionTokens
```

The root `OrchestrationResult.tokensUsed` is the total across all agents in the entire orchestration tree.

---

## Fire-and-Forget vs Awaitable

ClawDock offers two modes for orchestration:

### 1. Fire-and-Forget (`company.message.send`)

Used by the "Talk to Company" UI panel. Returns immediately; progress streams via WebSocket events.

```typescript
// Gateway handler
if (director.directReports.length > 0) {
  respond(true, { ok: true, orchestrating: true, msgId: msg.id }, undefined);
  // Fire-and-forget — orchestration runs in background
  svc.orchestrator.execute(director.id, content).catch(/* error handling */);
} else {
  // Leaf director — run directly
  const runId = await svc.processManager.runTask(director.id, content);
  respond(true, { ok: true, runId, msgId: msg.id }, undefined);
}
```

### 2. Awaitable (`company.orchestrate.run`)

Used by the CLI (`openclaw clawdock orchestrate`). Waits for the full result tree.

```typescript
// CLI sends RPC, blocks until complete
const result = await client.request<OrchestrationResult>("company.orchestrate.run", {
  id: agentId,
  prompt,
  maxDepth,
});
// result.content = final synthesized text
// result.subtasks = full delegation tree
```

Both modes emit the same real-time broadcast events during execution.
