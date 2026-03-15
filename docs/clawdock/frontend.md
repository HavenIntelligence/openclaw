# ClawDock — Frontend Reference

All frontend code lives under `ui/src/ui/`. Views are pure render functions (no class state); state lives in `AppViewState`.

---

## State Slice (`AppViewState`)

Defined in `ui/src/ui/app-view-state.ts`. Company-related fields:

```typescript
// ui/src/ui/app-view-state.ts
companyAgents: ClawDockAgent[];          // from company.agents.list
companyAgentsLoading: boolean;
companyFleetSnapshot: FleetSnapshot | null;  // from company.fleet.snapshot
companyTasks: Task[];                    // from company.tasks.list
companyTeams: TeamConfig[];              // from company.teams.list
companyProfile: CompanyProfile | null;   // from company.profile.get
companyAgentLogs: Map<string, CompanyLogEntry[]>;  // keyed by agentId
companyMessages: AgentMessage[];         // from company.messages.list
```

Initial values (set in `app.ts`):

```typescript
companyAgents: [],
companyAgentsLoading: false,
companyFleetSnapshot: null,
companyTasks: [],
companyTeams: [],
companyProfile: null,
companyAgentLogs: new Map(),
companyMessages: [],
```

---

## Controller Functions (`controllers/company.ts`)

All functions receive a `CompanyState` (subset of `AppViewState`) and are async. They call `client.request()` to invoke gateway RPCs and mutate state directly.

### Loaders

| Function                                | RPC Called                | Updates State Field                       |
| --------------------------------------- | ------------------------- | ----------------------------------------- |
| `loadCompanyAgents(state)`              | `company.agents.list`     | `companyAgents`, `companyAgentsLoading`   |
| `loadCompanyFleet(state)`               | `company.fleet.snapshot`  | `companyFleetSnapshot`                    |
| `loadCompanyTasks(state, filters?)`     | `company.tasks.list`      | `companyTasks`                            |
| `loadCompanyTeams(state)`               | `company.teams.list`      | `companyTeams`                            |
| `loadCompanyProfile(state)`             | `company.profile.get`     | `companyProfile`                          |
| `loadCompanyMessages(state, limit?)`    | `company.messages.list`   | `companyMessages`                         |
| `loadAgentLogs(state, agentId, limit?)` | `company.agents.logs`     | `companyAgentLogs` (immutable Map update) |
| `loadAllAgentLogs(state, limit?)`       | `company.agents.logs` × N | `companyAgentLogs` for each agent         |
| `loadCompanyAll(state)`                 | all of the above          | all fields                                |

All loaders are best-effort: errors are silently caught, leaving existing state unchanged.

**Important:** `loadAgentLogs` creates a **new Map** reference to trigger `@state()` reactivity:

```typescript
const newMap = new Map(state.companyAgentLogs);
newMap.set(agentId, logs);
state.companyAgentLogs = newMap;
```

### Agent Actions

| Function                          | RPC Called               | Description                              |
| --------------------------------- | ------------------------ | ---------------------------------------- |
| `startAgent(state, id, task?)`    | `company.agents.start`   | Dispatch task to agent                   |
| `stopAgent(state, id)`            | `company.agents.stop`    | SIGTERM agent                            |
| `restartAgent(state, id)`         | `company.agents.restart` | Stop + restart                           |
| `pauseAgent(state, id)`           | `company.agents.pause`   | SIGSTOP                                  |
| `resumeAgent(state, id)`          | `company.agents.resume`  | SIGCONT                                  |
| `runAgentTask(state, id, prompt)` | `company.agents.run`     | Dispatch arbitrary prompt, returns runId |

### Message Actions

| Function                               | Returns                   | Description                          |
| -------------------------------------- | ------------------------- | ------------------------------------ |
| `sendMessageToCompany(state, content)` | `Promise<string \| null>` | Send to AI Director; returns `runId` |
| `loadCompanyMessages(state, limit?)`   | `Promise<void>`           | Refresh message history              |

### Task Actions

| Function                             | RPC Called             | Description    |
| ------------------------------------ | ---------------------- | -------------- |
| `createTask(state, params)`          | `company.tasks.create` | Returns `Task` |
| `updateTask(state, id, partial)`     | `company.tasks.update` | Returns `Task` |
| `deleteTask(state, id)`              | `company.tasks.delete` | —              |
| `assignTask(state, taskId, agentId)` | `company.tasks.assign` | Returns `Task` |

### Team Actions

