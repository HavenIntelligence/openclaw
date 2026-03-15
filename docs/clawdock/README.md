# ClawDock — Multi-Agent Company Control Plane

ClawDock is the multi-agent orchestration layer built into OpenClaw. It lets you run a fleet of AI agents as a "virtual company" — each agent has a role, team, and reporting hierarchy. You can monitor, control, and communicate with the entire fleet from a unified dashboard.

## Documentation Index

| File                                                   | Contents                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [getting-started.md](./getting-started.md)             | **Start here** — installation, configuration, first task walkthrough                                                 |
| [architecture.md](./architecture.md)                   | System overview, data flow, module boundaries                                                                        |
| [inter-agent-data-flow.md](./inter-agent-data-flow.md) | How agents exchange data: orchestration protocol, message formats, delegation plan parsing, real-time event timeline |
| [backend.md](./backend.md)                             | Backend modules: `src/company/*`, service wiring, file layout                                                        |
| [api-reference.md](./api-reference.md)                 | All `company.*` gateway RPC methods — params, responses, errors                                                      |
| [realtime-events.md](./realtime-events.md)             | WebSocket broadcast events emitted by the backend                                                                    |
| [frontend.md](./frontend.md)                           | Frontend views, state management, controller functions                                                               |
| [runners.md](./runners.md)                             | Agent runtime runners — openclaw, claude-code, gemini, codex, aider                                                  |
| [data-model.md](./data-model.md)                       | TypeScript types for all ClawDock entities                                                                           |
| [cli.md](./cli.md)                                     | `openclaw clawdock` CLI commands                                                                                     |

## Quick Start

1. Install OpenClaw: `npm i -g openclaw@latest`
2. Run onboarding: `openclaw onboard`
3. Configure agents in `~/.openclaw/config.yml` under `agents.list` and metadata in `~/.openclaw/clawdock/agents-meta.json`
4. Start the gateway: `openclaw gateway run`
5. Open `http://localhost:18789` and navigate to **Company → Live Office**
6. Send a message from the **Talk to Company** panel to dispatch a task to the Agent Orchestrator
7. Watch agents plan, delegate, and synthesize in real time

See [getting-started.md](./getting-started.md) for the full walkthrough.
