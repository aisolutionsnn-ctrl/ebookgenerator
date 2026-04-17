/**
 * GET /api/books/:id/download/mobi
 *
 * Download the generated MOBI file for a book (Kindle format).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile, stat } from "fs/promises";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({ where: { id } });

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    if (book.status !== "DONE" || !book.mobiPath) {
      return NextResponse.json(
        { error: "MOBI not available. Book status: " + book.status },
        { status: 400 }
      );
    }

    const fileBuffer = await readFile(book.mobiPath);
    const fileStat = await stat(book.mobiPath);

    const filename = book.title
      ? `${book.title.replace(/[^a-zA-Z0-9]+/g, "_")}.mobi`
      : `book_${id}.mobi`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/x-mobipocket-ebook",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/books/:id/download/mobi error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
