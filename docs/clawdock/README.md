# ClawDock — Multi-Agent Company Control Plane

ClawDock is the multi-agent orchestration layer built into OpenClaw. It lets you run a fleet of AI agents as a "virtual company" — each agent has a role, team, and reporting hierarchy. You can monitor, control, and communicate with the entire fleet from a unified dashboard.

## Documentation Index

| File                                       | Contents                                                            |
| ------------------------------------------ | ------------------------------------------------------------------- |
| [architecture.md](./architecture.md)       | System overview, data flow, module boundaries                       |
| [backend.md](./backend.md)                 | Backend modules: `src/company/*`, service wiring, file layout       |
| [api-reference.md](./api-reference.md)     | All `company.*` gateway RPC methods — params, responses, errors     |
| [realtime-events.md](./realtime-events.md) | WebSocket broadcast events emitted by the backend                   |
| [frontend.md](./frontend.md)               | Frontend views, state management, controller functions              |
| [runners.md](./runners.md)                 | Agent runtime runners — openclaw, claude-code, gemini, codex, aider |
| [data-model.md](./data-model.md)           | TypeScript types for all ClawDock entities                          |
| [cli.md](./cli.md)                         | `openclaw company` CLI commands                                     |

## Quick Start

1. Define agents in your `~/.openclaw/config.yml` under `agents.list`.
2. Optionally edit `~/.openclaw/clawdock/agents-meta.json` to assign roles, teams, colors, and runtime.
3. Open the OpenClaw web UI and navigate to **Company → Overview**.
4. Send a message from the **Talk to Company** panel to dispatch a task to the AI Director.
5. Watch the **Live Office** and **Org Chart** views update in real time.
