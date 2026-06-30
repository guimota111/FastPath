import { useState } from "react";
import { useMaskStore } from "@/hooks/useMaskStore";
import { t } from "@/lib/i18n";

interface Props {
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onGoogle: () => Promise<void>;
}

export function AuthPage({ error, onSignIn, onSignUp, onGoogle }: Props) {
  const lang = useMaskStore((s) => s.settings.language);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") await onSignIn(email, password);
      else await onSignUp(email, password, name);
    } catch {
      /* error surfaced via `error` prop */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h1 className="mb-1 text-center text-2xl font-bold text-brand">{t("app.name", lang)}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          {mode === "signin" ? t("auth.signin", lang) : t("auth.signup", lang)}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
            placeholder={t("auth.email", lang)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
            placeholder={t("auth.password", lang)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {mode === "signin" ? t("auth.signin", lang) : t("auth.signup", lang)}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          ou
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 disabled:opacity-60"
        >
          Google Sign-In
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-brand"
        >
          {mode === "signin"
            ? `${t("auth.signup", lang)} →`
            : `← ${t("auth.signin", lang)}`}
        </button>
      </div>
    </div>
  );
}
