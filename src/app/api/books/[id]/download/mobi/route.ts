/**
 * GET /api/books/:id/download/mobi
 *
 * Download the generated MOBI file for a book (Kindle format).
 * Falls back to Supabase Storage if local file is missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { downloadFileFromCloud } from "@/lib/supabaseSync";

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

    let fileBuffer: Buffer;
    let fileSize: number;

    // Try local file first
    if (existsSync(book.mobiPath)) {
      fileBuffer = await readFile(book.mobiPath);
      fileSize = (await stat(book.mobiPath)).size;
    } else {
      // Fallback: try Supabase Storage
      console.log(`[Download] Local MOBI not found at ${book.mobiPath}, trying Supabase Storage...`);
      const exportDir = join(process.cwd(), "download", book.id);
      const cloudPath = await downloadFileFromCloud(book.id, "mobi", exportDir);

      if (cloudPath && existsSync(cloudPath)) {
        fileBuffer = await readFile(cloudPath);
        fileSize = (await stat(cloudPath)).size;

        // Update local path in DB
        await db.book.update({
          where: { id: book.id },
          data: { mobiPath: cloudPath },
        });
        console.log(`[Download] Restored MOBI from cloud: ${cloudPath}`);
      } else {
        return NextResponse.json(
          { error: "MOBI file not found locally or in cloud storage." },
          { status: 404 }
        );
      }
    }

    const filename = book.title
      ? `${book.title.replace(/[^a-zA-Z0-9]+/g, "_")}.mobi`
      : `book_${id}.mobi`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/x-mobipocket-ebook",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": fileSize.toString(),
      },
    });
  } catch (err: unknown) {
    console.error("[API] GET /api/books/:id/download/mobi error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