| Function                         | RPC Called             | Description          |
| -------------------------------- | ---------------------- | -------------------- |
| `createTeam(state, params)`      | `company.teams.create` | Returns `TeamConfig` |
| `updateTeam(state, id, partial)` | `company.teams.update` | Returns `TeamConfig` |
| `deleteTeam(state, id)`          | `company.teams.delete` | —                    |

### Profile Actions

| Function                             | RPC Called            | Description              |
| ------------------------------------ | --------------------- | ------------------------ |
| `saveCompanyProfile(state, partial)` | `company.profile.set` | Updates `companyProfile` |

---

## Views

Views are pure functions that receive props and return Lit `html` template results. They use module-level mutable variables for local UI state (e.g. selected node, modal open/closed, zoom level) — this is intentional for performance since views are re-evaluated on every render.

### `company-overview.ts` — `renderCompanyOverview(props)`

**Props:**

```typescript
{
  profile: CompanyProfile | null;
  agents: ClawDockAgent[];
  tasks: Task[];
  messages: AgentMessage[];
  onSaveProfile: (partial: Partial<CompanyProfile>) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
}
```

**Sections:**

- Company profile card (name, mission, values) with inline editing
- Agent summary grid (counts by status)
- Task summary (counts by status)
- Message feed ("Talk to Company" with chat history)

---

### `company-office.ts` — `renderCompanyOffice(props)`

**Props:**

```typescript
{
  requestUpdate?: () => void;    // triggers Lit re-render (used by animation loop)
  agents?: ClawDockAgent[];
  logs?: Map<string, LogEntry[]>;
  messages?: AgentMessage[];
  onSendMessage?: (content: string) => void;
  onStopAgent?: (agentId: string) => void;
}
```

**Key module-level state:**

| Variable          | Type                           | Description                                  |
| ----------------- | ------------------------------ | -------------------------------------------- |
| `_agents`         | `OfficeAgent[]`                | Animation positions, status, thought bubbles |
| `_messages`       | `FlyingMessage[]`              | In-flight message packet animations          |
| `_canvasBubbles`  | `CanvasBubble[]`               | Floating output text above agents            |
| `_tick`           | `number`                       | Animation frame counter                      |
| `_isPaused`       | `boolean`                      | Pause the simulation                         |
| `_rightTab`       | `"log" \| "output" \| "human"` | Active right panel tab                       |
| `_logAgentFilter` | `string`                       | "all" or agentId to filter logs              |
| `_humanInput`     | `string`                       | Current textarea value                       |

**Animation:**

- `startSimulation(update)` is called on first render; fires `requestAnimationFrame` in a loop
- `simulationStep()` advances agent positions toward their target desks/meeting room, handles thought bubble timers, and spawns message packet animations every 200 ticks
- Agent positions use tile coordinates; tile size = 62px
- Real backend agents are seeded into the animation on first load; their status is synced on every render

**Right panel tabs:**

1. **Execution Log** — shows `displayLog` (backend logs + optimistic human entries), filterable by agent
2. **Outputs** — shows only `type === "output"` entries with approve/revise actions
3. **Talk to Company** — chat log (`props.messages`) + textarea to send new messages

**Empty state:** When `_agents.length === 0`, shows a placeholder tile with instructions to configure agents.

---

### `company-org-chart.ts` — `renderCompanyOrgChart(props)`

**Props:**

```typescript
{
  agents?: ClawDockAgent[];
}
```

**Key module-level state:**

| Variable         | Type                     | Description                 |
| ---------------- | ------------------------ | --------------------------- |
| `_activeOrgTree` | `OrgNode`                | Current tree being rendered |
| `_selectedId`    | `string \| null`         | Currently selected node     |
| `_addTargetId`   | `string \| null`         | Node to add a child under   |
| `_deleteMode`    | `boolean`                | Delete mode active          |
| `_layout`        | `"hierarchy" \| "teams"` | Current layout mode         |
| `_zoom`          | `number`                 | SVG scale factor (0.3–2.5)  |

**Layout engine:**

1. `layoutTree(node, depth)` — recursively computes `subtreeW` (total horizontal width of subtree)
2. `placeTree(node, left)` — assigns `x` coordinates top-down, centering parents over their children
3. `collectNodes(node)` — flattens tree to array for rendering
4. `edgesFromTree(node, nodeMap)` — generates bezier curve control points for connecting lines

**Switching between real and demo data:**

