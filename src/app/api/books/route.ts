/**
 * POST /api/books
 *
 * Create a new book generation job.
 * Validates input, creates DB record, and enqueues the job.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueBookJob } from "@/lib/jobQueue";

const MAX_PROMPT_LENGTH = 2000;
const MAX_AUDIENCE_LENGTH = 200;
const MAX_TONE_LENGTH = 200;
const MAX_LENGTH_HINT_LENGTH = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, audience, tone, lengthHint } = body;

    // Validate prompt (required)
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "Prompt is required and must be at least 10 characters." },
        { status: 400 }
      );
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Validate optional fields with defaults
    const safeAudience =
      typeof audience === "string" && audience.trim()
        ? audience.trim().slice(0, MAX_AUDIENCE_LENGTH)
        : "General readers";
    const safeTone =
      typeof tone === "string" && tone.trim()
        ? tone.trim().slice(0, MAX_TONE_LENGTH)
        : "Informative and engaging";
    const safeLengthHint =
      typeof lengthHint === "string" && lengthHint.trim()
        ? lengthHint.trim().slice(0, MAX_LENGTH_HINT_LENGTH)
        : "Medium (8-12 chapters)";

    // Create book record
    const book = await db.book.create({
      data: {
        prompt: prompt.trim(),
        audience: safeAudience,
        tone: safeTone,
        lengthHint: safeLengthHint,
        status: "PLANNING",
        phasesJson: JSON.stringify({
          planning: false,
          writing: false,
          exporting: false,
        }),
      },
    });

    // Enqueue the generation job
    enqueueBookJob(book.id);

    return NextResponse.json(
      {
        id: book.id,
        status: book.status,
        message: "Book generation started.",
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[API] POST /api/books error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/books
 *
 * List all books (simple listing for the UI).
 */
export async function GET() {
  try {
    const books = await db.book.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        status: true,
        prompt: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ books });
  } catch (err: unknown) {
    console.error("[API] GET /api/books error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
