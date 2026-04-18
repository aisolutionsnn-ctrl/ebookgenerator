/**
 * GET /api/books/:id/progress — SSE endpoint for real-time book generation progress
 *
 * Sends Server-Sent Events with live progress updates every 2 seconds.
 * Closes automatically when the book reaches DONE or FAILED status.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify book exists
  const existingBook = await db.book.findUnique({ where: { id } });
  if (!existingBook) {
    return new Response("Book not found", { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let heartbeatInterval: ReturnType<typeof setInterval>;
      let pollInterval: ReturnType<typeof setInterval>;
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may already be closed
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* already closed */ }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const book = await db.book.findUnique({
            where: { id },
            include: { chapters: { orderBy: { chapterNumber: "asc" } } },
          });
          if (!book) { send("error", { message: "Book not found" }); close(); return; }

          const doneChapters = book.chapters.filter(c => c.status === "DONE").length;
          const totalChapters = book.chapters.length;
          const currentChapter = book.chapters.find(c => c.status === "GENERATING" || c.status === "EDITING");

          let progress = 0;
          let currentPhase = "Queued";

          if (book.status === "DONE") { progress = 100; currentPhase = "Done"; }
          else if (book.status === "FAILED") { progress = 0; currentPhase = "Failed"; }
          else if (book.status === "EXPORTING") { progress = 85; currentPhase = "Exporting"; }
          else if (book.status === "WRITING") {
            progress = totalChapters > 0 ? 20 + Math.round((doneChapters / totalChapters) * 60) : 40;
            currentPhase = "Writing";
          } else if (book.status === "PLANNING") { progress = 10; currentPhase = "Planning"; }

          send("progress", {
            status: book.status,
            currentPhase,
            progress,
            doneChapters,
            totalChapters,
            currentChapterNum: currentChapter?.chapterNumber ?? null,
            currentChapterStatus: currentChapter?.status ?? null,
            currentChapterTitle: currentChapter?.title ?? null,
            title: book.title,
            errorMessage: book.errorMessage,
          });

          if (["DONE", "FAILED"].includes(book.status)) {
            close();
          }
        } catch (err) {
          console.error("[SSE] Poll error:", err);
        }
      };

      // Initial poll
      await poll();

      // Poll every 2 seconds
      pollInterval = setInterval(poll, 2000);

      // Heartbeat every 15 seconds
      heartbeatInterval = setInterval(() => {
        if (!closed) send("heartbeat", { ts: Date.now() });
      }, 15000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
