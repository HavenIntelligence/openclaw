import { html, nothing } from "lit";
import type { ClawDockAgent, LogEntry } from "../company-types.ts";
import { icons } from "../icons.ts";

const LOG_TYPE_STYLES: Record<LogEntry["type"], { badge: string; border: string; icon: string }> = {
  tool_call: { badge: "rgba(167, 139, 250, 0.18)", border: "#a78bfa", icon: "⚙️" },
  output: { badge: "rgba(34, 197, 94, 0.14)", border: "var(--ok)", icon: "✅" },
  thinking: { badge: "rgba(96, 165, 250, 0.14)", border: "#60a5fa", icon: "🧠" },
  human: { badge: "rgba(245, 158, 11, 0.16)", border: "#f59e0b", icon: "👤" },
  error: { badge: "rgba(239, 68, 68, 0.16)", border: "var(--destructive)", icon: "⛔" },
  system: { badge: "rgba(148, 163, 184, 0.16)", border: "var(--border)", icon: "🛰️" },
  message_out: { badge: "rgba(34, 197, 94, 0.14)", border: "var(--ok)", icon: "📤" },
  message_in: { badge: "rgba(96, 165, 250, 0.14)", border: "#60a5fa", icon: "📥" },
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type CompanyAgentLogsPanelProps = {
  agent?: ClawDockAgent | null;
  logs?: LogEntry[];
  loading?: boolean;
  onClose: () => void;
  onRefresh?: () => void | Promise<void>;
};

export function renderCompanyAgentLogsPanel(props: CompanyAgentLogsPanelProps) {
  const agent = props.agent ?? null;
  if (!agent) {
    return nothing;
  }

  const entries = [...(props.logs ?? [])].toSorted((a, b) => a.ts - b.ts);

  return html`
    <div
      class="cd-create-agent-overlay"
      @click=${(e: Event) => {
        if ((e.target as HTMLElement).classList.contains("cd-create-agent-overlay")) {
          props.onClose();
        }
      }}
    >
      <div
        class="cd-create-agent-panel"
        style="max-width: 920px; width: min(920px, calc(100vw - 32px));"
      >
        <div class="cd-create-agent-panel__header">
          <div>
            <h3>${agent.emoji} ${agent.name} Logs</h3>
            <div class="cd-muted" style="margin-top: 4px;">
              <span class="cd-mono">${agent.id}</span> · ${agent.role} · ${agent.runtime}
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button
              class="cd-btn cd-btn--xs cd-btn--ghost"
              ?disabled=${Boolean(props.loading)}
              @click=${() => {
                void props.onRefresh?.();
              }}
            >
              ${props.loading ? "Refreshing..." : icons.rotateCounterClockwise}
            </button>
            <button class="cd-btn cd-btn--xs cd-btn--ghost" @click=${props.onClose}>
              ${icons.x}
            </button>
          </div>
        </div>

        <div class="cd-create-agent-panel__body">
          ${
            entries.length === 0 && !props.loading
              ? html`
                  <div class="cd-office-empty" style="padding: 48px 24px; text-align: center">
                    No logs yet for this agent.
                  </div>
                `
              : html`
                <div style="display:flex; flex-direction:column; gap:10px; max-height:60vh; overflow:auto;">
                  ${entries.map((entry) => {
                    const style = LOG_TYPE_STYLES[entry.type];
                    return html`
                      <div
                        style="
                          border: 1px solid var(--border);
                          border-left: 3px solid ${style.border};
                          border-radius: 14px;
                          background: var(--panel);
                          padding: 12px 14px;
                          display:flex;
                          flex-direction:column;
                          gap:8px;
                        "
                      >
                        <div
                          style="
                            display:flex;
                            gap:10px;
                            align-items:center;
                            justify-content:space-between;
                            flex-wrap:wrap;
                          "
                        >
                          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <span
                              style="
                                display:inline-flex;
                                align-items:center;
                                gap:6px;
                                padding:4px 8px;
                                border-radius:999px;
                                background:${style.badge};
                                color:${style.border};
                                font-size:12px;
                                font-weight:600;
                              "
                            >
                              <span>${style.icon}</span>
                              <span>${entry.type}</span>
                            </span>
                            <span class="cd-muted">run <span class="cd-mono">${entry.runId}</span></span>
                          </div>
                          <div class="cd-muted">${formatTimestamp(entry.ts)}</div>
                        </div>
                        <div
                          style="
                            white-space:pre-wrap;
                            word-break:break-word;
                            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                            font-size: 12px;
                            line-height: 1.5;
                          "
                        >
                          ${entry.content}
                        </div>
                      </div>
                    `;
                  })}
                </div>
              `
          }
        </div>
      </div>
    </div>
  `;
}
