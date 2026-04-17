/**
 * POST /api/sync/pull
 *
 * Pull all data from Supabase cloud to local DB (restore).
 * Restores books and chapters from the cloud.
 */

import { NextResponse } from "next/server";
import { pullAllFromCloud } from "@/lib/supabaseSync";

export async function POST() {
  try {
    const result = await pullAllFromCloud();

    if (result.errors.length > 0) {
      return NextResponse.json({
        success: true,
        ...result,
        warning: "Some items failed to restore. Check the errors array.",
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    console.error("[API] POST /api/sync/pull error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
