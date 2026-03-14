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
  name: "ai-director",
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
let _addTargetId: string | null = null; // which node to add a child to
let _deleteMode = false;
let _newRoleName = "";
let _newRoleEmoji = "🤖";
let _newRoleTitle = "";

// Quick-add role presets (sampled from Role Hub)
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
  },
];

let _idCounter = 200;

function deleteNode(tree: OrgNode, id: string): boolean {
  if (!tree.children) {
    return false;
  }
  const idx = tree.children.findIndex((c) => c.id === id);
  if (idx >= 0) {
    tree.children.splice(idx, 1);
    return true;
  }
  for (const child of tree.children) {
    if (deleteNode(child, id)) {
      return true;
    }
  }
  return false;
}

function addChildTo(tree: OrgNode, parentId: string, newNode: OrgNode): boolean {
  if (tree.id === parentId) {
    if (!tree.children) {
      tree.children = [];
    }
    tree.children.push(newNode);
    return true;
  }
  for (const child of tree.children ?? []) {
    if (addChildTo(child, parentId, newNode)) {
      return true;
    }
  }
  return false;
}

export type CompanyOrgChartProps = Record<string, never>;

export function renderCompanyOrgChart(_props: CompanyOrgChartProps) {
  const root = buildLayout();
  const nodes = collectNodes(root);
  const edges = collectEdges(root);

  const allX = nodes.map((n) => n.x);
  const allY = nodes.map((n) => n.y);
  const svgW = Math.max(...allX) + NODE_W + 40;
  const svgH = Math.max(...allY) + NODE_H + 40;

  const selected = nodes.find((n) => n.id === _selectedId) ?? null;

  return html`
    <div class="cd-page cd-page--orgchart cd-oc-fullwidth">

      <!-- Full-width SVG topology graph -->
      <div class="cd-oc-canvas-wrap cd-oc-canvas-wrap--full">
        <div class="cd-oc-canvas">
          <svg class="cd-oc-svg" viewBox="-20 -20 ${svgW} ${svgH}" preserveAspectRatio="xMidYMin meet" style="width:100%;height:auto;min-height:100%">
            <!-- Edge lines -->
            <g class="cd-oc-edges">
              ${edges.map(
                (e) => svg`
                <path class="cd-oc-edge"
                  d="M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}"
                  fill="none"
                />
              `,
              )}
            </g>

            <!-- Node cards -->
            ${nodes.map((n) => {
              const isSelected = n.id === _selectedId;
              const isAddTarget = n.id === _addTargetId;
              const statusC = statusColor(n.status);
              return svg`
                <g
                  class="cd-oc-node ${isSelected ? "cd-oc-node--selected" : ""} ${n.status === "crashed" ? "cd-oc-node--crashed" : ""} ${_deleteMode && n.id !== ORG_TREE.id ? "cd-oc-node--deletable" : ""}"
                  transform="translate(${n.x}, ${n.y})"
                  @click=${() => {
                    if (_deleteMode && n.id !== ORG_TREE.id) {
                      deleteNode(ORG_TREE, n.id);
                      if (_selectedId === n.id) {
                        _selectedId = null;
                      }
                    } else {
                      _selectedId = isSelected ? null : n.id;
                      _addTargetId = null;
                    }
                  }}
                  style="cursor:${_deleteMode && n.id !== ORG_TREE.id ? "not-allowed" : "pointer"}"
                >
                  <!-- Card bg -->
                  <rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" rx="10"
                    fill="var(--card)"
                    stroke="${isAddTarget ? "#22c55e" : isSelected ? n.color : _deleteMode && n.id !== ORG_TREE.id ? "#ef4444" : "var(--border)"}"
                    stroke-width="${isSelected || isAddTarget || (_deleteMode && n.id !== ORG_TREE.id) ? 2.5 : 1}"
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
                  <!-- Delete X overlay in delete mode -->
                  ${
                    _deleteMode && n.id !== ORG_TREE.id
                      ? svg`
                    <rect x="${NODE_W - 26}" y="4" width="20" height="20" rx="4" fill="rgba(239,68,68,0.15)" />
                    <text x="${NODE_W - 16}" y="17" fill="#ef4444" font-size="14" text-anchor="middle" dominant-baseline="middle">×</text>
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

        <!-- Floating toolbar (bottom-center) -->
        <div class="cd-oc-float-toolbar">
          <span class="cd-oc-float-toolbar__count">${nodes.length} roles · ${nodes.filter((n) => n.status === "active").length} active</span>
          <div class="cd-oc-float-toolbar__sep"></div>
          <button class="cd-oc-float-btn ${_deleteMode ? "cd-oc-float-btn--danger" : ""}"
            @click=${() => {
              _deleteMode = !_deleteMode;
              _addTargetId = null;
            }}>
            ${_deleteMode ? "✅ Done" : "🗑️ Remove"}
          </button>
          <button class="cd-oc-float-btn cd-oc-float-btn--primary"
            @click=${() => {
              _addTargetId = _selectedId ?? nodes[nodes.length - 1]?.id ?? null;
              _deleteMode = false;
            }}>
            + Add Role
          </button>
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
              }}>${icons.x}</button>
            </div>
            <div class="cd-oc-add-panel__quick">
              ${QUICK_ROLES.map(
                (preset) => html`
                <button class="cd-oc-quick-role" @click=${() => {
                  const newNode: OrgNode = { ...preset, id: `node-${_idCounter++}`, children: [] };
                  addChildTo(ORG_TREE, _addTargetId!, newNode);
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
                const newNode: OrgNode = {
                  id: `node-${_idCounter++}`,
                  name: _newRoleName.trim(),
                  role: _newRoleTitle || _newRoleName.trim(),
                  emoji: _newRoleEmoji || "🤖",
                  color: "#60a5fa",
                  status: "idle",
                  model: "claude-sonnet-4-5",
                  team: "general",
                  children: [],
                };
                addChildTo(ORG_TREE, _addTargetId!, newNode);
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

      <!-- Floating detail card (appears on node click) -->
      ${
        selected
          ? html`
        <div class="cd-oc-detail-float" style="--accent-c:${selected.color}">
          <div class="cd-oc-detail-float__header">
            <span class="cd-oc-detail__emoji">${selected.emoji}</span>
            <div style="flex:1;min-width:0">
              <div class="cd-oc-detail__name">${selected.name}</div>
              <div class="cd-oc-detail__role">${selected.role}</div>
            </div>
            <button class="cd-btn cd-btn--ghost cd-btn--xs" @click=${() => {
              _selectedId = null;
            }}>${icons.x}</button>
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
            <div class="cd-oc-detail__actions">
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
                  deleteNode(ORG_TREE, selected.id);
                  _selectedId = null;
                }}>🗑️ Remove</button>
              `
                  : ""
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
