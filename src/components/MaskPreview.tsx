import { useMemo } from "react";
import type { MaskBlock } from "@/lib/types";
import { extractVariables, interpolateMask } from "@/lib/maskExecutor";

interface Props {
  blocks: MaskBlock[];
  /** Sample values to render the live preview with. */
  values?: Record<string, string>;
}

/** Live, read-only render of a mask's interpolated output. */
export function MaskPreview({ blocks, values = {} }: Props) {
  const sample = useMemo(() => {
    // Fill empty variables with a visible placeholder so structure is clear.
    const merged: Record<string, string> = { ...values };
    for (const name of extractVariables(blocks)) {
      if (!merged[name]) merged[name] = `«${name}»`;
    }
    return interpolateMask(blocks, merged);
  }, [blocks, values]);

  return (
    <pre className="whitespace-pre-wrap break-words rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm min-h-[8rem]">
      {sample || <span className="text-slate-400">—</span>}
    </pre>
  );
}
