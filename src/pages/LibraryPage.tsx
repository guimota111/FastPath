import { useState } from "react";
import { useMaskStore } from "@/hooks/useMaskStore";
import { MaskEditorModal } from "@/components/MaskEditorModal";
import { t } from "@/lib/i18n";

export function LibraryPage() {
  const masks = useMaskStore((s) => s.masks);
  const areas = useMaskStore((s) => s.areas);
  const addArea = useMaskStore((s) => s.addArea);
  const deleteMask = useMaskStore((s) => s.deleteMask);
  const lang = useMaskStore((s) => s.settings.language);

  const [newAreaName, setNewAreaName] = useState("");
  const [editor, setEditor] = useState<{ maskId: string | null; area: string | null } | null>(
    null,
  );

  const onAddArea = () => {
    addArea(newAreaName);
    setNewAreaName("");
  };

  return (
    <div className="page-bg flex-1 overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[.6px] text-muted">
              {t("library.kicker", lang)}
            </div>
            <div className="font-display text-[26px] font-bold text-ink">
              {t("library.title", lang)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddArea()}
              placeholder={t("library.new_area_placeholder", lang)}
              className="w-[180px] rounded-[14px] border border-line bg-white px-3.5 py-2.5 text-[13px] font-bold text-ink outline-none"
            />
            <button
              onClick={onAddArea}
              className="rounded-[14px] bg-sand px-4 py-2.5 text-[13px] font-extrabold text-ink"
            >
              {t("library.add_area", lang)}
            </button>
            <button
              onClick={() => setEditor({ maskId: null, area: null })}
              className="rounded-[14px] bg-brand px-5 py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_18px_-8px_rgba(40,199,111,.70)]"
            >
              {t("library.new_mask", lang)}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {areas.map((area) => {
            const items = masks.filter((m) => m.area === area);
            return (
              <div
                key={area}
                className="rounded-3xl border border-line bg-white px-6 py-5 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-display text-[19px] font-bold text-ink">{area}</span>
                  <button
                    onClick={() => setEditor({ maskId: null, area })}
                    className="rounded-xl bg-sand px-3.5 py-2 text-xs font-extrabold text-ink"
                  >
                    {t("library.add_mask", lang)}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {items.map((mask) => (
                    <button
                      key={mask.id}
                      onClick={() => setEditor({ maskId: mask.id, area: null })}
                      className="flex w-full items-center justify-between rounded-[14px] bg-card px-3.5 py-3"
                    >
                      <span className="flex flex-col gap-0.5 text-left">
                        <span className="text-sm font-bold text-ink">{mask.name}</span>
                        <span className="text-[11px] font-extrabold uppercase text-muted">
                          {mask.category}
                        </span>
                      </span>
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMask(mask.id);
                        }}
                        className="px-1.5 py-0.5 text-base font-bold text-muted hover:text-red-500"
                      >
                        ×
                      </span>
                    </button>
                  ))}
                  {items.length === 0 && (
                    <div className="p-3.5 text-center text-xs font-semibold text-muted">
                      {t("library.empty_area", lang)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editor && (
        <MaskEditorModal
          maskId={editor.maskId}
          initialArea={editor.area}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
