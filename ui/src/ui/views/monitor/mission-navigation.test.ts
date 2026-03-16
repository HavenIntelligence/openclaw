import { describe, expect, it } from "vitest";
import {
  consumePendingMission,
  hasPendingMission,
  queueMissionNavigation,
} from "./mission-navigation";

describe("mission navigation queue", () => {
  it("queues and consumes a mission id", () => {
    // consume any leftover state
    consumePendingMission();

    expect(hasPendingMission()).toBe(false);
    expect(consumePendingMission()).toBeNull();

    queueMissionNavigation("mission-alpha");
    expect(hasPendingMission()).toBe(true);

    const id = consumePendingMission();
    expect(id).toBe("mission-alpha");

    // consumed — should be empty now
    expect(hasPendingMission()).toBe(false);
    expect(consumePendingMission()).toBeNull();
  });

  it("latest queue wins", () => {
    consumePendingMission();

    queueMissionNavigation("mission-alpha");
    queueMissionNavigation("mission-beta");

    expect(consumePendingMission()).toBe("mission-beta");
    expect(consumePendingMission()).toBeNull();
  });
});
