import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { BuilderPage } from "./pages/BuilderPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { SettingsPage } from "./pages/SettingsPage";
import { useMaskStore } from "./hooks/useMaskStore";
import { t } from "./lib/i18n";

type Route = "dashboard" | "builder" | "marketplace" | "settings";

export default function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  const [editingMaskId, setEditingMaskId] = useState<string | null>(null);
  const lang = useMaskStore((s) => s.settings.language);

  const go = (r: Route, maskId: string | null = null) => {
    setEditingMaskId(maskId);
    setRoute(r);
  };

  const navItems: { key: Route; label: string }[] = [
    { key: "dashboard", label: t("dashboard.title", lang) },
    { key: "builder", label: t("builder.title", lang) },
    { key: "marketplace", label: t("marketplace.title", lang) },
    { key: "settings", label: t("settings.title", lang) },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 px-4 py-2">
        <span className="font-bold text-brand mr-4">{t("app.name", lang)}</span>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => go(item.key)}
            className={`px-3 py-1.5 rounded text-sm ${
              route === item.key
                ? "bg-brand text-white"
                : "hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </header>

      <main className="flex-1 p-4">
        {route === "dashboard" && (
          <DashboardPage onEdit={(id) => go("builder", id)} onCreate={() => go("builder")} />
        )}
        {route === "builder" && (
          <BuilderPage maskId={editingMaskId} onDone={() => go("dashboard")} />
        )}
        {route === "marketplace" && <MarketplacePage />}
        {route === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
