// FastPath - Helpers to control the dedicated floating-panel window.

import { useMaskStore } from "@/hooks/useMaskStore";

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getPanelWindow() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("panel");
}

/**
 * Size and position the panel to hug the top-to-bottom edge of the screen —
 * full height, capped at a third of the screen's width — on whichever side
 * `settings.panelSide` says. Runs on every show so a side changed in
 * Settings takes effect the next time the panel opens.
 */
async function dockPanel(panel: NonNullable<Awaited<ReturnType<typeof getPanelWindow>>>) {
  try {
    const { primaryMonitor } = await import("@tauri-apps/api/window");
    const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
    const monitor = await primaryMonitor();
    if (!monitor) return;
    const { position, size } = monitor.workArea;
    const width = Math.round(size.width / 3);
    const side = useMaskStore.getState().settings.panelSide;
    const x = side === "left" ? position.x : position.x + size.width - width;
    await panel.setSize(new PhysicalSize(width, size.height));
    await panel.setPosition(new PhysicalPosition(x, position.y));
  } catch (e) {
    console.error("panel dock failed:", e);
  }
}

/**
 * A transparent WebView2 window (see `transparent: true` for "panel" in
 * tauri.conf.json) sometimes stops compositing its content after a
 * hide/show cycle — delivering a mask hides the panel, and reopening it can
 * leave it fully see-through, just the window outline. A 1px resize nudge is
 * the standard workaround: it forces WebView2 to repaint, and reverting the
 * size right after makes it invisible to the user.
 */
async function nudgeRepaint(panel: NonNullable<Awaited<ReturnType<typeof getPanelWindow>>>) {
  try {
    const { PhysicalSize } = await import("@tauri-apps/api/dpi");
    const size = await panel.outerSize();
    await panel.setSize(new PhysicalSize(size.width + 1, size.height));
    await panel.setSize(new PhysicalSize(size.width, size.height));
  } catch (e) {
    console.error("panel repaint nudge failed:", e);
  }
}

/** Show + focus the panel window. */
export async function openPanel(): Promise<void> {
  if (!IS_TAURI) {
    // Browser dev: preview the panel in a popup.
    window.open("/?panel=1", "fastpath-panel", "width=404,height=800");
    return;
  }
  const panel = await getPanelWindow();
  if (!panel) {
    console.error("panel window not found");
    return;
  }
  await dockPanel(panel);
  await panel.show();
  await panel.setFocus();
  await nudgeRepaint(panel);
}

/** Show the panel if hidden, hide it if visible. */
export async function togglePanel(): Promise<void> {
  if (!IS_TAURI) {
    await openPanel();
    return;
  }
  const panel = await getPanelWindow();
  if (!panel) {
    console.error("panel window not found");
    return;
  }
  if (await panel.isVisible()) {
    await panel.hide();
  } else {
    await dockPanel(panel);
    await panel.show();
    await panel.setFocus();
    await nudgeRepaint(panel);
  }
}

/** Apply "always on top" to the panel window. */
export async function setPanelAlwaysOnTop(value: boolean): Promise<void> {
  if (!IS_TAURI) return;
  const panel = await getPanelWindow();
  await panel?.setAlwaysOnTop(value);
}
