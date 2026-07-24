// FastPath - Desktop Google OAuth (authorization code + PKCE).
//
// Firebase's `signInWithPopup`/`signInWithRedirect` do not work inside a Tauri
// WebView: the popup is blocked and the redirect scheme (`tauri://`) is not a
// valid OAuth redirect target. Instead we run the OAuth flow the way native
// desktop apps are meant to:
//
//   1. Spin up a one-shot loopback HTTP server in Rust (`start_oauth_server`).
//   2. Open Google's consent screen in the system browser (`open_external`).
//   3. Google redirects to `http://127.0.0.1:<port>/?code=...`, captured by the
//      loopback server and forwarded to us via the `oauth-redirect` event.
//   4. Exchange the authorization code for a Google `id_token` (PKCE).
//
// The returned `id_token` is handed to Firebase via
// `GoogleAuthProvider.credential(idToken)` + `signInWithCredential`.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const env = import.meta.env;
// Use a Google Cloud OAuth client of type "Desktop app" (loopback redirects on
// any port are allowed automatically; the client secret is non-confidential).
const CLIENT_ID = env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;
const CLIENT_SECRET = env.VITE_GOOGLE_OAUTH_CLIENT_SECRET as string | undefined;

const LOGIN_TIMEOUT_MS = 300_000; // 5 min to complete the browser flow.

function base64UrlEncode(bytes: ArrayBuffer): string {
  let str = "";
  for (const b of new Uint8Array(bytes)) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLen = 48): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

/**
 * Runs the desktop Google OAuth flow and returns a Google ID token suitable for
 * Firebase `signInWithCredential`. Throws on cancellation, timeout, or config
 * errors (with Portuguese messages for the UI).
 */
export async function getGoogleIdToken(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      "Login com Google não configurado: defina VITE_GOOGLE_OAUTH_CLIENT_ID no arquivo .env",
    );
  }

  // PKCE + CSRF parameters.
  const codeVerifier = randomString(48);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const state = randomString(16);

  // Start the loopback server and learn its port (the redirect target).
  const port = await invoke<number>("start_oauth_server");
  const redirectUri = `http://127.0.0.1:${port}`;

  // Arm the redirect listener *before* opening the browser so we never miss it.
  const redirectTarget = waitForRedirect();

  const authUrl =
    `${GOOGLE_AUTH_ENDPOINT}?` +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      prompt: "select_account",
      access_type: "offline",
    }).toString();

  await invoke("open_external", { url: authUrl });

  // e.g. "/?code=4/0Ab...&state=xyz" or "/?error=access_denied"
  const target = await redirectTarget;
  const query = new URLSearchParams(target.split("?")[1] ?? "");

  const oauthError = query.get("error");
  if (oauthError) {
    throw new Error(
      oauthError === "access_denied" ? "Login cancelado" : `Google: ${oauthError}`,
    );
  }
  if (query.get("state") !== state) {
    throw new Error("Falha de segurança no login (state inválido)");
  }
  const code = query.get("code");
  if (!code) throw new Error("Código de autorização não recebido do Google");

  // Exchange the authorization code for tokens.
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (CLIENT_SECRET) body.set("client_secret", CLIENT_SECRET);

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Falha ao concluir o login com Google (${res.status}): ${await res.text()}`);
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Resposta do Google sem id_token");
  return tokens.id_token;
}

/** Resolves with the loopback redirect target, or rejects on timeout. */
function waitForRedirect(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const unlistenPromise = listen<string>("oauth-redirect", (event) => {
      cleanup();
      resolve(event.payload);
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado aguardando o login do Google"));
    }, LOGIN_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      void unlistenPromise.then((un) => un());
    }
  });
}
