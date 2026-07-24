//! Tauri commands: clipboard access and key-by-key text insertion.

use enigo::{Enigo, Keyboard, Settings};
use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::Emitter;
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

/// Start a one-shot loopback HTTP server to capture the Google OAuth redirect.
///
/// Binds an ephemeral port on `127.0.0.1` and returns it. A background thread
/// accepts a single connection (the browser redirect), replies with a small
/// "you can close this tab" page, and emits the request target (path + query,
/// e.g. `/?code=...&state=...`) to the frontend via the `oauth-redirect` event.
/// The server then stops.
#[tauri::command]
pub fn start_oauth_server(app: tauri::AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            // First request line: `GET /?code=...&state=... HTTP/1.1`
            let target = req
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/")
                .to_string();

            let html = "<!doctype html><html lang=\"pt-br\"><head><meta charset=\"utf-8\">\
<title>FastPath</title></head><body style=\"font-family:system-ui,sans-serif;\
text-align:center;padding-top:64px;color:#1f2937\">\
<h2 style=\"color:#4f46e5\">FastPath</h2>\
<p>Login conclu&iacute;do. Voc&ecirc; j&aacute; pode fechar esta aba e voltar ao aplicativo.</p>\
</body></html>";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.flush();
            let _ = app.emit("oauth-redirect", target);
        }
    });

    Ok(port)
}

/// Open `url` in the user's default system browser.
///
/// Used for the desktop OAuth flow, where the consent screen must run outside
/// the app's WebView. Uses platform launchers that pass the URL as a single
/// argument so query separators (`&`) are not mangled by a shell.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
