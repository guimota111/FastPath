import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Mask, VariableBlock, MaskBlock } from "@/lib/types";
import {
  interpolateMask,
  missingRequiredVariables,
} from "@/lib/maskExecutor";
import { deliverContent } from "@/lib/tauri";
import { useMaskStore } from "@/hooks/useMaskStore";
import { t } from "@/lib/i18n";

interface Props {
  mask: Mask;
  onClose: () => void;
}

/** Collect every variable block (with metadata) in render order. */
function collectVariableBlocks(blocks: MaskBlock[]): VariableBlock[] {
  const out: VariableBlock[] = [];
  const seen = new Set<string>();
  const visit = (bs: MaskBlock[]) => {
    for (const b of bs) {
      if (b.type === "variable") {
        if (!seen.has(b.variable_name)) {
          seen.add(b.variable_name);
          out.push(b);
        }
      } else if (b.type === "conditional") {
        visit(b.blocks);
      }
    }
  };
  visit(blocks);
  return out;
}

export function MaskExecutor({ mask, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const settings = useMaskStore((s) => s.settings);
  const addHistory = useMaskStore((s) => s.addHistory);
  const lang = settings.language;

  const fields = useMemo(() => collectVariableBlocks(mask.blocks), [mask.blocks]);

  const setValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const run = async (forceMethod?: "clipboard") => {
    const missing = missingRequiredVariables(mask.blocks, values);
    if (missing.length > 0) {
      setStatus(`${t("error.required_fields", lang)}: ${missing.join(", ")}`);
      return;
    }

    const content = interpolateMask(mask.blocks, values);
    const method = forceMethod ?? settings.insertMethod;

    await deliverContent(content, method, settings.keyByKeyDelay);

    addHistory({
      id: uuid(),
      mask_id: mask.id,
      generated_content: content,
      variables_used: values,
      timestamp: new Date().toISOString(),
      execution_method: method,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-slate-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{mask.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {fields.length === 0 && (
            <p className="text-sm text-slate-500">Sem variáveis — apenas texto fixo.</p>
          )}
          {fields.map((f) => (
            <label key={f.id} className="block text-sm">
              <span className="mb-1 block font-medium">
                {f.variable_name}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              {f.field_type === "textarea" ? (
                <textarea
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                  value={values[f.variable_name] ?? f.default ?? ""}
                  onChange={(e) => setValue(f.variable_name, e.target.value)}
                />
              ) : f.field_type === "select" ? (
                <select
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                  value={values[f.variable_name] ?? f.default ?? ""}
                  onChange={(e) => setValue(f.variable_name, e.target.value)}
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : f.field_type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={(values[f.variable_name] ?? f.default) === "true"}
                  onChange={(e) => setValue(f.variable_name, e.target.checked ? "true" : "false")}
                />
              ) : (
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                  value={values[f.variable_name] ?? f.default ?? ""}
                  onChange={(e) => setValue(f.variable_name, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        {status && <p className="mt-3 text-sm text-red-500">{status}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => run("clipboard")}
            className="rounded border border-brand px-3 py-1.5 text-sm text-brand"
          >
            {t("button.copy", lang)}
          </button>
          <button
            onClick={() => run()}
            className="rounded bg-brand px-3 py-1.5 text-sm text-white"
          >
            {t("button.insert", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
