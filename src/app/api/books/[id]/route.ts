/**
 * GET /api/books/:id — Retrieve a book's full status
 * DELETE /api/books/:id — Delete a book and all its data
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/authCookies";
import { deleteBookFromCloud } from "@/lib/supabaseSync";
import { isBookBeingProcessed } from "@/lib/jobQueue";
import { unlink } from "fs/promises";
import { existsSync } from "fs";

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({
      where: { id },
      include: {
        chapters: { orderBy: { chapterNumber: "asc" } },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    // Auto-detect stale books: if stuck for too long, mark as FAILED
    // Uses updatedAt (not createdAt) so books that were recently resumed aren't falsely marked stale
    // CRITICAL: Skip stale detection if the book is actively being processed by the job queue
    // This prevents falsely marking books as FAILED when they're genuinely in progress
    if (!isBookBeingProcessed(book.id)) {
      const PLANNING_STALE_MS = 20 * 60 * 1000; // 20 minutes for planning (includes metadata generation)
      const WRITING_STALE_MS = 90 * 60 * 1000;  // 90 minutes for writing (8-12 chapters × ~5min each)
      const EXPORTING_STALE_MS = 15 * 60 * 1000; // 15 minutes for exporting
      const STALE_THRESHOLD_MS = book.status === "PLANNING" ? PLANNING_STALE_MS : book.status === "EXPORTING" ? EXPORTING_STALE_MS : WRITING_STALE_MS;
      const activeStatuses = ["PLANNING", "WRITING", "EXPORTING"];
      if (activeStatuses.includes(book.status)) {
        const idleTime = Date.now() - new Date(book.updatedAt).getTime();
        if (idleTime > STALE_THRESHOLD_MS && !book.completedAt) {
          const stuckStatus = book.status;
          const errorMsg = `Generation timed out — stuck in ${stuckStatus} with no progress for over ${Math.round(idleTime / 60000)} minutes. Click "Resume from Checkpoint" to retry.`;
          console.warn(`[API] Book ${book.id} stuck in ${stuckStatus} for ${Math.round(idleTime / 60000)}min (no update since ${book.updatedAt.toISOString()}), marking as FAILED`);
          await db.book.update({
            where: { id: book.id },
            data: { status: "FAILED", errorMessage: errorMsg },
          });
          book.status = "FAILED";
          book.errorMessage = errorMsg;
        }
      }
    }

    const toc = safeParseJson(book.tocJson);
    const phases = safeParseJson(book.phasesJson) ?? { planning: false, writing: false, exporting: false };
    const metadata = safeParseJson(book.metadataJson);
    const tokenUsage = safeParseJson(book.tokenUsageJson);

    return NextResponse.json({
      id: book.id,
      prompt: book.prompt,
      audience: book.audience,
      tone: book.tone,
      lengthHint: book.lengthHint,
      language: book.language,
      pdfTemplate: book.pdfTemplate,
      status: book.status,
      title: book.title,
      subtitle: book.subtitle,
      toc,
      phases,
      metadata,
      tokenUsage,
      errorMessage: book.errorMessage,
      epubPath: book.epubPath,
      pdfPath: book.pdfPath,
      mobiPath: book.mobiPath,
      coverImagePath: book.coverImagePath,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      completedAt: book.completedAt,
      chapters: book.chapters.map((ch) => ({
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        outline: ch.outline,
        markdown: ch.markdown,
        status: ch.status,
        generatedAt: ch.generatedAt,
        editedAt: ch.editedAt,
      })),
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/books/:id error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/books/:id — Delete a book, its chapters, files, and cloud data */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if user is authenticated
    const authUser = await getCurrentUser();

    const book = await db.book.findUnique({
      where: { id },
      select: { id: true, userId: true, pdfPath: true, epubPath: true, mobiPath: true, coverImagePath: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    // If user is logged in, they can only delete their own books
    // If no user is logged in, allow deletion of books without userId (anonymous)
    if (authUser && book.userId && book.userId !== authUser.id) {
      return NextResponse.json({ error: "You can only delete your own books." }, { status: 403 });
    }

    // Delete local files
    const filePaths = [book.pdfPath, book.epubPath, book.mobiPath, book.coverImagePath].filter(Boolean) as string[];
    for (const filePath of filePaths) {
      if (filePath && existsSync(filePath)) {
        try { await unlink(filePath); } catch { /* ignore file delete errors */ }
      }
    }

    // Delete from Supabase cloud (non-blocking)
    deleteBookFromCloud(id).catch((err) => console.warn("[API] Cloud delete failed:", err));

    // Delete from local DB (chapters cascade)
    await db.book.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Book deleted." });
  } catch (err: unknown) {
    console.error("[API] DELETE /api/books/:id error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
