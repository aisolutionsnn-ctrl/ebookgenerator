/**
 * GET /api/books/:id
 *
 * Retrieve a book's full status, progress, chapter list, and metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
