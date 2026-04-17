/**
 * POST /api/sync/push
 *
 * Push all local data to Supabase cloud (full sync).
 * Syncs books, chapters, and file uploads.
 */

import { NextResponse } from "next/server";
import { pushAllToCloud } from "@/lib/supabaseSync";

export async function POST() {
  try {
    const result = await pushAllToCloud();

    if (result.errors.length > 0) {
      return NextResponse.json({
        success: true,
        ...result,
        warning: "Some items failed to sync. Check the errors array.",
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    console.error("[API] POST /api/sync/push error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
