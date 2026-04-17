/**
 * POST /api/books — Create a new book generation job
 * GET /api/books — List all books
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueBookJob } from "@/lib/jobQueue";
import { isValidLanguage } from "@/lib/i18n";
import { PDF_TEMPLATES, type PdfTemplate } from "@/lib/pdfTemplates";

const MAX_PROMPT_LENGTH = 2000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, audience, tone, lengthHint, language, pdfTemplate } = body;

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
        ? audience.trim().slice(0, 200)
        : "General readers";
    const safeTone =
      typeof tone === "string" && tone.trim()
        ? tone.trim().slice(0, 200)
        : "Informative and engaging";
    const safeLengthHint =
      typeof lengthHint === "string" && lengthHint.trim()
        ? lengthHint.trim().slice(0, 100)
        : "Medium (8-12 chapters)";

    // T16: Validate language
    const safeLanguage = isValidLanguage(language) ? language : "en";

    // T22: Validate PDF template
    const validTemplates = PDF_TEMPLATES.map((t) => t.id);
    const safePdfTemplate: PdfTemplate =
      validTemplates.includes(pdfTemplate) ? pdfTemplate : "professional";

    // Create book record
    const book = await db.book.create({
      data: {
        prompt: prompt.trim(),
        audience: safeAudience,
        tone: safeTone,
        lengthHint: safeLengthHint,
        language: safeLanguage,
        pdfTemplate: safePdfTemplate,
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
        language: true,
        pdfTemplate: true,
        coverImagePath: true,
        epubPath: true,
        pdfPath: true,
        mobiPath: true,
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
