# ClawDock: Multi-Agent Control Plane — Product Proposal

**Status:** Draft  
**Author:** Engineering  
**Date:** 2026-03-13

---

## 1. Overview

ClawDock is a new operational layer built on top of OpenClaw that enables the **one-person company** pattern: a single founder commanding a fleet of specialized AI agents organized into departments (teams), with automated health monitoring, crash recovery, inter-agent communication, and a unified control dashboard.

The analogy is precise:

> Like Kubernetes for containers, ClawDock is the runtime control plane for AI agents.

Kubernetes did not invent containers — it gave them a runtime. ClawDock does not invent agents — it gives them a control plane.

---

## 2. Problem Statement

### 2.1 The One-Person Company Cannot Run Without a Control Plane

The promise of the AI agent era is the one-person company — a single individual commanding a fleet of specialized agents to produce output that previously required a full team. The pattern is already emerging: developers are building 8-agent "departments" (CEO, CFO, COO, Lawyer, Marketing, CTO, and more) with shared memory and peer review chains, all orchestrated from a single IDE.

But these setups are fragile:

- **No supervision**: When an agent crashes, the founder manually restarts it. There is no Erlang/OTP-style supervision tree.
- **No resource governance**: API keys, GPU quotas, and file access are shared ad-hoc, not managed.
- **No inter-agent messaging**: Agents communicate through the filesystem or direct API calls, with no structured bus.
- **No lifecycle management**: Starting, stopping, pausing, and restarting agents requires manual SSH or CLI commands.
- **No observability**: There is no unified view of what every agent is doing, what it has consumed, and why it crashed.

A real company has HR, IT, facilities, and finance to manage all of this. The one-person company has... nothing. The founder is simultaneously the CEO, the IT department, the facilities manager, and the babysitter for every crashed process.

This is the state of container deployment before Kubernetes. Individual containers could run, but there was no control plane for scheduling, health monitoring, auto-recovery, resource quotas, or service discovery. The agent ecosystem needs an equivalent primitive — not another agent framework, but a runtime layer that manages agent instances the way an operating system manages processes.

**ClawDock is that layer.**

---

## 3. Architecture

### 3.1 Architectural Position

ClawDock sits between the user and the agent fleet as a middleware control plane. It does not define how agents reason, call tools, or structure their prompts. Instead, it manages the lifecycle, resources, communication, recovery, and governance of agent instances — regardless of which framework built them.

In the one-person company analogy: ClawDock is the COO, HR, IT, and facilities department rolled into one — the operational backbone that lets the founder focus on strategy and review, not infrastructure babysitting.

```
┌────────────────────────────────────────────────────┐
│  USER LAYER — CLI · Web Dashboard · Chat Interface │
└────────────────────────┬───────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────┐
│              CLAWDOCK CONTROL PLANE                 │
│                                                     │
│  Agent Registry     Resource Scheduler    Durable   │
│  & Lifecycle Mgr    & Arbitrator          Execution │
│                                                     │
│  Health &           Inter-Agent           Governance │
│  Recovery           Message Bus           & Policy   │
│  Supervisor                               Engine     │
└────────────────────────┬───────────────────────────┘
                         │
     ┌──────────────────┼──────────────────┐
     ▼                  ▼                  ▼
┌──────────┐     ┌──────────┐      ┌───────────┐
│ Claude   │     │ LangGraph│      │ NanoClaw  │
│ Code     │     │ Pipeline │      │ Instance  │
└──────────┘     └──────────┘      └───────────┘
```

### 3.2 Core Components

#### Agent Registry and Lifecycle Manager

- Maintains a canonical registry of all agent instances (name, team, framework, capabilities, status).
- Exposes lifecycle operations: `start`, `stop`, `pause`, `resume`, `restart`.
- Tracks uptime, task counts, token usage, and crash history per agent.

#### Resource Scheduler and Arbitrator

- Per-team and per-agent budgets: token quotas, API rate limits, file access allowlists.
- Priority queuing: high-priority agents get first access to constrained resources.
- Auto-throttle: when budget is near, gracefully slows agents before hard cutoff.

#### Health and Recovery Supervisor

Inspired by Erlang/OTP supervision trees, ClawDock implements a hierarchical supervision model:

```
ClawDock Root Supervisor (the "COO")
├── Team Supervisor: "content-pipeline" (Department Head)
│   ├── Agent: research-alpha
│   ├── Agent: writing-beta
│   └── Agent: review-gamma
├── Team Supervisor: "devops" (Department Head)
│   ├── Agent: code-agent
│   └── Agent: test-runner
└── Singleton: "personal-assistant" (Executive Assistant)
    └── Agent: nanoclaw-primary
```

