import type { Annotation } from "./types";

export const mockAnnotations: Annotation[] = [
  {
    id: "ann-1",
    timestamp: 18,
    agentId: "a1",
    type: "dispatch",
    title: "Primary Branches Opened",
    description:
      "The orchestrator fans out into frontend and backend tracks to keep the main flow readable.",
  },
  {
    id: "ann-2",
    timestamp: 58,
    agentId: "a4",
    type: "insight",
    title: "Research Spike",
    description:
      "A short-lived scout branch validates backend assumptions, then folds back quickly.",
  },
  {
    id: "ann-3",
    timestamp: 118,
    agentId: "a2",
    type: "bottleneck",
    title: "Frontend Blocked",
    description: "The primary UI lane hits an auth loop and needs a focused recovery branch.",
    placement: "bottom",
  },
  {
    id: "ann-4",
    timestamp: 124,
    agentId: "a2",
    type: "decision",
    title: "Recovery Spawned",
    description:
      "The crash analyzer is dispatched as a single-purpose branch instead of adding more parallel workers.",
  },
  {
    id: "ann-5",
    timestamp: 174,
    agentId: "a6",
    type: "dispatch",
    title: "Regression Sweep",
    description:
      "A single QA lane verifies the release path after the critical UI issue is resolved.",
  },
  {
    id: "ann-6",
    timestamp: 230,
    agentId: "a1",
    type: "decision",
    title: "Release Package Ready",
    description:
      "The monitor now converges back to one final approval lane instead of several late-stage branches.",
  },
];
