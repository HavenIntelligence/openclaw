import { html } from "lit";

export type CompanyMonitorProps = {
  requestUpdate?: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _reactRoot: { render: (el: unknown) => void; unmount: () => void } | null = null;
let _mountEl: Element | null = null;
let _mountScheduled = false;

async function mountReact(container: Element) {
  try {
    const [reactDomClient, monitorModule, reactModule] = await Promise.all([
      import("react-dom/client"),
      import("./monitor/MonitorApp.tsx"),
      import("react"),
    ]);

    const { createRoot } = reactDomClient;
    const { MonitorApp } = monitorModule;
    const React = reactModule.default || reactModule;

    if (_reactRoot && _mountEl === container) {
      _reactRoot.render(React.createElement(MonitorApp, { isDark: true }));
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
    _reactRoot.render(React.createElement(MonitorApp, { isDark: true }));
  } catch (err) {
    console.error("[company-monitor] Failed to mount React app:", err);
    container.innerHTML =
      '<div style="padding:24px;color:#f43f5e;">Failed to load Monitor view. Check console for details.</div>';
  }
}

function scheduleMountOnce() {
  if (_mountScheduled) {
    return;
  }
  _mountScheduled = true;

  const tryMount = () => {
    const el = document.querySelector("#monitor-react-root");
    if (el) {
      _mountScheduled = false;
      void mountReact(el);
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

export function renderCompanyMonitor(_props: CompanyMonitorProps) {
  scheduleMountOnce();

  return html`
    <style>
      .content:has(#monitor-react-root) {
        padding: 0 !important;
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
