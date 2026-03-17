/**
 * Shared avatar assets for ClawDock company views (org chart, office).
 * Each agent gets a deterministic avatar by id so the same agent shows the same avatar everywhere.
 */

const AVATAR_FILES = [
  "aivatar_hex_01.png",
  "aivatar_hex_02.png",
  "aivatar_hex_03.png",
  "aivatar_hex_04.png",
  "aivatar_hex_10.png",
  "aivatar_hex_11.png",
  "aivatar_hex_12.png",
  "aivatar_hex_21.png",
  "aivatar_hex_22.png",
  "aivatar_hex_23.png",
] as const;

// Public avatars are served from the Vite publicDir (`ui/public/avatars`).
// Always use an absolute path so avatars resolve correctly regardless of the
// current SPA route (e.g. /company/org-chart).  When a non-trivial basePath is
// configured the gateway strips it before looking up the file on disk, so we
// only need to prepend that prefix here.
const baseEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
const rawBase = baseEnv?.BASE_URL || "/";
// "./" (Vite default for relative builds) must become "/" for absolute resolution.
const base = rawBase === "./" || rawBase === "." ? "/" : rawBase;
const baseNorm = base.endsWith("/") ? base : `${base}/`;
const AVATAR_BASE_PATH = `${baseNorm}avatars/`;

const AVATAR_URLS = Object.fromEntries(
  AVATAR_FILES.map((filename) => [filename, `${AVATAR_BASE_PATH}${filename}`]),
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
