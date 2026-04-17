/**
 * POST /api/auth/login — Login with email & password
 */

import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/supabaseAuth";
import { setAuthCookies } from "@/lib/authCookies";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const result = await loginUser(email, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    // Set auth cookies
    if (result.accessToken && result.refreshToken) {
      await setAuthCookies(result.accessToken, result.refreshToken);
    }

    return NextResponse.json({
      user: result.user,
      message: "Login successful!",
    });
  } catch (err: unknown) {
    console.error("[API] POST /api/auth/login error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
