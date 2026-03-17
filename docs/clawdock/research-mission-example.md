# ClawDock — Research Team Layout & Example Mission

This document describes a **research-oriented company layout** (roles, hierarchy) and gives a **ready-to-use research mission** in English so the Research Orchestrator (CEO) and specialists run together smoothly.

---

## 1. Research company architecture

### Roles and hierarchy

| Agent ID              | Role                   | Description                                                                                                                                        |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ceo`                 | Research Orchestrator  | Top-level director. Receives the user mission, plans delegation, assigns subtasks to the research team, synthesizes results, and verifies quality. |
| `literature_scout`    | Literature Scout       | Finds and screens relevant papers, datasets, or sources for a given topic.                                                                         |
| `reading_analyst`     | Paper Reading Analyst  | Reads selected materials and produces structured summaries, key claims, and methodology notes.                                                     |
| `comparison_analyst`  | Comparison Analyst     | Compares approaches, methods, or findings across sources and highlights trade-offs and gaps.                                                       |
| `experiment_designer` | Experiment Designer    | Proposes validation steps, experiments, or replication plans to validate or stress-test findings.                                                  |
| `report_writer`       | Research Report Writer | Writes the final deliverable: executive summary, structured report, or recommendations.                                                            |

The **CEO** is the only agent that should have **no** `reportTo` (or `reportTo: null`). All other research agents must have **`reportTo: "ceo"`** in `~/.openclaw/clawdock/agents-meta.json` so that:

1. "Talk to Company" sends the mission to the CEO (director selection picks `ceo` by id or role).
2. The orchestrator’s planning phase sees the CEO’s **direct reports** (literature_scout, reading_analyst, comparison_analyst, experiment_designer, report_writer).
3. Delegation and synthesis can run across the full pipeline.

### Director selection (reminder)

The gateway chooses the **company director** in this order: agent whose role contains `"orchestrator"`, then `id === "orchestrator"`, then role or id `"ceo"`, then the agent with the most direct reports, then the first agent. With `ceo` as Research Orchestrator and others reporting to `ceo`, the research team is used as intended.

---

## 2. Example research mission (English, copy-paste)

Use this prompt in **Talk to Company** or via CLI so the CEO delegates to the research pipeline and the team collaborates end-to-end.

```
Conduct a short research mission on the following topic and produce a concise final report.

Topic: "Effect of retrieval-augmented generation (RAG) vs fine-tuning on factuality and latency in LLM applications (2023–2025)."

Requirements:
1. Literature: Identify 3–5 relevant papers or technical reports (arxiv, blogs, or vendor docs) that compare or evaluate RAG vs fine-tuning for factuality and/or latency. Prefer recent work (2023 onward).
2. Reading: For each selected source, extract the main claim, methodology (e.g. benchmarks, metrics), and any reported numbers on accuracy or latency.
3. Comparison: Summarize how the sources agree or disagree; note gaps (e.g. missing baselines, narrow domains) and trade-offs (cost, complexity, update frequency).
4. Validation: Propose one concrete validation or replication step (e.g. a small experiment or a checklist) that could strengthen or challenge the conclusions.
5. Report: Produce a short final report (about 1–2 pages) with: (a) executive summary, (b) summary of sources and comparison, (c) validation recommendation, (d) limitations and suggested next steps.

