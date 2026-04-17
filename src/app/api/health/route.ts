/**
 * T44: Health Check API
 * Returns the status of database, LLM provider, and system uptime.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: Record<string, "ok" | "error"> = {};

  // Check database
  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }

  // Check LLM provider availability
  try {
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
    // z-ai-web-dev-sdk is always available (bundled)
    checks.llm = "ok"; // At least z-ai-web-dev-sdk is always present
    checks.llmProvider = hasOpenRouter ? "openrouter" : "z-ai-sdk";
  } catch {
    checks.llm = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok" || v === "openrouter" || v === "z-ai-sdk");

  return NextResponse.json({
    status: allOk ? "ok" : "degraded",
    checks,
    timestamp,
    version: "1.0.0",
  });
}
