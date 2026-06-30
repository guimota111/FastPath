import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useMaskStore } from "@/hooks/useMaskStore";
import { MaskBuilder } from "@/components/MaskBuilder";
import { extractVariables, validateMask } from "@/lib/maskExecutor";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Mask, MaskBlock } from "@/lib/types";

interface Props {
  maskId: string | null;
  onDone: () => void;
}

export function BuilderPage({ maskId, onDone }: Props) {
  const existing = useMaskStore((s) => (maskId ? s.getMask(maskId) : undefined));
  const upsertMask = useMaskStore((s) => s.upsertMask);
  const lang = useMaskStore((s) => s.settings.language);

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? DEFAULT_CATEGORIES[0]);
  const [blocks, setBlocks] = useState<MaskBlock[]>(existing?.blocks ?? []);
  const [errors, setErrors] = useState<string[]>([]);

  const save = () => {
    const now = new Date().toISOString();
    const mask: Mask = {
      id: existing?.id ?? uuid(),
      creator_id: existing?.creator_id ?? "local-user",
      name,
      description,
      category,
      blocks,
      is_published: existing?.is_published ?? false,
      is_official: existing?.is_official ?? false,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      variables: extractVariables(blocks),
    };

    const result = validateMask(mask);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    upsertMask(mask);
    onDone();
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("builder.title", lang)}</h1>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          placeholder="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <MaskBuilder initialBlocks={blocks} lang={lang} onChange={setBlocks} />

      {errors.length > 0 && (
        <ul className="mt-3 list-inside list-disc text-sm text-red-500">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={save} className="rounded bg-brand px-4 py-1.5 text-sm text-white">
          {t("button.save", lang)}
        </button>
        <button onClick={onDone} className="rounded border px-4 py-1.5 text-sm">
          {t("button.cancel", lang)}
        </button>
      </div>
    </div>
  );
}
