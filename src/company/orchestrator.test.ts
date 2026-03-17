import { describe, expect, it } from "vitest";
import { buildPlanPrompt } from "./orchestrator.js";

describe("buildPlanPrompt", () => {
  const subordinates = [
    { id: "literature_scout", role: "Literature Scout", description: "Finds papers and sources." },
    {
      id: "reading_analyst",
      role: "Reading Analyst",
      description: "Reads and summarizes sources.",
    },
  ];

  it("includes delegation rule that agents cannot communicate and context goes via subtask", () => {
    const prompt = buildPlanPrompt(
      "Research Orchestrator",
      "Conduct a literature review.",
      subordinates,
    );
    expect(prompt).toContain("cannot talk to each other");
    expect(prompt).toContain("context must be passed by you");
    expect(prompt).toMatch(/cross-agent|subtask text/);
  });

  it("instructs to use web search for literature/research agents", () => {
    const prompt = buildPlanPrompt("Research Orchestrator", "Find papers on RAG.", subordinates);
    expect(prompt).toMatch(/web search|Gemini|Google/);
    expect(prompt).toMatch(/literature|paper|research|discovery/);
    expect(prompt).toContain("literature_scout");
  });

  it("includes team list and JSON format", () => {
    const prompt = buildPlanPrompt("CEO", "Plan Q2.", subordinates);
    expect(prompt).toContain("YOUR TEAM:");
    expect(prompt).toContain("literature_scout");
    expect(prompt).toContain("reading_analyst");
    expect(prompt).toContain("agentId");
    expect(prompt).toContain("subtask");
    expect(prompt).toContain("[]");
  });
});

describe("orchestrator verification behavior", () => {
  it("keeps delegating when research task only used one specialist", () => {
    // This is a contract test for the coverage gate logic (indirectly enforced by prompt + code).
    // We just ensure the plan prompt still advertises multi-agent delegation; the runtime logic
    // is exercised in integration tests.
    const subordinates = [
      {
        id: "literature_scout",
        role: "Literature Scout",
        description: "Finds papers and sources.",
      },
      {
        id: "reading_analyst",
        role: "Reading Analyst",
        description: "Reads and summarizes sources.",
      },
      { id: "comparison_analyst", role: "Comparison Analyst", description: "Compares approaches." },
    ];
    const prompt = buildPlanPrompt(
      "Research Orchestrator",
      "Do a research report comparing RAG vs fine-tuning for factuality and latency.",
      subordinates,
    );
    expect(prompt).toContain("delegate");
    expect(prompt).toContain("YOUR TEAM:");
    expect(prompt).toContain("comparison_analyst");
  });
});
