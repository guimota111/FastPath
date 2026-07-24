// FastPath - OS-level integration: panel window toggle via global hotkey,
// always-on-top, autostart. Every effect no-ops gracefully outside the Tauri
// runtime. This hook runs in the MAIN window only.

import { useEffect } from "react";
import { useMaskStore } from "./useMaskStore";
import { IS_TAURI, setPanelAlwaysOnTop, togglePanel } from "@/lib/panelWindow";

// Register/unregister calls are async; StrictMode remounts and hotkey changes
// interleave them nondeterministically. Serializing through a queue guarantees
// the LAST enqueued operation decides the final state.
let hotkeyQueue: Promise<unknown> = Promise.resolve();
function enqueueHotkeyOp(op: () => Promise<unknown>) {
  hotkeyQueue = hotkeyQueue.then(op, op);
}

export function useOsIntegration() {
  const alwaysOnTop = useMaskStore((s) => s.settings.alwaysOnTop);
  const startWithOS = useMaskStore((s) => s.settings.startWithOS);
  const hotkeyOpenMenu = useMaskStore((s) => s.settings.hotkeyOpenMenu);

  // "Sempre visível" applies to the floating panel window, not the main app.
  useEffect(() => {
    if (!IS_TAURI) return;
    setPanelAlwaysOnTop(alwaysOnTop).catch((e) =>
      console.error("setAlwaysOnTop failed:", e),
    );
  }, [alwaysOnTop]);

  useEffect(() => {
    if (!IS_TAURI) return;
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
    if (!IS_TAURI || !hotkeyOpenMenu.trim()) return;
    const shortcut = hotkeyOpenMenu;

    enqueueHotkeyOp(async () => {
      try {
        const { register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
        // Clear any stale registration (StrictMode remount, hot reload) so
        // register() below never fails with "already registered".
        await unregister(shortcut).catch(() => {});
        await register(shortcut, (event) => {
          if (event.state !== "Pressed") return;
          togglePanel().catch((e) => console.error("toggle panel failed:", e));
        });
      } catch (e) {
        console.error(`register hotkey "${shortcut}" failed:`, e);
      }
    });

    return () => {
      enqueueHotkeyOp(async () => {
        const { unregister } = await import("@tauri-apps/plugin-global-shortcut");
        await unregister(shortcut).catch(() => {});
      });
    };
  }, [hotkeyOpenMenu]);
}
