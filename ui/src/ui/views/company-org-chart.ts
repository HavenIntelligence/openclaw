import { html, svg } from "lit";
import { getAvatarUrlForAgent } from "../company-avatars.ts";
import type { ClawDockAgent } from "../company-types.ts";
import { icons } from "../icons.ts";

// ── Types ─────────────────────────────────────────────────────────────────────
type OrgNode = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  status: "active" | "idle" | "crashed";
  model: string;
  team: string;
  description?: string;
  toolCount?: number;
  cronCount?: number;
  children?: OrgNode[];
  x?: number;
  y?: number;
};

// ── Demo data ─────────────────────────────────────────────────────────────────
const ORG_TREE: OrgNode = {
  id: "orchestrator",
  name: "Agent Orchestrator",
  role: "Orchestrator",
  emoji: "🎯",
  color: "#6366f1",
  status: "active",
  model: "claude-opus-4-5",
  team: "orchestration",
  description:
    "Top-level orchestrator — receives human instructions, plans, delegates to department agents, and synthesizes results.",
  toolCount: 4,
  cronCount: 0,
  children: [
    {
      id: "engineering",
      name: "Engineering Lead",
      role: "Engineering",
      emoji: "💻",
      color: "#22c55e",
      status: "active",
      model: "claude-opus-4-5",
      team: "engineering",
      description:
        "Manages all software engineering tasks — code, tests, CI/CD, and infrastructure.",
      toolCount: 5,
      cronCount: 2,
    },
    {
      id: "marketing",
      name: "Marketing Lead",
      role: "Marketing",
      emoji: "📣",
      color: "#f97316",
      status: "active",
      model: "claude-sonnet-4-5",
      team: "marketing",
      description: "Handles content creation, SEO, social media, campaigns, and brand strategy.",
      toolCount: 4,
      cronCount: 3,
    },
    {
      id: "operations",
      name: "Operations Lead",
      role: "Operations",
      emoji: "⚙️",
      color: "#60a5fa",
      status: "active",
      model: "claude-sonnet-4-5",
      team: "operations",
      description:
        "Manages day-to-day operations, project tracking, OKRs, and process optimization.",
      toolCount: 3,
      cronCount: 2,
    },
    {
      id: "finance",
      name: "Finance Lead",
      role: "Finance",
      emoji: "💰",
      color: "#eab308",
      status: "idle",
      model: "claude-haiku-4-5",
      team: "finance",
      description:
        "Handles budgeting, cost analysis, financial reporting, and resource allocation.",
      toolCount: 2,
      cronCount: 1,
    },
  ],
};

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 220;
const NODE_H = 118;
const H_GAP = 44;
const V_GAP = 86;
const TOP_MARGIN = 48;

// ── Layout engine ─────────────────────────────────────────────────────────────
type LayoutNode = OrgNode & { x: number; y: number; subtreeW: number };

function layoutTree(node: OrgNode, depth = 0): LayoutNode {
  const children = node.children?.map((c) => layoutTree(c, depth + 1)) ?? [];
  const subtreeW =
    children.length === 0
      ? NODE_W
      : children.reduce((s, c) => s + c.subtreeW, 0) + (children.length - 1) * H_GAP;
  return {
    ...node,
    x: 0,
    y: TOP_MARGIN + depth * (NODE_H + V_GAP),
    subtreeW,
    children,
  } as LayoutNode;
}

function placeTree(node: LayoutNode, left: number): void {
  const children = (node.children ?? []) as LayoutNode[];
  if (children.length === 0) {
    node.x = left + (node.subtreeW - NODE_W) / 2;
    return;
  }
  let cur = left;
  for (const child of children) {
    placeTree(child, cur);
    cur += child.subtreeW + H_GAP;
  }
  const firstChild = children[0];
  const lastChild = children[children.length - 1];
  node.x = (firstChild.x + lastChild.x + NODE_W) / 2 - NODE_W / 2;
}

function collectNodes(node: LayoutNode, out: LayoutNode[] = []): LayoutNode[] {
  out.push(node);
  for (const child of (node.children ?? []) as LayoutNode[]) {
    collectNodes(child, out);
  }
  return out;
}

type EdgeDef = { x1: number; y1: number; x2: number; y2: number; parentColor: string };

function edgesFromTree(
  node: OrgNode,
  nodeMap: Map<string, LayoutNode>,
  out: EdgeDef[] = [],
): EdgeDef[] {
  const parent = nodeMap.get(node.id);
  if (!parent) {
    return out;
  }
  for (const child of node.children ?? []) {
    const childNode = nodeMap.get(child.id);
    if (childNode) {
      out.push({
        x1: parent.x + NODE_W / 2,
        y1: parent.y + NODE_H,
        x2: childNode.x + NODE_W / 2,
        y2: childNode.y,
        parentColor: parent.color,
      });
    }
    edgesFromTree(child, nodeMap, out);
  }
  return out;
}

