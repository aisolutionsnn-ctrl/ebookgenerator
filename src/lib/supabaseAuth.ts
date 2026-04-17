/**
 * Supabase Auth Helpers
 *
 * Server-side auth utilities for:
 * - Email/password registration & login
 * - Session management via HTTP-only cookies
 * - Getting current user from session
 */

import { getSupabase } from "./supabaseClient";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/** Register a new user with email & password */
export async function registerUser(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured" };

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || null },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: "Registration failed — no user returned" };
  }

  // If email confirmation is disabled, session is returned immediately
  const session = data.session;

  return {
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email!,
      displayName: displayName || null,
    },
    ...(session ? { accessToken: session.access_token, refreshToken: session.refresh_token } : {}),
  };
}

/** Login with email & password */
export async function loginUser(
  email: string,
  password: string
): Promise<AuthResult & { accessToken?: string; refreshToken?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured" };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email!,
      displayName: data.user.user_metadata?.display_name || null,
    },
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/** Get user from access token */
export async function getUserFromToken(
  accessToken: string
): Promise<AuthUser | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email!,
    displayName: data.user.user_metadata?.display_name || null,
  };
}

/** Refresh a session using refresh token */
export async function refreshSession(
  refreshToken: string
): Promise<AuthResult & { accessToken?: string; refreshToken?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured" };

  const { data, error } = await sb.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.user) {
    return { success: false, error: error?.message || "Session refresh failed" };
  }

  return {
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email!,
      displayName: data.user.user_metadata?.display_name || null,
    },
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/** Logout (revoke session) */
export async function logoutUser(accessToken: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  // Set the auth to the user's session before signing out
  const { error } = await sb.auth.admin.signOut(accessToken);
  return !error;
}
