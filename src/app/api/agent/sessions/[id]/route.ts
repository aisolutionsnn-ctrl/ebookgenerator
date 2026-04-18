import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Helper: parse all JSON fields on an AgentSession row so the API returns
 * proper objects instead of raw JSON strings.
 */
function parseSession(raw: Awaited<ReturnType<typeof db.agentSession.findUnique>>) {
  if (!raw) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    niche: raw.niche,
    subNiche: raw.subNiche,
    customNiche: raw.customNiche,
    bookCount: raw.bookCount,
    currentStep: raw.currentStep,
    status: raw.status,
    nicheData: raw.nicheDataJson ? JSON.parse(raw.nicheDataJson) : null,
    competitionData: raw.competitionDataJson ? JSON.parse(raw.competitionDataJson) : null,
    evaluationData: raw.evaluationDataJson ? JSON.parse(raw.evaluationDataJson) : null,
    seoData: raw.seoDataJson ? JSON.parse(raw.seoDataJson) : null,
    coverData: raw.coverDataJson ? JSON.parse(raw.coverDataJson) : null,
    generatedBookIds: raw.generatedBookIds ? JSON.parse(raw.generatedBookIds) : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * GET /api/agent/sessions/[id]
 * Returns a single session with all parsed JSON data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await db.agentSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: parseSession(session) });
  } catch (error) {
    console.error("[Session Get API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agent/sessions/[id]
 * Deletes a session.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await db.agentSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    await db.agentSession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("[Session Delete API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
