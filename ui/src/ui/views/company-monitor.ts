import { html } from "lit";
import { setMonitorClient } from "./monitor/monitorApi";

type GatewayClient = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

export type CompanyMonitorProps = {
  requestUpdate?: () => void;
  client?: GatewayClient | null;
};

let _reactRoot: { render: (el: unknown) => void; unmount: () => void } | null = null;
let _mountEl: Element | null = null;
let _mountScheduled = false;
let _lastClient: GatewayClient | null = null;

async function mountReact(container: Element, client: GatewayClient | null) {
  try {
    const [reactDomClient, monitorModule, reactModule] = await Promise.all([
      import("react-dom/client"),
      import("./monitor/MonitorApp.tsx"),
      import("react"),
    ]);

    const { createRoot } = reactDomClient;
    const { MonitorApp } = monitorModule;
    const React = reactModule.default || reactModule;

    const props = { isDark: true, client };

    if (_reactRoot && _mountEl === container) {
      _reactRoot.render(React.createElement(MonitorApp, props));
      return;
    }

    if (_reactRoot) {
      try {
        _reactRoot.unmount();
      } catch {
        /* ignore */
      }
      _reactRoot = null;
    }

    _mountEl = container;
    _reactRoot = createRoot(container);
    _reactRoot.render(React.createElement(MonitorApp, props));
  } catch (err) {
    console.error("[company-monitor] Failed to mount React app:", err);
    container.innerHTML =
      '<div style="padding:24px;color:#f43f5e;">Failed to load Monitor view. Check console for details.</div>';
  }
}

function scheduleMountOnce(client: GatewayClient | null) {
  _lastClient = client;
  if (_mountScheduled) {
    return;
  }
  _mountScheduled = true;

  const tryMount = () => {
    const el = document.querySelector("#monitor-react-root");
    if (el) {
      _mountScheduled = false;
      void mountReact(el, _lastClient);
      return true;
    }
    return false;
  };

  if (tryMount()) {
    return;
  }

  let attempts = 0;
  const poll = () => {
    if (tryMount()) {
      return;
    }
    attempts++;
    if (attempts < 20) {
      requestAnimationFrame(poll);
    } else {
      _mountScheduled = false;
      console.warn("[company-monitor] Could not find #monitor-react-root");
    }
  };
  requestAnimationFrame(poll);
}

export function renderCompanyMonitor(props: CompanyMonitorProps) {
  const client = props.client ?? null;
  // Always update the global client ref so React can access it
  setMonitorClient(client);
  // Also expose on window for cross-framework access
  (window as unknown as Record<string, unknown>).__openclawMonitorClient = client;
  // If already mounted and client changed, re-render with new client
  if (_reactRoot && _mountEl && client !== _lastClient) {
    _lastClient = client;
    void mountReact(_mountEl, client);
  } else {
    scheduleMountOnce(client);
  }

  return html`
    <style>
      .content:has(#monitor-react-root) {
        padding: 0 !important;
        padding-top: 6px !important;
        overflow: hidden !important;
      }
      .content:has(#monitor-react-root) > .content-header {
        display: none !important;
      }
      .content:has(#monitor-react-root) > #monitor-react-root {
        margin-top: 0 !important;
      }
    </style>
    <div
      style="
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        background: var(--bg, #0e1015);
      "
      id="monitor-react-root"
    ></div>
  `;
}
