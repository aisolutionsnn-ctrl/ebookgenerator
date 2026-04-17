/**
 * POST /api/auth/register — Register a new user
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/supabaseAuth";
import { setAuthCookies } from "@/lib/authCookies";

export async function POST(request: NextRequest) {
  try {
    const { email, password, displayName } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const result = await registerUser(email, password, displayName);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Set cookies if we got tokens (email confirmation might be disabled)
    const anyResult = result as Record<string, unknown>;
    const hasSession = !!(anyResult.accessToken && anyResult.refreshToken);

    if (hasSession) {
      await setAuthCookies(anyResult.accessToken as string, anyResult.refreshToken as string);
    }

    // If no session, email verification is required
    if (!hasSession) {
      return NextResponse.json({
        user: null,
        needsVerification: true,
        message: "Registration successful! Please check your email to confirm your account.",
      }, { status: 201 });
    }

    return NextResponse.json({
      user: result.user,
      needsVerification: false,
      message: "Registration successful!",
    }, { status: 201 });
  } catch (err: unknown) {
    console.error("[API] POST /api/auth/register error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
