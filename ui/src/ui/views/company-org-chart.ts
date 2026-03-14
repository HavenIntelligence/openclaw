import { html, svg } from "lit";
import { icons } from "../icons.ts";

// ── Company org structure (demo data) ──────────────────────────────────────
type OrgNode = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string; // border accent color
  status: "active" | "idle" | "crashed";
  model: string;
  team: string;
  children?: OrgNode[];
  // computed layout
  x?: number;
  y?: number;
  width?: number;
};

const ORG_TREE: OrgNode = {
  id: "ceo",
  name: "founder-ai",
  role: "CEO / Founder",
  emoji: "👑",
  color: "#ff5c5c",
  status: "active",
  model: "claude-opus-4-5",
  team: "executive",
  children: [
    {
      id: "coo",
      name: "ops-prime",
      role: "COO",
      emoji: "🏢",
      color: "#60a5fa",
      status: "active",
      model: "claude-opus-4-5",
      team: "executive",
      children: [
        {
          id: "hr",
          name: "people-ai",
          role: "HR Manager",
          emoji: "🧑‍💼",
          color: "#a78bfa",
          status: "active",
          model: "claude-sonnet-4-5",
          team: "operations",
          children: [
            {
              id: "onboarding",
              name: "onboard-bot",
              role: "Onboarding",
              emoji: "🤝",
              color: "#c084fc",
              status: "idle",
              model: "claude-haiku-4-5",
              team: "operations",
            },
          ],
        },
        {
          id: "it",
          name: "infra-bot",
          role: "IT / DevOps",
          emoji: "⚙️",
          color: "#34d399",
          status: "active",
          model: "gpt-4o",
          team: "devops",
          children: [
            {
              id: "code-agent",
              name: "code-agent",
              role: "Engineer",
              emoji: "💻",
              color: "#22c55e",
              status: "active",
              model: "claude-opus-4-5",
              team: "devops",
            },
            {
              id: "test-runner",
              name: "test-runner",
              role: "QA",
              emoji: "🧪",
              color: "#4ade80",
              status: "active",
              model: "gpt-4o",
              team: "devops",
            },
          ],
        },
      ],
    },
    {
      id: "cmo",
      name: "content-director",
      role: "CMO / Content",
      emoji: "📣",
      color: "#fb923c",
      status: "active",
      model: "claude-sonnet-4-5",
      team: "content",
      children: [
        {
          id: "research-alpha",
          name: "research-alpha",
          role: "Researcher",
          emoji: "🔍",
          color: "#f97316",
          status: "active",
          model: "claude-opus-4-5",
          team: "content",
        },
        {
          id: "writing-beta",
          name: "writing-beta",
          role: "Writer",
          emoji: "✍️",
          color: "#fbbf24",
          status: "active",
          model: "claude-sonnet-4-5",
          team: "content",
        },
        {
          id: "review-gamma",
          name: "review-gamma",
          role: "Reviewer",
          emoji: "📝",
          color: "#ef4444",
          status: "crashed",
          model: "claude-haiku-4-5",
          team: "content",
        },
      ],
    },
    {
      id: "pa",
      name: "nanoclaw-primary",
      role: "Personal Assistant",
      emoji: "🤖",
      color: "#14b8a6",
      status: "idle",
      model: "claude-sonnet-4-5",
      team: "executive",
    },
  ],
};

// ── Layout engine ──────────────────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 80;
const H_GAP = 32;
const V_GAP = 64;

type LayoutNode = OrgNode & { x: number; y: number; subtreeW: number };