/** Convert ClawDockAgent[] into an OrgNode tree using reportTo. Includes all agents regardless of status (idle, active, crashed) so the chart stays stable. */
function agentsToOrgTree(agents: ClawDockAgent[]): OrgNode {
  if (!agents.length) {
    return ORG_TREE;
  }
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Build children map from reportTo (reverse lookup)
  const childrenMap = new Map<string, ClawDockAgent[]>();
  for (const a of agents) {
    if (a.reportTo && agentMap.has(a.reportTo)) {
      const list = childrenMap.get(a.reportTo) ?? [];
      list.push(a);
      childrenMap.set(a.reportTo, list);
    }
  }

  // Roots = agents whose reportTo is null/undefined or points to a non-existent agent
  const roots = agents.filter((a) => !a.reportTo || !agentMap.has(a.reportTo));

  // Prefer CEO/orchestrator as the single top node (no "organization" virtual root)
  const director = agents.find(
    (a) =>
      a.role?.toLowerCase().includes("director") ||
      a.role?.toLowerCase().includes("ceo") ||
      a.role?.toLowerCase().includes("orchestrator") ||
      a.id === "ai-director" ||
      a.id === "orchestrator" ||
      a.id === "ceo",
  );

  function toOrgNode(agent: ClawDockAgent): OrgNode {
    const kids = (childrenMap.get(agent.id) ?? []).map((a) => toOrgNode(a));
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      emoji: agent.emoji,
      color: agent.color,
      status:
        agent.status === "active" ? "active" : agent.status === "crashed" ? "crashed" : "idle",
      model: agent.model,
      team: agent.team,
      description: agent.description,
      toolCount: agent.toolCount,
      cronCount: agent.cronCount,
      children: kids.length ? kids : undefined,
    };
  }

  if (roots.length === 1) {
    return toOrgNode(roots[0]);
  }
  // Multiple roots: use CEO as single root and attach all other roots as CEO's subordinates
  if (director && roots.some((r) => r.id === director.id)) {
    const ceoRoot = roots.find((r) => r.id === director.id)!;
    const otherRoots = roots.filter((r) => r.id !== director.id);
    const ceoChildren = childrenMap.get(ceoRoot.id) ?? [];
    const allChildren = [...ceoChildren, ...otherRoots];
    return {
      ...toOrgNode(ceoRoot),
      children: allChildren.map((a) => toOrgNode(a)),
    };
  }
  // CEO not in roots but present in agents: use CEO as root and attach everyone else under them
  if (director) {
    const ceoChildren = roots.filter((r) => r.id !== director.id);
    return {
      ...toOrgNode(director),
      children: [...(childrenMap.get(director.id) ?? []), ...ceoChildren].map((a) => toOrgNode(a)),
    };
  }
  // Fallback: virtual root only when there is no CEO at all
  return {
    id: "__org__",
    name: "organization",
    role: "Company",
    emoji: "🏢",
    color: "#94a3b8",
    status: "active",
    model: "",
    team: "root",
    children: roots.map(toOrgNode),
  };
}

// Active org tree — updated from real agent data when available.
let _activeOrgTree: OrgNode = ORG_TREE;

function buildHierarchyLayout(): { nodes: LayoutNode[]; edges: EdgeDef[] } {
  const root = layoutTree(_activeOrgTree);
  placeTree(root, 0);
  const nodes = collectNodes(root);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = edgesFromTree(_activeOrgTree, nodeMap);
  return { nodes, edges };
}

