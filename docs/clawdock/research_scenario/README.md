# ClawDock Research Scenario (example, no secrets)

This folder contains **sanitized example configuration** for a research-oriented ClawDock setup (company chart + agent config) that is safe to commit. It does **not** contain any real API keys.

## What’s in this folder

- `agents-meta.example.json`: Example ClawDock org chart metadata (who reports to whom).
- `openclaw.example.json`: Example `~/.openclaw/openclaw.json` snippets for agents + web tools.

## Goal: “Research Company” environment

You want a director (`ceo`) who delegates to specialists:

- `literature_scout`: find sources (papers, blogs, tech reports)
- `reading_analyst`: extract claims/method/metrics from sources
- `comparison_analyst`: compare approaches and trade-offs
- `experiment_designer`: propose validation steps / experiments
- `report_writer`: produce the final report

The orchestrator will work best when:

- The CEO is the director (no `reportTo`)
- All specialists have `reportTo: "ceo"` so the CEO has direct reports
- Web search + fetch tools are configured globally so literature tasks can actually browse/search

## 1) Configure the company chart (ClawDock meta)

ClawDock stores org-chart meta in:

- `~/.openclaw/clawdock/agents-meta.json`

Copy this repo example and edit it as needed:

- `docs/clawdock/research_scenario/agents-meta.example.json`

Then ensure:

- `ceo` has **no** `reportTo`
- each specialist has `"reportTo": "ceo"`

## 2) Configure agent definitions (OpenClaw agents list)

Agent definitions (models/skills/workspace) live in:

- `~/.openclaw/openclaw.json` under `agents`

See:

- `docs/clawdock/research_scenario/openclaw.example.json`

### Skills

This scenario assumes you’ve installed research skills into your agent workspace (for example, the default `agents.defaults.workspace`).

Typical research skills:

- `academic-deep-research`
- `in-depth-research`
- `web`
- `clawhub` (optional; convenient for installing more skills)

If you set `agents.list[].skills`, that becomes an allowlist for the agent. If you omit `skills`, the agent can use all loaded skills.

## 3) Configure web tools (required for literature scouting)

Web tools are configured globally in `~/.openclaw/openclaw.json` under:

- `tools.web.search` (web_search)
- `tools.web.fetch` (web_fetch via Firecrawl optional)

### Required API keys

At minimum (for `web_search` with Gemini):

- `GEMINI_API_KEY`

Optional but recommended (for better page extraction with `web_fetch`):

- `FIRECRAWL_API_KEY`

### How to add keys (recommended)

Use the built-in wizard:

```bash
openclaw configure --section web
```

### How to add keys (environment variables)

Export in the Gateway process environment (shell/launch config) before starting the gateway:

```bash
export GEMINI_API_KEY="<your_gemini_api_key>"
export FIRECRAWL_API_KEY="<your_firecrawl_api_key>" # optional
```

Then start the gateway (example):

```bash
openclaw gateway run --bind loopback --port 18789 --force
```

### SecretRef mode (no keys stored in openclaw.json)

If you want to avoid storing keys in `~/.openclaw/openclaw.json`, configure web tools using secret references (so the config stores only a reference and the real secret stays in env):

```bash
openclaw configure --section web --secret-input-mode ref
```

## 4) Run the scenario

1. Start the gateway.
2. Open the ClawDock UI (or your Office flow).
3. Send a multi-step research mission to “Talk to Company” so the CEO delegates across specialists.

For an example mission prompt, see:

- `docs/clawdock/research-mission-example.md`
