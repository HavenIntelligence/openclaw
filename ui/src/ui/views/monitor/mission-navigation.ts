/**
 * Cross-framework state for mission navigation (Tasks → Monitor).
 * Uses window global to guarantee shared state across code-split chunks.
 */

const WIN = window as unknown as Record<string, unknown>;
const KEY = "__ocMonitorPendingMission";

export function queueMissionNavigation(missionId: string): void {
  WIN[KEY] = missionId;
}

export function consumePendingMission(): string | null {
  const id = WIN[KEY] as string | undefined;
  if (id) {
    delete WIN[KEY];
  }
  return id ?? null;
}

export function hasPendingMission(): boolean {
  return typeof WIN[KEY] === "string";
}