// ── Teams layout ──────────────────────────────────────────────────────────────
type TeamGroup = {
  team: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function buildTeamsLayout(): { nodes: LayoutNode[]; teamGroups: TeamGroup[]; edges: EdgeDef[] } {
  const hierarchyRoot = layoutTree(_activeOrgTree);
  placeTree(hierarchyRoot, 0);
  const allNodes = collectNodes(hierarchyRoot);

  // Group nodes by team, preserving insertion order
  const teamMap = new Map<string, { nodes: LayoutNode[]; color: string }>();
  for (const n of allNodes) {
    if (!teamMap.has(n.team)) {
      teamMap.set(n.team, { nodes: [], color: n.color });
    }
    teamMap.get(n.team)!.nodes.push(n);
  }

  const TEAM_PAD_H = 24;
  const TEAM_PAD_V_TOP = 40;
  const TEAM_PAD_V_BOT = 20;
  const NODE_INNER_GAP = 18;
  const TEAM_COL_GAP = 40;

  let curX = 20;
  const teamGroups: TeamGroup[] = [];

  for (const [team, { nodes: teamNodes, color }] of teamMap) {
    const colW = NODE_W + TEAM_PAD_H * 2;
    let nodeY = TEAM_PAD_V_TOP;
    for (const n of teamNodes) {
      n.x = curX + TEAM_PAD_H;
      n.y = 20 + nodeY;
      nodeY += NODE_H + NODE_INNER_GAP;
    }
    const colH = nodeY - NODE_INNER_GAP + TEAM_PAD_V_BOT;
    teamGroups.push({ team, color, x: curX, y: 20, w: colW, h: colH });
    curX += colW + TEAM_COL_GAP;
  }

  return { nodes: allNodes, teamGroups, edges: [] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(status: string) {
  if (status === "active") {
    return "var(--ok)";
  }
  if (status === "crashed") {
    return "var(--destructive)";
  }
  return "#f59e0b";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function shortModel(model: string): string {
  return model
    .replace("claude-opus-", "opus-")
    .replace("claude-sonnet-", "sonnet-")
    .replace("claude-haiku-", "haiku-");
}

// Approximate chip width: char * 6.2 + padding
function chipW(text: string): number {
  return text.length * 6.2 + 16;
}

// ── Module state ─────────────────────────────────────────────────────────────
let _selectedId: string | null = null;
let _addTargetId: string | null = null;
let _deleteMode = false;
let _layout: "hierarchy" | "teams" = "hierarchy";
let _zoom = 1.0;
let _panX = 0;
let _panY = 0;
let _isPanning = false;
let _panStartX = 0;
let _panStartY = 0;
let _panStartPanX = 0;
let _panStartPanY = 0;
let _newRoleName = "";
let _newRoleEmoji = "🤖";
let _newRoleTitle = "";

const QUICK_ROLES: OrgNode[] = [
  {
    id: "",
    name: "data-scientist",
    role: "Data Scientist",
    emoji: "🧬",
    color: "#60a5fa",
    status: "idle",
    model: "claude-opus-4-5",
    team: "data",
    description: "Data analysis and ML experiments.",
    toolCount: 3,
  },
  {
    id: "",
    name: "growth-marketer",
    role: "Growth Marketer",
    emoji: "📈",
    color: "#fb923c",
    status: "idle",
    model: "claude-sonnet-4-5",
    team: "marketing",
    description: "Growth hacking and campaigns.",
    toolCount: 2,
  },
  {
    id: "",
    name: "legal-counsel",
    role: "Legal Counsel",
    emoji: "⚖️",
    color: "#a78bfa",
    status: "idle",
    model: "claude-opus-4-5",
    team: "legal",
    description: "Legal review and compliance.",
    toolCount: 2,
  },
  {
    id: "",
    name: "product-mgr",
    role: "Product Manager",
    emoji: "🎯",
    color: "#14b8a6",
    status: "idle",
    model: "gpt-4o",
    team: "product",
    description: "Roadmap planning and prioritization.",
    toolCount: 3,
  },
  {
    id: "",
    name: "security-eng",
    role: "Security Engineer",
    emoji: "🔐",
    color: "#ef4444",
    status: "idle",
    model: "claude-opus-4-5",
    team: "engineering",
    description: "Security audits and hardening.",
    toolCount: 4,
  },
  {
    id: "",
    name: "customer-success",
    role: "CSM",
    emoji: "⭐",
    color: "#22c55e",
    status: "idle",
    model: "claude-sonnet-4-5",
    team: "customer",
    description: "Customer onboarding and retention.",
    toolCount: 2,
  },
  {
    id: "",
    name: "ux-designer",
    role: "UX Designer",
    emoji: "🎨",
    color: "#f97316",
    status: "idle",
    model: "gpt-4o",
    team: "design",
    description: "Interface design and prototyping.",
    toolCount: 2,
  },
  {
    id: "",
    name: "devops-engineer",
    role: "DevOps Engineer",
    emoji: "🔧",
    color: "#34d399",
    status: "idle",
    model: "claude-haiku-4-5",
    team: "devops",
    description: "CI/CD pipelines and infra.",
    toolCount: 3,
  },
];

let _idCounter = 200;
let _onCreateAgent: CompanyOrgChartProps["onCreateAgent"];
let _onDeleteAgent: CompanyOrgChartProps["onDeleteAgent"];

// ── Node SVG renderer ─────────────────────────────────────────────────────────
function renderNodeSvg(n: LayoutNode, _allNodes: LayoutNode[]) {
  const isSelected = n.id === _selectedId;
  const isAddTarget = n.id === _addTargetId;
  const isDeletable = !_organizationRunning && _deleteMode && n.id !== _activeOrgTree.id;
  const statusC = statusColor(n.status);
  const modelShort = truncate(shortModel(n.model), 14);
  const reportCount = (n.children as LayoutNode[] | undefined)?.length ?? 0;
  const hasTools = (n.toolCount ?? 0) > 0;
  const hasCrons = (n.cronCount ?? 0) > 0;
  const desc = n.description ? truncate(n.description, 30) : "";

  // Build chip list
  type Chip = { text: string; color: string; bg: string };
  const chips: Chip[] = [];

  // Team badge
  if (n.team) {
    chips.push({
      text: n.team,
      color: n.color,
      bg: `${n.color}18`,
    });
  }

  chips.push({
    text: modelShort,
    color: "var(--accent-2-muted)",
    bg: "var(--bg-muted)",
  });

  if (reportCount > 0) {
    chips.push({
      text: `${reportCount} report${reportCount !== 1 ? "s" : ""}`,
      color: "var(--muted-foreground)",
      bg: "var(--bg-muted)",
    });
  }
  if (hasTools) {
    chips.push({
      text: `${n.toolCount} tools`,
      color: "var(--accent)",
      bg: "rgba(96,165,250,0.13)",
    });
  }
  if (hasCrons) {
    chips.push({
      text: `${n.cronCount} cron${n.cronCount !== 1 ? "s" : ""}`,
      color: "#4ade80",
      bg: "rgba(74,222,128,0.13)",
    });
  }

  // Layout chips in rows so nothing overflows the card (wrap to new line when needed)
  const CHIP_H = 16;
  const CHIP_GAP = 6;
  const ROW_GAP = 4;
  const PAD = 12;
  const maxRowW = NODE_W - PAD * 2;
  type RowItem = { chip: Chip; x: number; w: number };
  const rows: Array<{ items: RowItem[]; y: number }> = [];
  let rowY = NODE_H - 28;
  let currentRow: RowItem[] = [];
  let rowX = PAD;

  for (const chip of chips) {
    const w = chipW(chip.text);
    if (currentRow.length > 0 && rowX + w > maxRowW) {
      rows.push({ items: currentRow, y: rowY });
      currentRow = [];
      rowX = PAD;
      rowY -= CHIP_H + ROW_GAP;
    }
    currentRow.push({ chip, x: rowX, w });
    rowX += w + CHIP_GAP;
  }
  if (currentRow.length > 0) {
    rows.push({ items: currentRow, y: rowY });
  }

  const chipRects = rows.flatMap((row) =>
    row.items.map(({ chip, x, w }) => ({ ...chip, x, w, y: row.y })),
  );
  const CHIP_Y = rowY;

  const borderColor = isAddTarget
    ? "#22c55e"
    : isSelected
      ? n.color
      : isDeletable
        ? "#ef4444"
        : "var(--border)";
  const borderWidth = isSelected || isAddTarget || isDeletable ? 2 : 1;

  return svg`
    <g
      class="cd-oc-node ${isSelected ? "cd-oc-node--selected" : ""} ${n.status === "crashed" ? "cd-oc-node--crashed" : ""} ${isDeletable ? "cd-oc-node--deletable" : ""}"
      transform="translate(${n.x}, ${n.y})"
      @click=${() => {
        if (isDeletable) {
          if (_onDeleteAgent) {
            void _onDeleteAgent(n.id);
          }
          if (_selectedId === n.id) {
            _selectedId = null;
          }
        } else {
          _selectedId = isSelected ? null : n.id;
          _addTargetId = null;
        }
      }}
      style="cursor:${isDeletable ? "not-allowed" : "pointer"}"
    >
      <!-- Card background (single frame; selected = thicker border only) -->
      <rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" rx="12"
        fill="var(--card)"
        stroke="${borderColor}"
        stroke-width="${borderWidth}"
      />

      <!-- Top accent strip -->
      <rect x="2" y="0" width="${NODE_W - 4}" height="4" rx="2" fill="${n.color}" opacity="0.7" />

      <!-- Avatar circle (image with fallback initial) -->
      <circle cx="28" cy="42" r="17"
        fill="${n.color}20"
        stroke="${n.color}"
        stroke-width="1.5"
      />
      <g clip-path="url(#cd-oc-avatar-clip)">
        <image href="${getAvatarUrlForAgent(n.id)}" x="11" y="25" width="34" height="34" preserveAspectRatio="xMidYMid slice" />
      </g>

      <!-- Status dot -->
      <circle cx="39" cy="30" r="5" fill="${statusC}" />
      ${
        n.status === "active"
          ? svg`
        <circle cx="39" cy="30" r="5" fill="${statusC}" opacity="0.4">
          <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
        </circle>
      `
          : ""
      }

      <!-- Name -->
      <text x="52" y="34"
        fill="var(--text-strong)" font-size="12.5" font-weight="700" font-family="monospace"
      >${truncate(n.name, 17)}</text>

      <!-- Role (colored) -->
      <text x="52" y="49"
        fill="${n.color}" font-size="10.5" opacity="0.9"
      >${n.role}</text>

      <!-- Description -->
      ${
        desc
          ? svg`<text x="12" y="67" fill="var(--muted-foreground)" font-size="9.5">${desc}</text>`
          : ""
      }

      <!-- Divider -->
      <line x1="12" y1="${NODE_H - 36}" x2="${NODE_W - 12}" y2="${NODE_H - 36}"
        stroke="var(--border)" stroke-width="0.5" opacity="0.6" />

      <!-- Chip row -->
      ${chipRects.map(
        (chip) => svg`
        <rect x="${chip.x}" y="${(chip as { y?: number }).y ?? CHIP_Y}" width="${chip.w}" height="${CHIP_H}" rx="${CHIP_H / 2}"
          fill="${chip.bg}" />
        <text
          x="${chip.x + chip.w / 2}" y="${((chip as { y?: number }).y ?? CHIP_Y) + CHIP_H / 2}"
          text-anchor="middle" dominant-baseline="central"
          font-size="9.5" fill="${chip.color}" font-family="monospace"
        >${chip.text}</text>
      `,
      )}

      <!-- Delete X overlay -->
      ${
        isDeletable
          ? svg`
        <rect x="${NODE_W - 30}" y="8" width="20" height="20" rx="4" fill="rgba(239,68,68,0.18)" />
        <text x="${NODE_W - 20}" y="20" fill="#ef4444" font-size="14" text-anchor="middle" dominant-baseline="middle">×</text>
      `
          : ""
      }
    </g>
  `;
}

// ── Main render ───────────────────────────────────────────────────────────────
export type CompanyOrgChartProps = {
  agents?: ClawDockAgent[];
  /** When true, add/remove agents are disabled and a hint is shown. */
  organizationRunning?: boolean;
  onCreateAgent?: (params: {
    name: string;
    role?: string;
    team?: string;
    emoji?: string;
    reportTo?: string | null;
  }) => void | Promise<void>;
  onDeleteAgent?: (agentId: string) => void | Promise<void>;
};

let _organizationRunning = false;

export function renderCompanyOrgChart(props: CompanyOrgChartProps) {
  _onCreateAgent = props.onCreateAgent;
  _onDeleteAgent = props.onDeleteAgent;
  _organizationRunning = props.organizationRunning ?? false;
  const hasRealAgents = props.agents && props.agents.length > 0;
  // Update active tree from real agents each render
  if (hasRealAgents) {
    _activeOrgTree = agentsToOrgTree(props.agents!);
  } else {
    _activeOrgTree = ORG_TREE;
  }
  let nodes: LayoutNode[];
  let edges: EdgeDef[];
  let teamGroups: TeamGroup[] = [];

  if (_layout === "teams") {
    const result = buildTeamsLayout();
    nodes = result.nodes;
    edges = result.edges;
    teamGroups = result.teamGroups;
  } else {
    const result = buildHierarchyLayout();
    nodes = result.nodes;
    edges = result.edges;
  }

  const allX = nodes.map((n) => n.x);
  const allY = nodes.map((n) => n.y);
  const rawW = Math.max(...allX) + NODE_W + 60;
  const rawH = Math.max(...allY) + NODE_H + 80;

  const svgW =
    _layout === "teams" && teamGroups.length
      ? Math.max(...teamGroups.map((tg) => tg.x + tg.w)) + 40
      : rawW;
  const svgH =
    _layout === "teams" && teamGroups.length
      ? Math.max(...teamGroups.map((tg) => tg.y + tg.h)) + 40
      : rawH;

  const selected = nodes.find((n) => n.id === _selectedId) ?? null;

  // Build set of node IDs connected to selected (for edge highlight)
  const connectedIds = new Set<string>();
  if (_selectedId) {
    connectedIds.add(_selectedId);
    for (const n of nodes) {
      const kids = (n.children as LayoutNode[] | undefined) ?? [];
      if (n.id === _selectedId) {
        kids.forEach((c) => connectedIds.add(c.id));
      }
      if (kids.some((c) => c.id === _selectedId)) {
        connectedIds.add(n.id);
      }
    }
  }

  return html`
    <div class="cd-page cd-page--orgchart cd-oc-fullwidth">

      <!-- Demo banner when no real agents are configured -->
      ${
        !hasRealAgents
          ? html`
              <div class="cd-oc-demo-banner">
                <span class="cd-oc-demo-banner__icon">🔭</span>
                <span>
                  <strong>Demo preview</strong> — no agents configured yet. Add agents in your config to see your
                  real org chart here.
                </span>
              </div>
            `
          : ""
      }

      <!-- Main canvas -->
      <div class="cd-oc-canvas-wrap cd-oc-canvas-wrap--full"
        @mousedown=${(e: MouseEvent) => {
          if (e.button !== 0) {
            return;
          }
          const target = e.target as HTMLElement;
          if (
            target.closest(
              ".cd-oc-node, .cd-oc-float-toolbar, .cd-oc-zoom-controls, .cd-oc-detail-float, .cd-oc-modal-overlay, .cd-btn",
            )
          ) {
            return;
          }
          _isPanning = true;
          _panStartX = e.clientX;
          _panStartY = e.clientY;
          _panStartPanX = _panX;
          _panStartPanY = _panY;
          e.preventDefault();
        }}
        @mousemove=${(e: MouseEvent) => {
          if (!_isPanning) {
            return;
          }
          _panX = _panStartPanX + (e.clientX - _panStartX);
          _panY = _panStartPanY + (e.clientY - _panStartY);
        }}
        @mouseup=${() => {
          _isPanning = false;
        }}
        @mouseleave=${() => {
          _isPanning = false;
        }}
        style="cursor:${_isPanning ? "grabbing" : "grab"}"
      >
        <div class="cd-oc-canvas" style="transform-origin:0 0;transform:translate(${_panX}px,${_panY}px) scale(${_zoom});transition:${_isPanning ? "none" : "transform 0.15s ease"}">
          <svg class="cd-oc-svg"
            viewBox="-20 -20 ${svgW} ${svgH}"
            preserveAspectRatio="xMidYMin meet"
            style="width:100%;height:auto;min-height:100%">

            <!-- Dot grid background -->
            <defs>
              <pattern id="cd-dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="var(--cd-oc-grid-dot, rgba(148,163,184,0.10))" />
              </pattern>
              <clipPath id="cd-oc-avatar-clip">
                <circle cx="28" cy="42" r="17" />
              </clipPath>
              <!-- Arrow marker -->
              <marker id="cd-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="var(--border)" opacity="0.5" />
              </marker>
              <marker id="cd-arrow-sel" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="var(--accent)" opacity="0.8" />
              </marker>
            </defs>
            <rect x="-20" y="-20" width="${svgW}" height="${svgH}" fill="url(#cd-dot-grid)" />

            <!-- Team group containers (teams view only) -->
            ${teamGroups.map(
              (tg) => svg`
              <g>
                <!-- Group fill -->
                <rect x="${tg.x}" y="${tg.y}" width="${tg.w}" height="${tg.h}" rx="14"
                  fill="${tg.color}07"
                  stroke="${tg.color}28"
                  stroke-width="1"
                />
                <!-- Header strip -->
                <rect x="${tg.x}" y="${tg.y}" width="${tg.w}" height="30" rx="10"
                  fill="${tg.color}18"
                />
                <!-- Team label -->
                <text
                  x="${tg.x + tg.w / 2}" y="${tg.y + 17}"
                  text-anchor="middle" dominant-baseline="central"
                  font-size="9.5" font-weight="700" fill="${tg.color}" font-family="monospace"
                  letter-spacing="1.5"
                >${tg.team.toUpperCase()}</text>
              </g>
            `,
            )}

            <!-- Edges -->
            <g class="cd-oc-edges">
              ${edges.map((e) => {
                const mid = (e.y1 + e.y2) / 2;
                const isHighlighted =
                  _selectedId &&
                  connectedIds.has(_selectedId) &&
                  (Math.abs(
                    e.x1 - (nodes.find((n) => n.id === _selectedId)?.x ?? -9999) - NODE_W / 2,
                  ) < 2 ||
                    Math.abs(
                      e.x2 - (nodes.find((n) => n.id === _selectedId)?.x ?? -9999) - NODE_W / 2,
                    ) < 2);
                return svg`
                  <path
                    class="cd-oc-edge"
                    d="M ${e.x1} ${e.y1} C ${e.x1} ${mid}, ${e.x2} ${mid}, ${e.x2} ${e.y2}"
                    fill="none"
                    stroke="${isHighlighted ? e.parentColor : "var(--border)"}"
                    stroke-width="${isHighlighted ? 2 : 1.5}"
                    opacity="${isHighlighted ? 0.85 : 0.45}"
                    marker-end="${isHighlighted ? "url(#cd-arrow-sel)" : "url(#cd-arrow)"}"
                  />
                `;
              })}
            </g>

            <!-- Nodes -->
            ${nodes.map((n) => renderNodeSvg(n, nodes))}
          </svg>
        </div>

        <!-- Zoom controls (bottom-left) -->
        <div class="cd-oc-zoom-controls">
          <button class="cd-oc-zoom-btn" title="Zoom in"
            @click=${() => {
              _zoom = Math.min(_zoom + 0.15, 2.5);
            }}>
            +
          </button>
          <button class="cd-oc-zoom-btn cd-oc-zoom-btn--fit" title="Fit / Reset zoom"
            @click=${() => {
              _zoom = 1.0;
              _panX = 0;
              _panY = 0;
            }}>
            ⊡
          </button>
          <button class="cd-oc-zoom-btn" title="Zoom out"
            @click=${() => {
              _zoom = Math.max(_zoom - 0.15, 0.3);
            }}>
            −
          </button>
        </div>

        <!-- Floating toolbar (bottom-center) -->
        <div class="cd-oc-float-toolbar">
          <span class="cd-oc-float-toolbar__count">
            ${nodes.length} agents · ${nodes.filter((n) => n.status === "active").length} active
          </span>
          <div class="cd-oc-float-toolbar__sep"></div>

          <button
            class="cd-oc-float-btn ${_deleteMode ? "cd-oc-float-btn--danger" : ""} ${_organizationRunning ? "cd-oc-float-btn--disabled" : ""}"
            ?disabled=${_organizationRunning}
            title=${_organizationRunning ? "Disabled while organization is running" : ""}
            @click=${() => {
              if (_organizationRunning) {
                return;
              }
              _deleteMode = !_deleteMode;
              _addTargetId = null;
            }}>
            ${_deleteMode ? "✅ Done" : "🗑️ Remove"}
          </button>
          <button
            class="cd-oc-float-btn cd-oc-float-btn--primary ${_organizationRunning ? "cd-oc-float-btn--disabled" : ""}"
            ?disabled=${_organizationRunning}
            title=${_organizationRunning ? "Disabled while organization is running" : ""}
            @click=${() => {
              if (_organizationRunning) {
                return;
              }
              _addTargetId = _selectedId ?? nodes[nodes.length - 1]?.id ?? null;
              _deleteMode = false;
            }}>
            + Add Role
          </button>

          <div class="cd-oc-float-toolbar__sep"></div>

          <!-- Layout toggle (Teams / Hierarchy) -->
          <div class="cd-oc-layout-toggle">
            <button
              class="cd-oc-layout-btn ${_layout === "teams" ? "cd-oc-layout-btn--active" : ""}"
              @click=${() => {
                _layout = "teams";
              }}>
              Teams
            </button>
            <button
              class="cd-oc-layout-btn ${_layout === "hierarchy" ? "cd-oc-layout-btn--active" : ""}"
              @click=${() => {
                _layout = "hierarchy";
              }}>
              Hierarchy
            </button>
          </div>

          <div class="cd-oc-float-toolbar__sep"></div>

          <div class="cd-oc-legend-inline">
            <span class="cd-oc-legend__dot cd-oc-legend__dot--active"></span>Active
            <span class="cd-oc-legend__dot cd-oc-legend__dot--idle"></span>Idle
            <span class="cd-oc-legend__dot cd-oc-legend__dot--crashed"></span>Crashed
          </div>
        </div>
      </div>

      <!-- Add role modal overlay -->
      ${
        _addTargetId
          ? html`
        <div class="cd-oc-modal-overlay" @click=${(e: Event) => {
          if ((e.target as HTMLElement).classList.contains("cd-oc-modal-overlay")) {
            _addTargetId = null;
          }
        }}>
          <div class="cd-oc-add-modal">
            <div class="cd-oc-add-modal__header">
              <span>Add role under: <strong>${nodes.find((n) => n.id === _addTargetId)?.name ?? "—"}</strong></span>
              <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
                _addTargetId = null;
              }}>
                ${icons.x}
              </button>
            </div>
            <div class="cd-oc-add-panel__quick">
              ${QUICK_ROLES.map(
                (preset) => html`
                <button class="cd-oc-quick-role" @click=${() => {
                  const parentId = _addTargetId;
                  if (parentId && _onCreateAgent) {
                    void _onCreateAgent({
                      name: preset.name,
                      role: preset.role,
                      team: preset.team,
                      emoji: preset.emoji,
                      reportTo: parentId,
                    });
                  }
                  _addTargetId = null;
                }}>
                  ${preset.emoji} ${preset.role}
                </button>
              `,
              )}
            </div>
            <div class="cd-oc-add-panel__custom">
              <input class="cd-form-input" placeholder="Emoji" style="width:52px"
                .value=${_newRoleEmoji}
                @input=${(e: Event) => {
                  _newRoleEmoji = (e.target as HTMLInputElement).value;
                }} />
              <input class="cd-form-input" placeholder="agent-name"
                .value=${_newRoleName}
                @input=${(e: Event) => {
                  _newRoleName = (e.target as HTMLInputElement).value;
                }} />
              <input class="cd-form-input" placeholder="Role title"
                .value=${_newRoleTitle}
                @input=${(e: Event) => {
                  _newRoleTitle = (e.target as HTMLInputElement).value;
                }} />
              <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
                if (!_newRoleName.trim()) {
                  return;
                }
                const parentId = _addTargetId;
                if (parentId && _onCreateAgent) {
                  void _onCreateAgent({
                    name: _newRoleName.trim(),
                    role: _newRoleTitle || _newRoleName.trim(),
                    emoji: _newRoleEmoji || "🤖",
                    reportTo: parentId,
                  });
                }
                _newRoleName = "";
                _newRoleTitle = "";
                _newRoleEmoji = "🤖";
                _addTargetId = null;
              }}>Add</button>
              <button class="cd-btn cd-btn--ghost cd-btn--sm" @click=${() => {
                _addTargetId = null;
              }}>Cancel</button>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Floating detail card (top-right) -->
      ${
        selected
          ? html`
        <div class="cd-oc-detail-float" style="--accent-c:${selected.color}">
          <div class="cd-oc-detail-float__header">
            <img class="cd-oc-detail__avatar" src="${getAvatarUrlForAgent(selected.id)}" alt="" width="36" height="36" />
            <div style="flex:1;min-width:0">
              <div class="cd-oc-detail__name">${selected.name}</div>
              <div class="cd-oc-detail__role" style="color:${selected.color}">${selected.role}</div>
            </div>
            <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
              _selectedId = null;
            }}>
              ${icons.x}
            </button>
          </div>
          <div class="cd-oc-detail__body">
            <div class="cd-oc-kv"><span>Team</span><span class="cd-oc-kv__val">${selected.team}</span></div>
            <div class="cd-oc-kv"><span>Model</span><span class="cd-oc-kv__val cd-mono">${selected.model}</span></div>
            <div class="cd-oc-kv"><span>Status</span>
              <span class="cd-badge ${selected.status === "active" ? "cd-badge--ok" : selected.status === "crashed" ? "cd-badge--danger" : "cd-badge--muted"}">${selected.status}</span>
            </div>
            ${
              (selected.toolCount ?? 0) > 0
                ? html`<div class="cd-oc-kv"><span>Tools</span><span class="cd-oc-kv__val">${selected.toolCount}</span></div>`
                : ""
            }
            ${
              (selected.cronCount ?? 0) > 0
                ? html`<div class="cd-oc-kv"><span>Crons</span><span class="cd-oc-kv__val">${selected.cronCount}</span></div>`
                : ""
            }
            <div class="cd-oc-kv"><span>Reports to</span>
              <span class="cd-oc-kv__val cd-mono">${(() => {
                const parent = nodes.find((n) =>
                  (n.children as LayoutNode[] | undefined)?.some((c) => c.id === selected.id),
                );
                return parent ? parent.name : "—";
              })()}</span>
            </div>
            ${
              (selected.children as LayoutNode[] | undefined)?.length
                ? html`
              <div class="cd-oc-kv"><span>Direct reports</span>
                <span class="cd-oc-kv__val">${(selected.children as LayoutNode[]).map((c) => c.name).join(", ")}</span>
              </div>
            `
                : ""
            }
            ${
              selected.description
                ? html`<div style="font-size:11px;color:var(--muted-foreground);line-height:1.5;margin-top:4px">${selected.description}</div>`
                : ""
            }
            <div class="cd-oc-detail__actions">
              ${
                _organizationRunning
                  ? html`
                      <p class="cd-oc-detail__running-hint">
                        Organization is running. Changes are disabled until all agents are idle.
                      </p>
                    `
                  : html`
              <button class="cd-btn cd-btn--primary cd-btn--sm" @click=${() => {
                _addTargetId = selected.id;
                _selectedId = null;
              }}>
                ${icons.plus} Add Report
              </button>
              ${
                selected.id !== ORG_TREE.id
                  ? html`
                <button class="cd-btn cd-btn--destructive cd-btn--sm" @click=${() => {
                  if (_onDeleteAgent) {
                    void _onDeleteAgent(selected.id);
                  }
                  _selectedId = null;
                }}>🗑️ Remove</button>
              `
                  : ""
              }
                    `
              }
            </div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}
