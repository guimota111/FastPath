import { useState } from "react";
import { useMaskStore } from "@/hooks/useMaskStore";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import { t } from "@/lib/i18n";

/**
 * Marketplace placeholder. Listing/search/reviews require Firebase (Firestore)
 * which is wired in a later phase; this renders the intended UI shell against
 * an empty result set so the surrounding app is navigable.
 */
export function MarketplacePage() {
  const lang = useMaskStore((s) => s.settings.language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("marketplace.title", lang)}</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          placeholder={t("marketplace.search", lang)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">todas</option>
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-sm text-slate-500">
        Marketplace conectará ao Firestore em fase futura. Busca: “{query || "—"}”, categoria:{" "}
        {category || "todas"}.
      </div>
    </div>
  );
}
