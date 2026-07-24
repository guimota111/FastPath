// FastPath - Helpers to control the dedicated floating-panel window.

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getPanelWindow() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("panel");
}

/** Show + focus the panel window. */
export async function openPanel(): Promise<void> {
  if (!IS_TAURI) {
    // Browser dev: preview the panel in a popup.
    window.open("/?panel=1", "fastpath-panel", "width=404,height=660");
    return;
  }
  const panel = await getPanelWindow();
  if (!panel) {
    console.error("panel window not found");
    return;
  }
  await panel.show();
  await panel.setFocus();
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
    await panel.show();
    await panel.setFocus();
  }
}

/** Apply "always on top" to the panel window. */
export async function setPanelAlwaysOnTop(value: boolean): Promise<void> {
  if (!IS_TAURI) return;
  const panel = await getPanelWindow();
  await panel?.setAlwaysOnTop(value);
}
