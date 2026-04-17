/**
 * GET /api/sync/setup-sql
 *
 * Return the SQL setup script for Supabase tables.
 * User should copy this and run it in Supabase Dashboard → SQL Editor.
 */

import { NextResponse } from "next/server";
import { getSetupSQL } from "@/lib/supabaseSync";

export async function GET() {
  try {
    const sql = getSetupSQL();
    return NextResponse.json({ sql });
  } catch (err: unknown) {
    console.error("[API] GET /api/sync/setup-sql error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
