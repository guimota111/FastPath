// FastPath - Thin wrappers around Tauri backend commands.
// In a browser (vitest / vite preview without Tauri) these degrade gracefully.

import type { ExecutionMethod } from "./types";

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

export async function simulatePaste(): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) await invoke("simulate_paste");
}

/**
 * Deliver generated content to the focused app using the chosen method.
 * `clipboard` just copies; `key-by-key` types it out, with a clipboard-paste
 * fallback baked into the Rust side / browser path.
 */
export async function deliverContent(
  content: string,
  method: ExecutionMethod,
  delayMs: number,
): Promise<void> {
  if (method === "key-by-key") {
    await insertKeyByKey(content, delayMs);
  } else {
    await writeClipboard(content);
  }
}