function layoutTree(node: OrgNode, depth = 0): LayoutNode {
  const children = node.children?.map((c) => layoutTree(c, depth + 1)) ?? [];
  const subtreeW =
    children.length === 0
      ? NODE_W
      : children.reduce((s, c) => s + c.subtreeW, 0) + (children.length - 1) * H_GAP;
  // x will be set in a second pass; y = depth * (NODE_H + V_GAP)
  return { ...node, x: 0, y: depth * (NODE_H + V_GAP), subtreeW, children } as LayoutNode;
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
  // center this node over its children
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

function collectEdges(
  node: LayoutNode,
  out: { x1: number; y1: number; x2: number; y2: number }[] = [],
) {
  for (const child of (node.children ?? []) as LayoutNode[]) {
    out.push({
      x1: node.x + NODE_W / 2,
      y1: node.y + NODE_H,
      x2: child.x + NODE_W / 2,
      y2: child.y,
    });
    collectEdges(child, out);
  }
  return out;
}

function buildLayout() {
  const root = layoutTree(ORG_TREE);
  placeTree(root, 0);
  return root;
}

// ── Status helpers ─────────────────────────────────────────────────────────
function statusColor(status: string) {
  if (status === "active") {
    return "var(--ok)";
  }
  if (status === "crashed") {
    return "var(--destructive)";
  }
  return "#f59e0b";
}

// ── Render ─────────────────────────────────────────────────────────────────
let _selectedId: string | null = null;

export type CompanyOrgChartProps = Record<string, never>;

export function renderCompanyOrgChart(_props: CompanyOrgChartProps) {
  const root = buildLayout();
  const nodes = collectNodes(root);
  const edges = collectEdges(root);

  // SVG canvas size
  const allX = nodes.map((n) => n.x);
  const allY = nodes.map((n) => n.y);
  const svgW = Math.max(...allX) + NODE_W + 40;
  const svgH = Math.max(...allY) + NODE_H + 40;

  const selected = nodes.find((n) => n.id === _selectedId) ?? null;

  return html`
    <div class="cd-page cd-page--orgchart">
      <div class="cd-oc-layout">
        <!-- SVG topology graph -->
        <div class="cd-oc-canvas-wrap">
          <div class="cd-oc-canvas">
            <svg
              class="cd-oc-svg"
              viewBox="-20 -20 ${svgW} ${svgH}"
              width="${svgW}"
              height="${svgH}"
            >
              <!-- Edge lines -->
              <g class="cd-oc-edges">
                ${edges.map(
                  (e) => svg`
                  <path
                    class="cd-oc-edge"
                    d="M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}"
                    fill="none"
                  />
                `,
                )}
              </g>

              <!-- Node cards -->
              ${nodes.map((n) => {
                const isSelected = n.id === _selectedId;
                const statusC = statusColor(n.status);
                return svg`
                  <g
                    class="cd-oc-node ${isSelected ? "cd-oc-node--selected" : ""} ${n.status === "crashed" ? "cd-oc-node--crashed" : ""}"
                    transform="translate(${n.x}, ${n.y})"
                    @click=${() => {
                      _selectedId = isSelected ? null : n.id;
                    }}
                    style="cursor:pointer"
                  >
                    <!-- Card bg -->
                    <rect
                      x="0" y="0"
                      width="${NODE_W}" height="${NODE_H}"
                      rx="10"
                      fill="var(--card)"
                      stroke="${isSelected ? n.color : "var(--border)"}"
                      stroke-width="${isSelected ? 2.5 : 1}"
                    />
                    <!-- Left accent bar -->
                    <rect x="0" y="0" width="4" height="${NODE_H}" rx="2" fill="${n.color}" />
                    <!-- Status dot -->
                    <circle cx="${NODE_W - 14}" cy="14" r="5" fill="${statusC}" />
                    ${
                      n.status === "active"
                        ? svg`
                      <circle cx="${NODE_W - 14}" cy="14" r="5" fill="${statusC}" opacity="0.4">
                        <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
                      </circle>
                    `
                        : ""
                    }
                    <!-- Emoji -->
                    <text x="20" y="32" font-size="20" dominant-baseline="middle">${n.emoji}</text>
                    <!-- Name -->
                    <text x="48" y="26" fill="var(--text-strong)" font-size="11.5" font-weight="700" font-family="monospace">${n.name}</text>
                    <!-- Role -->
                    <text x="48" y="42" fill="var(--muted-foreground)" font-size="10">${n.role}</text>
                    <!-- Model chip -->
                    <rect x="8" y="${NODE_H - 22}" width="${NODE_W - 16}" height="16" rx="4" fill="var(--bg-muted)" />
                    <text x="${NODE_W / 2}" y="${NODE_H - 11}" fill="var(--accent-2-muted)" font-size="9.5" text-anchor="middle" font-family="monospace">${n.model}</text>
                  </g>
                `;
              })}
            </svg>
          </div>
        </div>

        <!-- Detail panel -->
        <div class="cd-oc-detail ${selected ? "cd-oc-detail--visible" : ""}">
          ${
            selected
              ? html`
                <div class="cd-oc-detail__header" style="border-color: ${selected.color}">
                  <span class="cd-oc-detail__emoji">${selected.emoji}</span>
                  <div>
                    <div class="cd-oc-detail__name">${selected.name}</div>
                    <div class="cd-oc-detail__role">${selected.role}</div>
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
                </div>
              `
              : html`
                <div class="cd-oc-detail__placeholder">
                  ${icons.network}
                  <p>Click any node to inspect the agent</p>
                </div>
              `
          }
        </div>
      </div>

      <!-- Legend -->
      <div class="cd-oc-legend">
        <div class="cd-oc-legend__item"><span class="cd-oc-legend__dot cd-oc-legend__dot--active"></span>Active</div>
        <div class="cd-oc-legend__item"><span class="cd-oc-legend__dot cd-oc-legend__dot--idle"></span>Idle</div>
        <div class="cd-oc-legend__item"><span class="cd-oc-legend__dot cd-oc-legend__dot--crashed"></span>Crashed</div>
        <div class="cd-oc-legend__sep"></div>
        <div class="cd-oc-legend__item">${icons.info ?? ""} Click node to inspect · Curved lines = reporting relationship</div>
      </div>
    </div>
  `;
}
