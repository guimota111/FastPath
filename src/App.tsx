import { useCallback, useState } from "react";
import { PanelPage } from "./pages/PanelPage";
import { LibraryPage } from "./pages/LibraryPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { useMaskStore } from "./hooks/useMaskStore";
import { useAuth } from "./hooks/useAuth";
import { useOsIntegration } from "./hooks/useOsIntegration";
import { t } from "./lib/i18n";
import { isTrialActive, trialDaysLeft } from "./lib/constants";

type Route = "panel" | "library" | "marketplace" | "settings";

export default function App() {
  const [route, setRoute] = useState<Route>("panel");
  const lang = useMaskStore((s) => s.settings.language);
  const { user, loading, error, signIn, signUp, signInWithGoogle, signOut } = useAuth();

  const openPanel = useCallback(() => setRoute("panel"), []);
  useOsIntegration(openPanel);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card">
        <span className="text-muted">Carregando…</span>
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
    { key: "panel", label: t("nav.panel", lang) },
    { key: "library", label: t("nav.library", lang) },
    { key: "marketplace", label: t("marketplace.title", lang) },
    { key: "settings", label: t("settings.title", lang) },
  ];

  const trialing = isTrialActive(user);
  const planLabel = trialing ? `trial · ${trialDaysLeft(user)}d` : user.plan;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream text-ink">
      <header className="flex h-[58px] flex-shrink-0 items-center gap-4 border-b border-line bg-white px-5">
        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[14px] bg-sand">
          <span className="font-display text-sm font-bold text-brand">F</span>
        </div>
        <span className="font-display text-[15px] font-bold text-ink">
          {t("app.name", lang)}
        </span>
        <div className="ml-auto flex gap-0.5 rounded-full bg-sand p-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setRoute(item.key)}
              className={`rounded-full px-4 py-[9px] text-[13px] font-extrabold ${
                route === item.key ? "bg-brand text-white" : "bg-transparent text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-ink"
            title={`Plano: ${user.plan}`}
          >
            {planLabel}
          </span>
          <span className="font-semibold text-muted">{user.name}</span>
          <button onClick={signOut} className="text-xs font-bold text-muted hover:text-red-500">
            Sair
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {route === "panel" && <PanelPage />}
        {route === "library" && <LibraryPage />}
        {route === "marketplace" && (
          <div className="page-bg flex-1 overflow-y-auto px-10 py-8">
            <MarketplacePage />
          </div>
        )}
        {route === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