Three configurable supervision strategies per team:

| Strategy       | Behavior                             | Use Case                      |
| -------------- | ------------------------------------ | ----------------------------- |
| `one-for-one`  | One crash → only that agent restarts | Independent parallel workers  |
| `one-for-all`  | One crash → entire team restarts     | Tightly coupled collaborators |
| `rest-for-one` | One crash → all downstream restart   | Pipeline structures           |

#### Inter-Agent Message Bus

Provides the internal communications infrastructure for agents, bridging heterogeneous protocols:

- **MCP Gateway**: Exposes each agent's capabilities as MCP tools to other agents.
- **A2A Support**: Auto-generates Agent Cards from descriptors, enabling standardized discovery and task delegation.
- **File-based IPC**: For agents operating on shared filesystems, with inotify-based event propagation.
- **Structured Message Queue**: SQLite (single-node) or Redis/NATS (distributed) with typed schemas and delivery guarantees.

Built-in coordination patterns:

| Pattern                       | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| Pipeline (assembly line)      | Research → write → review, output flowing automatically       |
| Fan-out (parallel delegation) | Coordinator distributes subtasks, aggregator synthesizes      |
| Peer review                   | Agents consult each other with loop prevention and escalation |

#### Governance and Policy Engine

- Per-team spending limits (daily/monthly).
- Tool-use allowlists per agent and per team.
- Exec approval policies (which agents can run shell commands).
- Audit log of all inter-agent communications.

---

## 4. Dashboard UI Design

### 4.1 New Navigation Group: "Company"

The dashboard gains a new **Company** navigation group above the existing **Agent** and **Settings** groups, containing three views:

#### 4.1.1 Company Overview (`/company`)

The top-level view shows:

- **Company hero banner**: name, tagline, aggregate stats (teams count, active/total agents, tasks today, tokens today, health status).
- **Alert banner**: surface crashed agents and recovery status immediately.
- **Supervision Tree visualization**: interactive org-chart showing the root supervisor → team supervisors → agent leaves, with live status indicators.
- **Quick Actions panel**: Start all, Pause fleet, Restart crashed, Emergency stop.
- **System Health panel**: status of control plane, message bus, supervision, and event log.
- **Recent Events feed**: last N events from the event log (crashes, task completions, inter-agent messages).

#### 4.1.2 Teams (`/company/teams`)

Team-level management view:

- **Strategy Legend**: explains the four supervision strategies.
- **Team Cards**: one card per team showing:
  - Name, description, strategy badge, health status.
  - Mini stats: running/total agents, crashed count, tasks today.
  - **Agents table**: per-agent row with status pulse, role, model, tasks (running + completed), uptime, and action buttons (restart/pause/start).
  - **Footer banner**: shows when agents have crashed, with "Restart all crashed" CTA.

#### 4.1.3 Fleet (`/company/fleet`)

Full fleet view — all agents in one table:

- **Fleet summary bar**: running/idle/crashed chip counts, total tasks, total tokens, "Restart crashed" action.
- **Fleet table**: every agent with agent name, team, role, model, status pill, task counts, CPU usage bar, memory bar, token usage, last activity time, and action buttons.
- **Architecture callout**: explains ClawDock's role at the bottom.

### 4.2 UI Design Principles

- **Dark-first**: inherits the existing OpenClaw dark palette (`--bg: #0e1015`, `--accent: #ff5c5c`).
- **Pulse animations**: agent status dots animate for running (green) and crashed (red flicker) states.
- **Resource bars**: inline CPU and memory bars with color-coded thresholds (green/amber/red).
- **Strategy badges**: color-coded monospace labels (blue 1:1, purple 1:all, teal rest:1, amber singleton).
- **No external dependencies**: all UI uses Lit + existing CSS variables; no new npm packages.

---

## 5. API Interface Design

The following REST/WS API endpoints are proposed for the ClawDock control plane:

### 5.1 Agent Registry

```
GET    /api/company/agents                   # list all agents
GET    /api/company/agents/:id               # get agent details
POST   /api/company/agents/:id/start         # start agent
POST   /api/company/agents/:id/stop          # stop agent
POST   /api/company/agents/:id/restart       # restart agent
GET    /api/company/agents/:id/logs          # stream logs
GET    /api/company/agents/:id/metrics       # cpu/mem/tokens
```

### 5.2 Teams

```
GET    /api/company/teams                    # list all teams
GET    /api/company/teams/:id                # get team with agents
PUT    /api/company/teams/:id/strategy       # update supervision strategy
POST   /api/company/teams/:id/restart-all    # restart all crashed in team
```

### 5.3 Message Bus

