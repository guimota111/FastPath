import { useMaskStore } from "@/hooks/useMaskStore";
import { availableLanguages, t } from "@/lib/i18n";
import type { ExecutionMethod, Language } from "@/lib/types";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-[26px] w-11 rounded-full p-0.5 ${on ? "bg-brand" : "bg-sand"}`}
    >
      <div
        className="h-[22px] w-[22px] rounded-full bg-white shadow transition-transform"
        style={{ transform: `translateX(${on ? 18 : 0}px)` }}
      />
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[18px] rounded-3xl border border-line bg-white p-6 shadow-[0_8px_20px_-14px_rgba(60,40,20,.40)]">
      {children}
    </div>
  );
}

export function SettingsPage() {
  const settings = useMaskStore((s) => s.settings);
  const updateSettings = useMaskStore((s) => s.updateSettings);
  const clearHistory = useMaskStore((s) => s.clearHistory);
  const historyCount = useMaskStore((s) => s.history.length);
  const lang = settings.language;

  const hotkeyRows: { label: string; key: keyof typeof settings }[] = [
    { label: t("settings.hotkey_open", lang), key: "hotkeyOpenMenu" },
    { label: t("settings.hotkey_confirm", lang), key: "hotkeyConfirm" },
    { label: t("settings.hotkey_cancel", lang), key: "hotkeyCancel" },
    { label: t("settings.hotkey_voice", lang), key: "hotkeyVoice" },
  ];

  const outputOptions: { key: ExecutionMethod; label: string; desc: string }[] = [
    {
      key: "clipboard",
      label: t("settings.output_copy", lang),
      desc: t("settings.output_copy_desc", lang),
    },
    {
      key: "paste",
      label: t("settings.output_paste", lang),
      desc: t("settings.output_paste_desc", lang),
    },
    {
      key: "key-by-key",
      label: t("settings.output_type", lang),
      desc: t("settings.output_type_desc", lang),
    },
  ];

  return (
    <div className="page-bg flex-1 overflow-y-auto px-8 py-7">
      <div className="flex w-full flex-col gap-5">
        <div>
          <div className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[.6px] text-muted">
            {t("settings.title", lang)}
          </div>
          <div className="font-display text-[26px] font-bold text-ink">
            {t("settings.heading", lang)}
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-muted">
            {t("settings.subtitle", lang)}
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <span className="font-display text-[17px] font-semibold text-ink">
              {t("settings.voice", lang)}
            </span>
            <Toggle
              on={settings.voiceEnabled}
              onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">{t("settings.language", lang)}</span>
            <div className="flex gap-1.5">
              {availableLanguages().map((l) => (
                <button
                  key={l}
                  onClick={() => updateSettings({ voiceLang: l })}
                  className={`rounded-[10px] px-3.5 py-2 text-xs font-extrabold ${
                    settings.voiceLang === l ? "bg-brand text-white" : "bg-sand text-ink"
                  }`}
                >
                  {l === "en" ? "en-US" : l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-muted">
                {t("settings.sensitivity", lang)}
              </span>
              <span className="font-display text-sm font-bold text-brand">
                {settings.voiceSensitivity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.voiceSensitivity}
              onChange={(e) => updateSettings({ voiceSensitivity: Number(e.target.value) })}
              className="w-full accent-brand"
            />
          </div>
        </Card>

        <Card>
          <span className="font-display text-[17px] font-semibold text-ink">
            {t("settings.hotkeys", lang)}
          </span>
          {hotkeyRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted">{row.label}</span>
              <input
                value={settings[row.key] as string}
                onChange={(e) => updateSettings({ [row.key]: e.target.value })}
                className="w-[190px] rounded-[10px] border border-line bg-card px-3 py-2 text-center text-[13px] font-extrabold text-ink outline-none"
              />
            </div>
          ))}
        </Card>

        <Card>
          <span className="font-display text-[17px] font-semibold text-ink">
            {t("settings.output", lang)}
          </span>
          {outputOptions.map((opt) => (
            <div
              key={opt.key}
              onClick={() => updateSettings({ insertMethod: opt.key })}
              className={`cursor-pointer rounded-[14px] p-3.5 ${
                settings.insertMethod === opt.key
                  ? "border-2 border-brand bg-mint"
                  : "border border-line bg-card"
              }`}
            >
              <div className="text-sm font-extrabold text-ink">{opt.label}</div>
              <div className="mt-0.5 text-xs font-semibold text-muted">{opt.desc}</div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">{t("settings.key_delay", lang)}</span>
            <input
              type="number"
              min={0}
              max={500}
              value={settings.keyByKeyDelay}
              onChange={(e) => updateSettings({ keyByKeyDelay: Number(e.target.value) })}
              className="w-[100px] rounded-[10px] border border-line bg-card px-3 py-2 text-center text-[13px] font-extrabold text-ink outline-none"
            />
          </div>
        </Card>

        <Card>
          <span className="font-display text-[17px] font-semibold text-ink">
            {t("settings.formatting", lang)}
          </span>
          <div className="text-[13px] font-semibold text-muted">
            {t("settings.formatting_desc", lang)}
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-muted">
              {t("settings.rich_text", lang)}
              <span className="mt-0.5 block text-xs font-semibold text-muted/80">
                {t("settings.rich_text_desc", lang)}
              </span>
            </span>
            <Toggle
              on={settings.richText}
              onClick={() => updateSettings({ richText: !settings.richText })}
            />
          </div>

          <div className="border-t border-line pt-4 text-xs font-semibold text-muted">
            {t("settings.format_hotkeys_desc", lang)}
          </div>
          {(
            [
              [t("settings.hotkey_bold", lang), "hotkeyBold"],
              [t("settings.hotkey_italic", lang), "hotkeyItalic"],
            ] as [string, "hotkeyBold" | "hotkeyItalic"][]
          ).map(([label, key]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted">{label}</span>
              <input
                value={settings[key]}
                onChange={(e) => updateSettings({ [key]: e.target.value })}
                placeholder={t("settings.hotkey_none", lang)}
                className="w-[190px] rounded-[10px] border border-line bg-card px-3 py-2 text-center text-[13px] font-extrabold text-ink outline-none"
              />
            </div>
          ))}
        </Card>

        <Card>
          <span className="font-display text-[17px] font-semibold text-ink">
            {t("settings.general", lang)}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">
              {t("settings.language", lang)} (app)
            </span>
            <div className="flex gap-1.5">
              {availableLanguages().map((l) => (
                <button
                  key={l}
                  onClick={() => updateSettings({ language: l as Language })}
                  className={`rounded-[10px] px-3.5 py-2 text-xs font-extrabold ${
                    settings.language === l ? "bg-brand text-white" : "bg-sand text-ink"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">
              {t("settings.start_with_os", lang)}
            </span>
            <Toggle
              on={settings.startWithOS}
              onClick={() => updateSettings({ startWithOS: !settings.startWithOS })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">
              {t("settings.always_on_top", lang)}
            </span>
            <Toggle
              on={settings.alwaysOnTop}
              onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
            />
          </div>
          <div className="border-t border-line pt-4">
            <button
              onClick={clearHistory}
              className="rounded-[10px] border border-red-300 px-3 py-1.5 text-sm text-red-500"
            >
              {t("settings.clear_history", lang)} ({historyCount})
            </button>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
