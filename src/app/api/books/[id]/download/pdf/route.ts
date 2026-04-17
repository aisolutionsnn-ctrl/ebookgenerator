/**
 * GET /api/books/:id/download/pdf
 *
 * Download the generated PDF file for a book.
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

    if (book.status !== "DONE" || !book.pdfPath) {
      return NextResponse.json(
        { error: "PDF not ready yet. Book status: " + book.status },
        { status: 400 }
      );
    }

    // Read the file
    const fileBuffer = await readFile(book.pdfPath);
    const fileStat = await stat(book.pdfPath);

    // Generate a nice filename
    const filename = book.title
      ? `${book.title.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`
      : `book_${id}.pdf`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/books/:id/download/pdf error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