Assign each of the above steps to the appropriate specialist on your team. Synthesize their outputs into one coherent deliverable and ensure the final report is self-contained and actionable.
```

This mission is intentionally **somewhat complex** so that:

- **Literature Scout** gets a clear subtask (find and screen 3–5 sources on RAG vs fine-tuning, factuality/latency, 2023+).
- **Reading Analyst** gets one or more subtasks (per-source or batched extraction of claims, methodology, numbers).
- **Comparison Analyst** gets a clear subtask (synthesize agreement/disagreement, gaps, trade-offs).
- **Experiment Designer** gets a clear subtask (one validation/replication proposal).
- **Report Writer** gets the synthesis plus a clear brief (executive summary, comparison, validation, limitations, next steps).

The CEO’s planning prompt receives the full mission and the list of subordinates (with ids and descriptions); it should output a JSON delegation array that maps each specialist to a concrete subtask. The orchestrator then runs those subtasks, synthesizes, and optionally runs a verification round before returning the final report.

---

## 3. API and skills configuration

Ensure every research agent can use **web search (e.g. Gemini)** and **research-related skills**. OpenClaw applies these as follows.

### Global: web search and fetch

**Web search** (e.g. Gemini) and **web_fetch** are configured **once** at the root of `~/.openclaw/openclaw.json`. All agents that use this config inherit them; there is no per-agent switch for “enable search.”

Example (you already have this if you followed the Gemini setup):

```json
"tools": {
  "web": {
    "search": {
      "provider": "gemini",
      "enabled": true,
      "gemini": {
        "apiKey": "<your-gemini-api-key>",
        "model": "gemini-2.5-flash"
      }
    },
    "fetch": {
      "enabled": true
    }
  }
}
```

Keep `tools.web.fetch.enabled: true` so agents can fetch URLs. No extra per-agent API config is needed for Gemini search.

### Per-agent: skills

Skills are loaded from the agent’s **workspace** (e.g. `agents.defaults.workspace` or per-agent `workspace`). The workspace `skills/` directory (and any `skills.load.extraDirs`) is scanned; each subfolder with a `SKILL.md` becomes one skill.

- **Omit** `agents.list[].skills` → the agent gets **all** loaded skills.
- **Set** `agents.list[].skills` to an array → the agent gets **only** those skills (allowlist).

To **ensure** each research agent has the right skills (and optionally restrict to research-only), set `skills` explicitly on each research agent. Install the skills into the same workspace (e.g. `~/.openclaw/workspace/skills/`) via ClawHub, then reference them by name. Typical research-relevant skills (after installing from ClawHub into that workspace):

- `academic-deep-research`
- `in-depth-research`
- `web`
- `clawhub` (bundled; useful for installing more skills on the fly)

Example `agents.list` snippet with skills and shared workspace:

```json
"agents": {
  "defaults": {
    "workspace": "/path/to/your/workspace"
  },
  "list": [
    {
      "id": "ceo",
      "name": "Research Orchestrator",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web", "clawhub"]
    },
    {
      "id": "literature_scout",
      "name": "Literature Scout",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web", "clawhub"]
    },
    {
      "id": "reading_analyst",
      "name": "Paper Reading Analyst",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web"]
    },
    {
      "id": "comparison_analyst",
      "name": "Comparison Analyst",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web"]
    },
    {
      "id": "experiment_designer",
      "name": "Experiment Designer",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web"]
    },
    {
      "id": "report_writer",
      "name": "Research Report Writer",
      "model": { "primary": "your-model" },
      "skills": ["academic-deep-research", "in-depth-research", "web"]
    }
  ]
}
```

Use the same `workspace` for all (e.g. `agents.defaults.workspace`), and ensure that workspace contains `skills/academic-deep-research`, `skills/in-depth-research`, and `skills/web` (e.g. via `CLAWHUB_WORKDIR=<workspace> npx clawhub install academic-deep-research` and the same for the others). Then each agent has both **Gemini search** (global) and **research-related skills** (per-agent allowlist).

---

## 4. Quick checklist before running

- [ ] **Global API** (`~/.openclaw/openclaw.json`): `tools.web.search` is set (e.g. Gemini with `apiKey` and `model`); `tools.web.fetch.enabled` is `true`. All agents inherit this.
- [ ] **Workspace and skills**: `agents.defaults.workspace` points to a directory that has `skills/` with `academic-deep-research`, `in-depth-research`, `web` (install via ClawHub if needed). Optionally set `agents.list[].skills` per research agent as in section 3.
- [ ] **Core config**: `agents.list` includes `ceo`, `literature_scout`, `reading_analyst`, `comparison_analyst`, `experiment_designer`, `report_writer` (and optionally `ux-designer` if you use it for other work).
- [ ] **ClawDock meta** (`~/.openclaw/clawdock/agents-meta.json`): Each of the five specialists has `"reportTo": "ceo"`. The CEO has no `reportTo` or `reportTo: null`.
- [ ] **Descriptions**: Each entry in `agents-meta.json` has a short `description`; the orchestrator uses these in the planning prompt to choose who does what.
- [ ] **Gateway** is running; use Live Office or `openclaw clawdock message send "..."` with the mission text above.

After sending the mission, watch the **Tasks** board and the **Live Office** execution log: you should see one mission task and multiple subtasks assigned to the research agents, then a synthesized final result.
