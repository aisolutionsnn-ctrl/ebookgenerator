/**
 * GET /api/auth/session — Get current session/user
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authCookies";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null, authenticated: false });
    }

    return NextResponse.json({ user, authenticated: true });
  } catch (err: unknown) {
    console.error("[API] GET /api/auth/session error:", err);
    return NextResponse.json({ user: null, authenticated: false });
  }
}
