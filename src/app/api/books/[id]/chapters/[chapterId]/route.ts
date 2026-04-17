/**
 * PATCH /api/books/:id/chapters/:chapterId
 *
 * Update a chapter's markdown content (for inline editing).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id, chapterId } = await params;
    const body = await request.json();
    const { markdown } = body;

    if (typeof markdown !== "string") {
      return NextResponse.json({ error: "markdown field is required." }, { status: 400 });
    }

    // Verify chapter belongs to this book
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, bookId: id },
    });

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    await db.chapter.update({
      where: { id: chapterId },
      data: { markdown, editedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[API] PATCH chapter error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
