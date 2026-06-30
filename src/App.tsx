import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { BuilderPage } from "./pages/BuilderPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { useMaskStore } from "./hooks/useMaskStore";
import { useAuth } from "./hooks/useAuth";
import { t } from "./lib/i18n";
import { isTrialActive, trialDaysLeft } from "./lib/constants";

type Route = "dashboard" | "builder" | "marketplace" | "settings";

export default function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  const [editingMaskId, setEditingMaskId] = useState<string | null>(null);
  const lang = useMaskStore((s) => s.settings.language);
  const { user, loading, error, signIn, signUp, signInWithGoogle, signOut } = useAuth();

  const go = (r: Route, maskId: string | null = null) => {
    setEditingMaskId(maskId);
    setRoute(r);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <span className="text-slate-400">Carregando…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        error={error}
        onSignIn={signIn}
        onSignUp={signUp}
        onGoogle={signInWithGoogle}
      />
    );
  }

  const navItems: { key: Route; label: string }[] = [
    { key: "dashboard", label: t("dashboard.title", lang) },
    { key: "builder", label: t("builder.title", lang) },
    { key: "marketplace", label: t("marketplace.title", lang) },
    { key: "settings", label: t("settings.title", lang) },
  ];

  const trialing = isTrialActive(user);
  const planLabel = trialing ? `trial · ${trialDaysLeft(user)}d` : user.plan;

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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span
            className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700"
            title={`Plano: ${user.plan}`}
          >
            {planLabel}
          </span>
          <span className="text-slate-500">{user.name}</span>
          <button onClick={signOut} className="text-xs text-slate-500 hover:text-red-500">
            Sair
          </button>
        </div>
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
