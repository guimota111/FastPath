// FastPath - Thin wrappers around Tauri backend commands.
// In a browser (vitest / vite preview without Tauri) these degrade gracefully.

import type { ExecutionMethod, TextRun, UserSettings } from "./types";
import { hasFormatting, planTyping, runsToHtml } from "./richText";
import { runsToPlainText } from "./maskExecutor";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<InvokeFn | null> {
  // Only available inside the Tauri runtime.
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as InvokeFn;
}

export async function writeClipboard(text: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("write_clipboard", { text });
  } else if (navigator?.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

/** Put formatted text on the clipboard, with `plain` as the fallback flavour. */
export async function writeClipboardHtml(html: string, plain: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("write_clipboard_html", { html, plain });
    return;
  }
  if (typeof ClipboardItem !== "undefined" && navigator?.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  await writeClipboard(plain);
}

export async function readClipboard(): Promise<string> {
  const invoke = await getInvoke();
  if (invoke) return invoke<string>("read_clipboard");
  if (navigator?.clipboard) return navigator.clipboard.readText();
  return "";
}

export async function insertKeyByKey(text: string, delayMs: number): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("insert_text_keybykey", { text, delayMs });
    return;
  }
  // Fallback when not running under Tauri.
  await writeClipboard(text);
}

/** Press a key combination in the focused app, e.g. its bold toggle. */
export async function sendHotkey(accelerator: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) await invoke("send_hotkey", { accelerator });
}

export async function simulatePaste(): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) await invoke("simulate_paste");
}

/**
 * Type runs into the focused field, pressing the target editor's bold/italic
 * toggles as the formatting changes. Without both hotkeys configured the text
 * is typed unformatted rather than half-formatted.
 */
async function typeRuns(runs: TextRun[], settings: UserSettings): Promise<void> {
  const canFormat = !!settings.hotkeyBold?.trim() && !!settings.hotkeyItalic?.trim();
  if (!canFormat || !hasFormatting(runs)) {
    await insertKeyByKey(runsToPlainText(runs), settings.keyByKeyDelay);
    return;
  }

  for (const step of planTyping(runs)) {
    if (step.kind === "toggle") {
      await sendHotkey(step.format === "bold" ? settings.hotkeyBold : settings.hotkeyItalic);
    } else {
      await insertKeyByKey(step.text, settings.keyByKeyDelay);
    }
  }
}

/**
 * Deliver a generated report to the focused app using the chosen method.
 * `clipboard` just copies; `paste` copies then simulates Ctrl/Cmd+V;
 * `key-by-key` types it out character by character.
 *
 * Bold and italic survive only where the method can carry them: a rich-text
 * copy/paste when `richText` is on, or key-by-key with the toggles configured.
 */
export async function deliverContent(
  runs: TextRun[],
  method: ExecutionMethod,
  settings: UserSettings,
): Promise<void> {
  if (method === "key-by-key") {
    await typeRuns(runs, settings);
    return;
  }

  const plain = runsToPlainText(runs);
  if (settings.richText && hasFormatting(runs)) {
    await writeClipboardHtml(runsToHtml(runs), plain);
  } else {
    await writeClipboard(plain);
  }
  if (method === "paste") await simulatePaste();
}
