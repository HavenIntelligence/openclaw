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

const AVATAR_BASE_PATH = "../../../assets/avatars/";

const AVATAR_URLS = Object.fromEntries(
  AVATAR_FILES.map((filename) => [
    filename,
    new URL(`${AVATAR_BASE_PATH}${filename}`, import.meta.url).href,
  ]),
) as Record<(typeof AVATAR_FILES)[number], string>;

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Deterministic avatar filename for an agent id. Same id => same avatar in org chart and office. */
export function getAvatarFilenameForAgent(agentId: string): string {
  const idx = simpleHash(agentId) % AVATAR_FILES.length;
  return AVATAR_FILES[idx];
}

export function getAvatarVariantForAgent(agentId: string): { url: string; hue: number } {
  const filename = getAvatarFilenameForAgent(agentId);
  const url = AVATAR_URLS[filename];
  const hue = simpleHash(`${agentId}-variant`) % 360;
  return { url, hue };
}

/** Full URL for an avatar filename (for use in img src or SVG image href). */
export function getAvatarUrlForAgent(agentId: string): string {
  return getAvatarVariantForAgent(agentId).url;
}
