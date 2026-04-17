/**
 * POST /api/auth/logout — Logout and clear cookies
 */

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/authCookies";
import { logoutUser } from "@/lib/supabaseAuth";
import { clearAuthCookies } from "@/lib/authCookies";

export async function POST() {
  try {
    const accessToken = await getAccessToken();
    if (accessToken) {
      await logoutUser(accessToken);
    }

    await clearAuthCookies();

    return NextResponse.json({ message: "Logged out successfully." });
  } catch (err: unknown) {
    console.error("[API] POST /api/auth/logout error:", err);
    // Still clear cookies even if logout fails
    await clearAuthCookies();
    return NextResponse.json({ message: "Logged out." });
  }
}
