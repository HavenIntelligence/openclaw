import { describe, expect, it } from "vitest";
import { MessageBus } from "./message-bus.js";

describe("MessageBus.getHistory", () => {
  it("returns full history when no filters are provided", () => {
    const bus = new MessageBus();
    const m1 = bus.send("human", "company", "launch plan", "task");
    const m2 = bus.send("orchestrator", "engineering", "build it", "task");

    expect(bus.getHistory()).toEqual([m1, m2]);
  });

  it("filters by a single participant across from and to", () => {
    const bus = new MessageBus();
    const matchingOut = bus.send("engineering", "orchestrator", "done", "result");
    const matchingIn = bus.send("orchestrator", "engineering", "fix tests", "task");
    bus.send("marketing", "orchestrator", "campaign ready", "result");

    expect(bus.getHistory({ participants: ["engineering"] })).toEqual([matchingOut, matchingIn]);
  });

  it("filters by multiple participants as a union", () => {
    const bus = new MessageBus();
    const engineering = bus.send("orchestrator", "engineering", "build it", "task");
    const marketing = bus.send("orchestrator", "marketing", "launch it", "task");
    bus.send("finance", "orchestrator", "budget", "result");

    expect(bus.getHistory({ participants: ["engineering", "marketing"] })).toEqual([
      engineering,
      marketing,
    ]);
  });

  it("applies limit after participant filtering", () => {
    const bus = new MessageBus();
    bus.send("orchestrator", "engineering", "task 1", "task");
    const second = bus.send("engineering", "orchestrator", "task 2", "result");
    const third = bus.send("orchestrator", "engineering", "task 3", "task");
    bus.send("marketing", "orchestrator", "not included", "result");

    expect(bus.getHistory({ participants: ["engineering"], limit: 2 })).toEqual([second, third]);
  });
});
