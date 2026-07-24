// FastPath - OS-level integration: always-on-top window, global hotkeys,
// autostart. Every effect no-ops gracefully outside the Tauri runtime.

import { useEffect } from "react";
import { useMaskStore } from "./useMaskStore";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useOsIntegration(onOpenPanel: () => void) {
  const alwaysOnTop = useMaskStore((s) => s.settings.alwaysOnTop);
  const startWithOS = useMaskStore((s) => s.settings.startWithOS);
  const hotkeyOpenMenu = useMaskStore((s) => s.settings.hotkeyOpenMenu);

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
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
          onOpenPanel();
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          await win.show();
          await win.setFocus();
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
  }, [hotkeyOpenMenu, onOpenPanel]);
}
