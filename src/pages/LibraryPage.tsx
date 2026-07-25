import { useMemo, useState } from "react";
import { useMaskStore } from "@/hooks/useMaskStore";
import { MaskEditorModal } from "@/components/MaskEditorModal";
import { allGroupKeys, groupMasksByArea, subareaKey } from "@/lib/maskGrouping";
import { t } from "@/lib/i18n";

export function LibraryPage() {
  const masks = useMaskStore((s) => s.masks);
  const areas = useMaskStore((s) => s.areas);
  const addArea = useMaskStore((s) => s.addArea);
  const renameArea = useMaskStore((s) => s.renameArea);
  const deleteArea = useMaskStore((s) => s.deleteArea);
  const deleteMask = useMaskStore((s) => s.deleteMask);
  const lang = useMaskStore((s) => s.settings.language);

  const [newAreaName, setNewAreaName] = useState("");
  const [editor, setEditor] = useState<{ maskId: string | null; area: string | null } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmDeleteArea, setConfirmDeleteArea] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ area: string; value: string } | null>(null);

  const groups = useMemo(() => groupMasksByArea(masks, areas), [masks, areas]);

  const isCollapsed = (key: string) => collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const collapseAll = () => setCollapsed(new Set(allGroupKeys(groups)));

  const onAddArea = () => {
    addArea(newAreaName);
    setNewAreaName("");
  };

  const commitRename = () => {
    if (renaming) renameArea(renaming.area, renaming.value);
    setRenaming(null);
  };

  return (
    <div className="page-bg flex-1 overflow-y-auto px-8 py-7">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[.6px] text-muted">
              {t("library.kicker", lang)}
            </div>
            <div className="font-display text-[26px] font-bold text-ink">
              {t("library.title", lang)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={collapseAll}
              className="rounded-[14px] bg-sand px-3.5 py-2.5 text-[13px] font-extrabold text-ink"
            >
              {t("editor.collapse_all", lang)}
            </button>
            <button
              onClick={() => setCollapsed(new Set())}
              className="rounded-[14px] bg-sand px-3.5 py-2.5 text-[13px] font-extrabold text-ink"
            >
              {t("editor.expand_all", lang)}
            </button>
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

        {groups.length === 0 && (
          <div className="rounded-3xl border border-line bg-white px-6 py-10 text-center text-[13px] font-semibold text-muted">
            {t("library.no_areas", lang)}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const areaCollapsed = isCollapsed(group.area);
            return (
              <div
                key={group.area}
                className="rounded-3xl border border-line bg-white px-6 py-5 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => toggle(group.area)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="w-3 flex-shrink-0 text-xs text-muted">
                      {areaCollapsed ? "▸" : "▾"}
                    </span>
                    {renaming?.area === group.area ? (
                      <input
                        autoFocus
                        value={renaming.value}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={commitRename}
                        className="rounded-[10px] border border-line bg-card px-3 py-1.5 font-display text-[19px] font-bold text-ink outline-none"
                      />
                    ) : (
                      <span className="font-display text-[19px] font-bold text-ink">
                        {group.area}
                      </span>
                    )}
                    <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-extrabold text-muted">
                      {group.masks.length}
                    </span>
                  </button>

                  {confirmDeleteArea === group.area ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-600">
                        {group.masks.length > 0
                          ? t("library.confirm_delete_area_masks", lang).replace(
                              "{n}",
                              String(group.masks.length),
                            )
                          : t("library.confirm_delete_area", lang)}
                      </span>
                      <button
                        onClick={() => {
                          deleteArea(group.area);
                          setConfirmDeleteArea(null);
                        }}
                        className="rounded-[10px] bg-red-500 px-3 py-1.5 text-xs font-extrabold text-white"
                      >
                        {t("library.confirm_yes", lang)}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteArea(null)}
                        className="rounded-[10px] bg-sand px-3 py-1.5 text-xs font-extrabold text-ink"
                      >
                        {t("button.cancel", lang)}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenaming({ area: group.area, value: group.area })}
                        className="rounded-xl bg-sand px-3 py-2 text-xs font-extrabold text-ink"
                      >
                        {t("library.rename_area", lang)}
                      </button>
                      <button
                        onClick={() => setEditor({ maskId: null, area: group.area })}
                        className="rounded-xl bg-sand px-3.5 py-2 text-xs font-extrabold text-ink"
                      >
                        {t("library.add_mask", lang)}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteArea(group.area)}
                        title={t("library.delete_area", lang)}
                        className="rounded-xl px-2.5 py-2 text-base font-bold text-muted hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {!areaCollapsed && (
                  <div className="mt-3 flex flex-col gap-3">
                    {group.subareas.map((sub) => {
                      const key = subareaKey(group.area, sub.name);
                      const subCollapsed = isCollapsed(key);
                      return (
                        <div key={key}>
                          <button
                            onClick={() => toggle(key)}
                            className="mb-1.5 flex w-full items-center gap-2 text-left"
                          >
                            <span className="w-3 flex-shrink-0 text-[10px] text-muted">
                              {subCollapsed ? "▸" : "▾"}
                            </span>
                            <span className="text-[11.5px] font-extrabold uppercase tracking-[.5px] text-brand">
                              {sub.name || t("library.no_subarea", lang)}
                            </span>
                            <span className="text-[11px] font-extrabold text-muted">
                              {sub.masks.length}
                            </span>
                            <span className="ml-1 h-px flex-1 bg-line" />
                          </button>

                          {!subCollapsed && (
                            <div className="grid grid-cols-1 gap-1.5 pl-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                              {sub.masks.map((mask) => (
                                <div
                                  key={mask.id}
                                  className="flex items-center justify-between rounded-[14px] bg-card px-3.5 py-3"
                                >
                                  <button
                                    onClick={() =>
                                      setEditor({ maskId: mask.id, area: null })
                                    }
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <span className="block truncate text-sm font-bold text-ink">
                                      {mask.name}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => deleteMask(mask.id)}
                                    title={t("button.delete", lang)}
                                    className="px-1.5 py-0.5 text-base font-bold text-muted hover:text-red-500"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {group.masks.length === 0 && (
                      <div className="p-3.5 text-center text-xs font-semibold text-muted">
                        {t("library.empty_area", lang)}
                      </div>
                    )}
                  </div>
                )}
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
