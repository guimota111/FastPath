import { useState } from "react";
import { v4 as uuid } from "uuid";
import type { MaskBlock, VariableBlock, ConditionalBlock, TextBlock } from "@/lib/types";
import { normalizeMaskVariableName } from "@/lib/maskExecutor";
import { MaskPreview } from "./MaskPreview";
import { t } from "@/lib/i18n";
import type { Language } from "@/lib/types";

interface Props {
  initialBlocks?: MaskBlock[];
  lang: Language;
  onChange: (blocks: MaskBlock[]) => void;
}

function newText(): TextBlock {
  return { id: uuid(), type: "text", content: "" };
}
function newVariable(): VariableBlock {
  return {
    id: uuid(),
    type: "variable",
    variable_name: "variavel",
    field_type: "text",
    required: false,
  };
}
function newConditional(): ConditionalBlock {
  return {
    id: uuid(),
    type: "conditional",
    condition: { variable_name: "variavel", operator: "equals", value: "" },
    blocks: [],
  };
}

/**
 * Block-based builder. Drag-drop (react-dnd) is planned; for now blocks are
 * added/removed/reordered with controls, which is fully functional.
 */
export function MaskBuilder({ initialBlocks = [], lang, onChange }: Props) {
  const [blocks, setBlocks] = useState<MaskBlock[]>(initialBlocks);

  const commit = (next: MaskBlock[]) => {
    setBlocks(next);
    onChange(next);
  };

  const add = (block: MaskBlock) => commit([...blocks, block]);
  const remove = (id: string) => commit(blocks.filter((b) => b.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = blocks.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };
  const update = (id: string, patch: Partial<MaskBlock>) =>
    commit(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as MaskBlock) : b)));

  return (
    <div className="flex gap-4">
      <div className="w-1/2 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => add(newText())} className="rounded border px-2 py-1 text-sm">
            {t("builder.add_text", lang)}
          </button>
          <button onClick={() => add(newVariable())} className="rounded border px-2 py-1 text-sm">
            {t("builder.add_variable", lang)}
          </button>
          <button onClick={() => add(newConditional())} className="rounded border px-2 py-1 text-sm">
            {t("builder.add_conditional", lang)}
          </button>
        </div>

        <div className="space-y-2">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className="rounded border border-slate-200 dark:border-slate-700 p-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  {block.type}
                </span>
                <span className="flex gap-1">
                  <button onClick={() => move(idx, -1)} className="px-1 text-slate-500">↑</button>
                  <button onClick={() => move(idx, 1)} className="px-1 text-slate-500">↓</button>
                  <button onClick={() => remove(block.id)} className="px-1 text-red-500">✕</button>
                </span>
              </div>

              {block.type === "text" && (
                <textarea
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-sm"
                  placeholder="Texto fixo..."
                  value={block.content}
                  onChange={(e) => update(block.id, { content: e.target.value })}
                />
              )}

              {block.type === "variable" && (
                <div className="space-y-1 text-sm">
                  <input
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                    value={block.variable_name}
                    onChange={(e) =>
                      update(block.id, {
                        variable_name: normalizeMaskVariableName(e.target.value),
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1 py-1"
                      value={block.field_type}
                      onChange={(e) =>
                        update(block.id, { field_type: e.target.value as VariableBlock["field_type"] })
                      }
                    >
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="select">select</option>
                      <option value="checkbox">checkbox</option>
                    </select>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={block.required}
                        onChange={(e) => update(block.id, { required: e.target.checked })}
                      />
                      obrigatório
                    </label>
                  </div>
                </div>
              )}

              {block.type === "conditional" && (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-1">
                    <input
                      className="flex-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                      placeholder="variável"
                      value={block.condition.variable_name}
                      onChange={(e) =>
                        update(block.id, {
                          condition: {
                            ...block.condition,
                            variable_name: normalizeMaskVariableName(e.target.value),
                          },
                        })
                      }
                    />
                    <select
                      className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1 py-1"
                      value={block.condition.operator}
                      onChange={(e) =>
                        update(block.id, {
                          condition: {
                            ...block.condition,
                            operator: e.target.value as "equals" | "contains",
                          },
                        })
                      }
                    >
                      <option value="equals">equals</option>
                      <option value="contains">contains</option>
                    </select>
                    <input
                      className="flex-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                      placeholder="valor"
                      value={block.condition.value}
                      onChange={(e) =>
                        update(block.id, {
                          condition: { ...block.condition, value: e.target.value },
                        })
                      }
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Conteúdo condicional aninhado pode ser editado em versão futura do builder.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="w-1/2">
        <h3 className="mb-2 text-sm font-semibold text-slate-500">{t("builder.preview", lang)}</h3>
        <MaskPreview blocks={blocks} />
      </div>
    </div>
  );
}
