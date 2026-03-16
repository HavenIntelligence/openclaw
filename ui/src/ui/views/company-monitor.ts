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
let _pendingMissionId: string | null = null;
let _missionNavCounter = 0;

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

    // Read pending mission from window global into module var (survives multiple mountReact calls)
    const win = window as unknown as Record<string, unknown>;
    if (typeof win.__openclawPendingMissionId === "string") {
      _pendingMissionId = win.__openclawPendingMissionId;
      _missionNavCounter++;
      delete win.__openclawPendingMissionId;
    }
    const pendingMissionId = _pendingMissionId;
    // Consume after React mounts (deferred so concurrent mountReact calls still see it)
    if (pendingMissionId) {
      requestAnimationFrame(() => {
        _pendingMissionId = null;
      });
    }

    const key = pendingMissionId ? `m-${_missionNavCounter}` : undefined;
    const props = { isDark: true, client, key, pendingMissionId };

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
  } catch {
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
    }
  };
  requestAnimationFrame(poll);
}

export function renderCompanyMonitor(props: CompanyMonitorProps) {
  const client = props.client ?? null;
  setMonitorClient(client);
  (window as unknown as Record<string, unknown>).__openclawMonitorClient = client;

  // If mount element was removed from DOM (tab switch), reset
  if (_mountEl && !_mountEl.isConnected) {
    _reactRoot = null;
    _mountEl = null;
  }

  // If pending mission and React already mounted, trigger remount via mountReact
  const win = window as unknown as Record<string, unknown>;
  const hasPending = typeof win.__openclawPendingMissionId === "string";

  if (_reactRoot && _mountEl) {
    if (client !== _lastClient || hasPending) {
      _lastClient = client;
      void mountReact(_mountEl, client);
    }
  } else {
    _mountScheduled = false;
    scheduleMountOnce(client);
  }

  return html`
    <style>
      .content:has(#monitor-react-root) {
        padding: 0 !important;
        overflow: hidden !important;
        position: relative !important;
      }
      .content:has(#monitor-react-root) > .content-header {
        display: none !important;
      }
    </style>
    <div style="display: contents" id="monitor-react-root"></div>
  `;
}