```
GET    /api/company/messages                 # recent inter-agent messages
POST   /api/company/messages                 # send message to agent
GET    /api/company/messages/ws              # WebSocket stream
```

### 5.4 Health and Events

```
GET    /api/company/health                   # overall health summary
GET    /api/company/events                   # event log (paginated)
GET    /api/company/events/ws                # live event stream
```

---

## 6. Implementation Phases

### Phase 1 (Current): Frontend Demo

- [x] Add Company navigation group to dashboard sidebar.
- [x] Implement Company Overview view with supervision tree visualization and demo data.
- [x] Implement Teams view with strategy legend and agent management UI.
- [x] Implement Fleet view with full agent table, resource bars, and status pills.
- [x] Rename brand to ClawDock in the dashboard.
- [x] Add company.css styles following existing design system.

### Phase 2: API Layer

- [ ] Define TypeScript interfaces for `CompanyAgent`, `Team`, `SupervisionTree`, `EventLogEntry`.
- [ ] Implement `GET /api/company/agents` endpoint in the gateway.
- [ ] Wire Fleet and Teams views to real data.
- [ ] Implement WebSocket event feed for real-time status updates.

### Phase 3: Supervision Engine

- [ ] Implement `HealthSupervisor` class with `one-for-one`, `one-for-all`, `rest-for-one` strategies.
- [ ] Integrate with existing agent session lifecycle.
- [ ] Expose crash/restart events to the event log.

### Phase 4: Message Bus

- [ ] Implement structured SQLite message queue.
- [ ] Expose MCP tool bridge between agents.
- [ ] Add fan-out and pipeline coordination primitives.

### Phase 5: Resource Governance

- [ ] Per-team token budget tracking.
- [ ] Auto-throttle when approaching limits.
- [ ] Dashboard budget overview in Company Overview.

---

## 7. File Map

| File                                  | Purpose                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/ui/navigation.ts`             | Added `companyOverview`, `companyTeams`, `companyFleet` tabs and `company` nav group                                                                          |
| `ui/src/ui/icons.ts`                  | Added `building`, `users`, `network`, `activity`, `play`, `pause`, `stop`, `alertTriangle`, `checkCircle`, `rotateCounterClockwise`, `cpu`, `terminal2` icons |
| `ui/src/ui/views/company-overview.ts` | Company Overview page with supervision tree                                                                                                                   |
| `ui/src/ui/views/company-teams.ts`    | Teams management page                                                                                                                                         |
| `ui/src/ui/views/company-fleet.ts`    | Fleet view with full agent table                                                                                                                              |
| `ui/src/styles/company.css`           | All ClawDock company/fleet UI styles                                                                                                                          |
| `ui/src/i18n/locales/en.ts`           | Added `company` nav group label and new tab strings                                                                                                           |
| `ui/src/ui/app-render.ts`             | Integrated new lazy-loaded views; updated brand to ClawDock                                                                                                   |
| `ui/index.html`                       | Updated title to "ClawDock Control"                                                                                                                           |
| `docs/design/clawdock-proposal.md`    | This document                                                                                                                                                 |

---

## 8. Design Decisions and Trade-offs

### Why Erlang/OTP-style supervision?

Erlang has proven the supervision tree model for fault-tolerant distributed systems over 30+ years. The model maps cleanly to AI agent teams: teams are supervisors, agents are workers, and the three restart strategies cover the main coordination patterns (independent, tightly coupled, pipeline).

### Why demo data first?

Implementing real agent lifecycle APIs requires changes across the gateway, routing layer, and session management. Building the UI with realistic demo data first lets us validate the UX and navigation structure before committing to the API shape. This is standard product development practice.

### Why Lit instead of React?

The existing dashboard is built on Lit. Adding React for the company views would introduce a second framework with bundle cost, no type boundary, and maintenance overhead. Lit templates are expressive enough for the current requirements.

### Why keep ClawDock in the same repo?

ClawDock builds directly on OpenClaw's gateway infrastructure (sessions, agents, channels, cron). Keeping it in the same repo avoids duplication of the gateway and allows incremental migration — the company views can share data already loaded for the existing agent/sessions/usage views.

---

## 9. Open Questions

1. **Persistence layer**: Should supervision state be stored in SQLite alongside sessions, or in a separate file?
2. **Agent descriptors**: What is the canonical format for describing an agent's capabilities (for A2A Agent Cards)?
3. **Resource metering**: Should token budgets be per-day, per-month, or per-run?
4. **Multi-tenant**: Should each gateway instance support multiple "companies" (organizations), or is one company per gateway sufficient?
5. **Mobile**: Should the Company/Fleet views be adapted for the iOS/Android apps?
