// FastPath - OS-level integration: panel window toggle via global hotkey,
// always-on-top, autostart. Every effect no-ops gracefully outside the Tauri
// runtime. This hook runs in the MAIN window only.

import { useEffect } from "react";
import { useMaskStore } from "./useMaskStore";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getPanelWindow() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("panel");
}

/** Show the panel if hidden, hide it if visible. */
async function togglePanel() {
  const panel = await getPanelWindow();
  if (!panel) return;
  if (await panel.isVisible()) {
    await panel.hide();
  } else {
    await panel.show();
    await panel.setFocus();
  }
}

export function useOsIntegration() {
  const alwaysOnTop = useMaskStore((s) => s.settings.alwaysOnTop);
  const startWithOS = useMaskStore((s) => s.settings.startWithOS);
  const hotkeyOpenMenu = useMaskStore((s) => s.settings.hotkeyOpenMenu);

  // "Sempre visível" applies to the floating panel window, not the main app.
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const panel = await getPanelWindow();
        await panel?.setAlwaysOnTop(alwaysOnTop);
      } catch (e) {
        console.error("setAlwaysOnTop failed:", e);
      }
    })();
  }, [alwaysOnTop]);

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
        const current = await isEnabled();
        if (startWithOS && !current) await enable();
        else if (!startWithOS && current) await disable();
      } catch (e) {
        console.error("autostart toggle failed:", e);
      }
    })();
  }, [startWithOS]);

  useEffect(() => {
    if (!isTauri() || !hotkeyOpenMenu.trim()) return;
    let registered = false;
    const shortcut = hotkeyOpenMenu;

    (async () => {
      try {
        const { register } = await import("@tauri-apps/plugin-global-shortcut");
        await register(shortcut, async (event) => {
          if (event.state !== "Pressed") return;
          try {
            await togglePanel();
          } catch (e) {
            console.error("toggle panel failed:", e);
          }
        });
        registered = true;
      } catch (e) {
        console.error(`register hotkey "${shortcut}" failed:`, e);
      }
    })();

    return () => {
      if (!registered) return;
      import("@tauri-apps/plugin-global-shortcut")
        .then(({ unregister }) => unregister(shortcut))
        .catch(() => {});
    };
  }, [hotkeyOpenMenu]);
}
