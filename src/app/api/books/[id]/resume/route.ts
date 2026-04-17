/**
 * POST /api/books/:id/resume
 *
 * Resume a failed book generation job.
 * The pipeline will skip already-completed phases/chapters
 * and continue from where it left off.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueBookJob } from "@/lib/jobQueue";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({ where: { id } });

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    if (book.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only failed books can be resumed. Current status: " + book.status },
        { status: 400 }
      );
    }

    // Re-enqueue the job — the pipeline will detect what's already done
    enqueueBookJob(book.id);

    return NextResponse.json({
      id: book.id,
      status: "RESUMING",
      message: "Book generation resumed from last checkpoint.",
    });
  } catch (err: unknown) {
    console.error("[API] POST /api/books/:id/resume error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
