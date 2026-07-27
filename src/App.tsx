import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FloatingPanel } from "./components/FloatingPanel";
import { LibraryPage } from "./pages/LibraryPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { useMaskStore } from "./hooks/useMaskStore";
import { useAuth } from "./hooks/useAuth";
import { useOsIntegration } from "./hooks/useOsIntegration";
import { IS_TAURI, openPanel } from "./lib/panelWindow";
import { t } from "./lib/i18n";
import { isTrialActive, trialDaysLeft } from "./lib/constants";
import logo from "./assets/logo.png";

type Route = "library" | "marketplace" | "settings";

/**
 * Whether this webview is the dedicated floating-panel window.
 * In Tauri the window label decides; in the browser (dev) `?panel=1` lets the
 * panel be previewed at http://localhost:1420/?panel=1.
 */
function isPanelWindow(): boolean {
  if (IS_TAURI) return getCurrentWindow().label === "panel";
  return new URLSearchParams(window.location.search).has("panel");
}

/** Standalone floating-panel window: no auth gate, no chrome, transparent bg. */
function PanelWindow() {
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  return (
    <div className="h-screen w-screen bg-transparent">
      <FloatingPanel standalone />
    </div>
  );
}

function MainApp() {
  const [route, setRoute] = useState<Route>("library");
  const lang = useMaskStore((s) => s.settings.language);
  const hotkeyOpenMenu = useMaskStore((s) => s.settings.hotkeyOpenMenu);
  const { user, loading, error, signIn, signUp, signInWithGoogle, signOut } = useAuth();

  useOsIntegration();

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
          <img src={logo} alt="" className="h-[22px] w-[22px] object-contain" />
        </div>
        <span className="font-display text-[15px] font-bold text-ink">
          {t("app.name", lang)}
        </span>
        <button
          onClick={() => void openPanel().catch((e) => console.error(e))}
          title={hotkeyOpenMenu}
          className="rounded-full bg-brand px-4 py-[9px] text-[13px] font-extrabold text-white shadow-[0_10px_18px_-8px_rgba(40,199,111,.70)]"
        >
          {t("nav.open_panel", lang)}
        </button>
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

export default function App() {
  return <ErrorBoundary>{isPanelWindow() ? <PanelWindow /> : <MainApp />}</ErrorBoundary>;
}
