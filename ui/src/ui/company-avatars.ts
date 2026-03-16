/**
 * Shared avatar assets for ClawDock company views (org chart, office).
 * Each agent gets a deterministic avatar by id so the same agent shows the same avatar everywhere.
 */

const AVATAR_FILES = [
  "aivatar_hex_01.svg",
  "aivatar_hex_02.svg",
  "aivatar_hex_03.svg",
  "aivatar_hex_04.svg",
  "aivatar_hex_10.svg",
  "aivatar_hex_11.svg",
  "aivatar_hex_12.svg",
  "aivatar_hex_21.svg",
  "aivatar_hex_22.svg",
  "aivatar_hex_23.svg",
  "aivatar_hex_24.svg",
] as const;

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Public base path for avatars (e.g. /avatars/ in dev, or /control-ui/avatars/ when base path set). */
export function avatarBasePath(): string {
  const base = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL;
  // Relative base (e.g. "./") breaks under nested routes like /company/office,
  // so only use it when it's an absolute sub-path (e.g. "/control-ui/").
  if (base && base.startsWith("/") && base !== "/") {
    return `${base.replace(/\/$/, "")}/avatars/`;
  }
  return "/avatars/";
}

/** Deterministic avatar filename for an agent id. Same id => same avatar in org chart and office. */
export function getAvatarFilenameForAgent(agentId: string): string {
  const idx = simpleHash(agentId) % AVATAR_FILES.length;
  return AVATAR_FILES[idx];
}

/** Full URL for an avatar filename (for use in img src or SVG image href). */
export function getAvatarUrlForAgent(agentId: string): string {
  return `${avatarBasePath()}${getAvatarFilenameForAgent(agentId)}`;
}
