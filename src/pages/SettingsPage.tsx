import { useMaskStore } from "@/hooks/useMaskStore";
import { availableLanguages, t } from "@/lib/i18n";
import type { ExecutionMethod, Language } from "@/lib/types";

export function SettingsPage() {
  const settings = useMaskStore((s) => s.settings);
  const updateSettings = useMaskStore((s) => s.updateSettings);
  const clearHistory = useMaskStore((s) => s.clearHistory);
  const historyCount = useMaskStore((s) => s.history.length);
  const lang = settings.language;

  return (
    <div className="max-w-md space-y-5">
      <h1 className="text-xl font-semibold">{t("settings.title", lang)}</h1>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("settings.language", lang)}</span>
        <select
          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          value={settings.language}
          onChange={(e) => updateSettings({ language: e.target.value as Language })}
        >
          {availableLanguages().map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("settings.insert_method", lang)}</span>
        <select
          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          value={settings.insertMethod}
          onChange={(e) => updateSettings({ insertMethod: e.target.value as ExecutionMethod })}
        >
          <option value="clipboard">clipboard</option>
          <option value="key-by-key">key-by-key</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("settings.key_delay", lang)}</span>
        <input
          type="number"
          min={0}
          max={500}
          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
          value={settings.keyByKeyDelay}
          onChange={(e) => updateSettings({ keyByKeyDelay: Number(e.target.value) })}
        />
      </label>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Hotkey: menu</span>
          <input
            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
            value={settings.hotkeyOpenMenu}
            onChange={(e) => updateSettings({ hotkeyOpenMenu: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Hotkey: última</span>
          <input
            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
            value={settings.hotkeyRunLast}
            onChange={(e) => updateSettings({ hotkeyRunLast: e.target.value })}
          />
        </label>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <button
          onClick={clearHistory}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-500"
        >
          Limpar histórico ({historyCount})
        </button>
      </div>
    </div>
  );
}
