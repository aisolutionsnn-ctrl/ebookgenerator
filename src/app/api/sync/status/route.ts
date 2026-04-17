/**
 * GET /api/sync/status
 *
 * Check Supabase connection status and cloud data info.
 */

import { NextResponse } from "next/server";
import { getSupabaseStatus, getSetupSQL } from "@/lib/supabaseSync";

export async function GET() {
  try {
    const status = await getSupabaseStatus();

    return NextResponse.json({
      ...status,
      setupSQL: !status.tableExists ? getSetupSQL() : undefined,
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/sync/status error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
