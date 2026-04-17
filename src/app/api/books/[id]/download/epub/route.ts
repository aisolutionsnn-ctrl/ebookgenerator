/**
 * GET /api/books/:id/download/epub
 *
 * Download the generated EPUB file for a book.
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

    if (book.status !== "DONE" || !book.epubPath) {
      return NextResponse.json(
        { error: "EPUB not ready yet. Book status: " + book.status },
        { status: 400 }
      );
    }

    // Read the file
    const fileBuffer = await readFile(book.epubPath);
    const fileStat = await stat(book.epubPath);

    // Generate a nice filename
    const filename = book.title
      ? `${book.title.replace(/[^a-zA-Z0-9]+/g, "_")}.epub`
      : `book_${id}.epub`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/books/:id/download/epub error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
