// FastPath - Firestore data access for user profiles.

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "./firebase";
import type { Plan, User } from "./types";
import { trialExpiresFrom } from "./constants";

const usersCol = "users";

export async function getUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, usersCol, uid));
  return snap.exists() ? (snap.data() as User) : null;
}

/**
 * Return the existing profile, or create one on first sign-in with a fresh
 * 15-day trial. Idempotent: an existing profile is never overwritten.
 */
export async function ensureUserProfile(fbUser: FirebaseUser): Promise<User> {
  const existing = await getUserProfile(fbUser.uid);
  if (existing) return existing;

  const now = new Date();
  const profile: User = {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    name: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Usuário",
    avatar_url: fbUser.photoURL ?? undefined,
    plan: "trial",
    trial_expires: trialExpiresFrom(now),
    language: "pt-BR",
    created_at: now.toISOString(),
  };

  // Drop undefined fields — Firestore rejects them.
  const clean = Object.fromEntries(
    Object.entries(profile).filter(([, v]) => v !== undefined),
  );
  await setDoc(doc(db, usersCol, fbUser.uid), clean);
  return profile;
}

export async function updateUserPlan(uid: string, plan: Plan): Promise<void> {
  await updateDoc(doc(db, usersCol, uid), { plan });
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<User, "name" | "language" | "avatar_url" | "stripe_customer_id">>,
): Promise<void> {
  await updateDoc(doc(db, usersCol, uid), patch);
}
