//! Tauri commands: clipboard access and key-by-key text insertion.

use enigo::{Enigo, Keyboard, Settings};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Write `text` to the system clipboard.
#[tauri::command]
pub async fn write_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Read the current clipboard contents.
#[tauri::command]
pub async fn read_clipboard(app: tauri::AppHandle) -> Result<String, String> {
    app.clipboard().read_text().map_err(|e| e.to_string())
}

/// Type `text` into the focused field one character at a time.
///
/// `delay_ms` is the pause between characters (lower = faster). Runs on a
/// blocking thread so the async runtime is not stalled.
#[tauri::command]
pub async fn insert_text_keybykey(text: String, delay_ms: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        let delay = std::time::Duration::from_millis(delay_ms);
        for ch in text.chars() {
            enigo
                .text(&ch.to_string())
                .map_err(|e| e.to_string())?;
            std::thread::sleep(delay);
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Simulate a Ctrl/Cmd+V paste into the focused field.
#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    use enigo::{Direction, Key};

    tauri::async_runtime::spawn_blocking(|| {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

        #[cfg(target_os = "macos")]
        let modifier = Key::Meta;
        #[cfg(not(target_os = "macos"))]
        let modifier = Key::Control;

        enigo.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(modifier, Direction::Release).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}
