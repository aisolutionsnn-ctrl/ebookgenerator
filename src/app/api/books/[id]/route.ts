/**
 * GET /api/books/:id
 *
 * Retrieve a book's full status, progress, and chapter list.
 * Used by the frontend for polling.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { chapterNumber: "asc" },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    // Parse JSON fields
    let toc = null;
    if (book.tocJson) {
      try {
        toc = JSON.parse(book.tocJson);
      } catch {
        toc = null;
      }
    }

    let phases = { planning: false, writing: false, exporting: false };
    if (book.phasesJson) {
      try {
        phases = JSON.parse(book.phasesJson);
      } catch {
        // Keep default
      }
    }

    return NextResponse.json({
      id: book.id,
      prompt: book.prompt,
      audience: book.audience,
      tone: book.tone,
      lengthHint: book.lengthHint,
      status: book.status,
      title: book.title,
      subtitle: book.subtitle,
      toc,
      phases,
      errorMessage: book.errorMessage,
      epubPath: book.epubPath,
      pdfPath: book.pdfPath,
      createdAt: book.createdAt,
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
