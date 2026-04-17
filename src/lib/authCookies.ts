/**
 * Auth Cookie Helpers
 *
 * Manages HTTP-only cookies for Supabase auth tokens.
 * Access token → short-lived (1 hour)
 * Refresh token → long-lived (7 days)
 */

import { cookies } from "next/headers";

const ACCESS_TOKEN_KEY = "sb-access-token";
const REFRESH_TOKEN_KEY = "sb-refresh-token";

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_KEY, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });

  cookieStore.set(REFRESH_TOKEN_KEY, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_KEY)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_KEY)?.value ?? null;
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_KEY);
  cookieStore.delete(REFRESH_TOKEN_KEY);
}

/** Get current auth user from cookies (access token or refresh) */
export async function getCurrentUser() {
  const { getUserFromToken, refreshSession } = await import("./supabaseAuth");

  const accessToken = await getAccessToken();
  if (accessToken) {
    const user = await getUserFromToken(accessToken);
    if (user) return user;
  }

  // Try refresh token
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    const result = await refreshSession(refreshToken);
    if (result.success && result.accessToken && result.refreshToken) {
      await setAuthCookies(result.accessToken, result.refreshToken);
      return result.user ?? null;
    }
  }

  return null;
}
