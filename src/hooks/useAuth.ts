// FastPath - Authentication state + actions (Firebase Auth).

import { useEffect, useState, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getGoogleIdToken } from "@/lib/googleOAuth";
import { ensureUserProfile } from "@/lib/firestore";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setState({ user: null, loading: false, error: null });
        return;
      }
      try {
        const profile = await ensureUserProfile(fbUser);
        setState({ user: profile, loading: false, error: null });
      } catch (e) {
        setState({ user: null, loading: false, error: errMsg(e) });
      }
    });
    return unsub;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    setState((s) => ({ ...s, error: null }));
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      // Profile + trial are created by the onAuthStateChanged handler.
    } catch (e) {
      setState((s) => ({ ...s, error: errMsg(e) }));
      throw e;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setState((s) => ({ ...s, error: errMsg(e) }));
      throw e;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setState((s) => ({ ...s, error: null }));
    try {
      // Desktop OAuth: get a Google ID token via the system browser, then
      // exchange it for a Firebase session. See lib/googleOAuth.ts.
      const idToken = await getGoogleIdToken();
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (e) {
      setState((s) => ({ ...s, error: errMsg(e) }));
      throw e;
    }
  }, []);

  const signOut = useCallback(() => fbSignOut(auth), []);

  return { ...state, signUp, signIn, signInWithGoogle, signOut };
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: string }).code);
    const map: Record<string, string> = {
      "auth/invalid-email": "E-mail inválido",
      "auth/email-already-in-use": "E-mail já cadastrado",
      "auth/weak-password": "Senha muito fraca (mín. 6 caracteres)",
      "auth/invalid-credential": "Credenciais inválidas",
      "auth/user-not-found": "Usuário não encontrado",
      "auth/wrong-password": "Senha incorreta",
      "auth/popup-closed-by-user": "Login cancelado",
    };
    return map[code] ?? code;
  }
  return e instanceof Error ? e.message : "Erro desconhecido";
}
