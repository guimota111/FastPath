// FastPath - Turning formatted runs into what each output method understands.

import type { TextRun } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render runs as an HTML fragment for a rich-text paste. Newlines become
 * `<br>` and runs of spaces are preserved, so the report keeps its shape in
 * editors that collapse whitespace.
 */
export function runsToHtml(runs: TextRun[]): string {
  const body = runs
    .map((run) => {
      let html = escapeHtml(run.text).replace(/\n/g, "<br>");
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
  return `<div style="white-space:pre-wrap">${body}</div>`;
}

/** Whether any run carries formatting worth sending as rich text. */
export function hasFormatting(runs: TextRun[]): boolean {
  return runs.some((run) => run.bold || run.italic);
}

/**
 * One step of typing a formatted report: either a hotkey that toggles the
 * target editor's bold/italic, or a stretch of plain text to type.
 */
export type TypingStep =
  | { kind: "toggle"; format: "bold" | "italic" }
  | { kind: "text"; text: string };

/**
 * Plan the keystrokes for typing `runs` into an editor whose bold and italic
 * are toggles. Toggles are emitted only when the state actually changes, and
 * any left on at the end are turned back off so the target app is not left
 * typing in bold afterwards.
 */
export function planTyping(runs: TextRun[]): TypingStep[] {
  const steps: TypingStep[] = [];
  let bold = false;
  let italic = false;

  for (const run of runs) {
    if (run.text === "") continue;
    if (!!run.bold !== bold) {
      steps.push({ kind: "toggle", format: "bold" });
      bold = !bold;
    }
    if (!!run.italic !== italic) {
      steps.push({ kind: "toggle", format: "italic" });
      italic = !italic;
    }
    steps.push({ kind: "text", text: run.text });
  }

  if (italic) steps.push({ kind: "toggle", format: "italic" });
  if (bold) steps.push({ kind: "toggle", format: "bold" });
  return steps;
}
