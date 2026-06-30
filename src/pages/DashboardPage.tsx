import { useState } from "react";
import { useMaskStore } from "@/hooks/useMaskStore";
import { MaskExecutor } from "@/components/MaskExecutor";
import { t } from "@/lib/i18n";
import type { Mask } from "@/lib/types";

interface Props {
  onEdit: (id: string) => void;
  onCreate: () => void;
}

export function DashboardPage({ onEdit, onCreate }: Props) {
  const masks = useMaskStore((s) => s.masks);
  const deleteMask = useMaskStore((s) => s.deleteMask);
  const lang = useMaskStore((s) => s.settings.language);
  const [running, setRunning] = useState<Mask | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("dashboard.title", lang)}</h1>
        <button onClick={onCreate} className="rounded bg-brand px-3 py-1.5 text-sm text-white">
          {t("button.create_mask", lang)}
        </button>
      </div>

      {masks.length === 0 ? (
        <p className="text-slate-500">{t("dashboard.empty", lang)}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {masks.map((mask) => (
            <div
              key={mask.id}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{mask.name}</h3>
                  <p className="text-xs text-slate-500">{mask.category}</p>
                </div>
                {mask.is_official && (
                  <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700">oficial</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setRunning(mask)}
                  className="rounded bg-brand px-2 py-1 text-xs text-white"
                >
                  {t("button.execute", lang)}
                </button>
                <button
                  onClick={() => onEdit(mask.id)}
                  className="rounded border px-2 py-1 text-xs"
                >
                  ✎
                </button>
                <button
                  onClick={() => deleteMask(mask.id)}
                  className="rounded border px-2 py-1 text-xs text-red-500"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {running && <MaskExecutor mask={running} onClose={() => setRunning(null)} />}
    </div>
  );
}