- If `props.agents` is non-empty: `agentsToOrgTree(agents)` converts `ClawDockAgent[]` to an `OrgNode` tree using `directReports` relationships
- If empty: falls back to `ORG_TREE` (hardcoded demo data) and shows a "Demo preview" banner

**`agentsToOrgTree` logic:**

1. Build a Set of all agent IDs that appear as `directReports`
2. Agents NOT in that set are root nodes
3. If exactly one root → single-root tree
4. Multiple roots → virtual `__org__` root node wrapping all roots

**Teams layout:**

- Groups nodes by `team` field into columns
- Each column gets a background rectangle with team name header

**Add/Delete UI:**

- "+ Add Role" button opens a modal with quick-select presets and a custom form
- "🗑️ Remove" button toggles delete mode (nodes get red X overlay, click to delete)
- "Add Report" from the detail card → opens add modal pre-targeted at selected node

---

### `company-fleet.ts` — `renderCompanyFleet(props)`

**Props:**

```typescript
{
  agents: ClawDockAgent[];
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onLoadLogs: (id: string) => Promise<void>;
}
```

**Features:**

- Status table with CPU%, memory, tokens used, tasks completed
- Color-coded status badges
- Per-agent action buttons (start, stop, restart, pause/resume)
- Expandable log panel per agent

---

### `company-teams.ts` — `renderCompanyTeams(props)`

**Props:**

```typescript
{
  teams: TeamConfig[];
  agents: ClawDockAgent[];
  onCreateTeam: (params) => Promise<void>;
  onUpdateTeam: (id, partial) => Promise<void>;
  onDeleteTeam: (id) => Promise<void>;
}
```

**Features:**

- Team cards with agent avatars
- Inline team creation form
- Supervision strategy selector

---

### `company-tasks.ts` — `renderCompanyTasks(props)`

**Props:**

```typescript
{
  tasks: Task[];
  agents: ClawDockAgent[];
  onCreateTask: (params) => Promise<void>;
  onUpdateTask: (id, partial) => Promise<void>;
  onDeleteTask: (id) => Promise<void>;
  onAssignTask: (taskId, agentId) => Promise<void>;
}
```

**Features:**

- Kanban board with columns: Backlog → In Progress → Review → Done
- Drag-implied status change via column buttons
- Priority badges, assignee display
- Agent picker for assignment

---

### `company-monitor.ts` — `renderCompanyMonitor(props)`

**Props:**

```typescript
{
  requestRender?: () => void;
  agents?: ClawDockAgent[];
  logs?: Map<string, LogEntry[]>;
}
```

**Features:**

- Timeline view of log entries across all agents, with zoom
- Per-agent swimlanes
- Log entry type annotations (tool calls, outputs, errors)
- Workspace badges

---

## Routing (`navigation.ts`)

Company views are registered as tabs:

```typescript
// navigation.ts
tabs: ["companyOverview", "companyOrgChart", "companyOffice", "companyMonitor"];

// URL paths
companyOverview: "/company";
companyOrgChart: "/company/org-chart";
companyOffice: "/company/office";
companyFleet: "/company/fleet";
companyTeams: "/company/teams";
companyTasks: "/company/tasks";
companyMonitor: "/company/monitor";
```

---

## Rendering Pipeline (`app-render.ts`)

Views are rendered lazily via `createLazy` + `lazyRender`:

```typescript
const lazyCompanyOverview = createLazy(() => import("./views/company-overview.ts"));
const lazyCompanyOffice = createLazy(() => import("./views/company-office.ts"));
const lazyCompanyOrgChart = createLazy(() => import("./views/company-org-chart.ts"));
const lazyCompanyFleet = createLazy(() => import("./views/company-fleet.ts"));
const lazyCompanyTeams = createLazy(() => import("./views/company-teams.ts"));
const lazyCompanyTasks = createLazy(() => import("./views/company-tasks.ts"));
const lazyCompanyMonitor = createLazy(() => import("./views/company-monitor.ts"));
```

Props are assembled inline in `renderApp()`. Action callbacks call controller functions and then call `requestHostUpdate?.()` to re-render the app. For `onSendMessage`, `loadCompanyMessages` is also called to refresh the chat log immediately.

---

## Types (`company-types.ts`)

The frontend has a mirror of backend types in `ui/src/ui/company-types.ts`. These are kept in sync with `src/company/types.ts` manually. Key differences:

- No `AgentRuntimeState.logBuffer` (logs are in `companyAgentLogs` Map, not embedded in agent objects)
- `LogEntryType` is extended with `"message_out" | "message_in"` (backend only — frontend displays these as `"system"`)
