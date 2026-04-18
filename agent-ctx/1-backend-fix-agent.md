# Task 1 - Backend Fix Agent

## Summary
Fixed 4 critical backend issues in the E-book Generator project.

## Changes Made

### Issue 1: Stale Book Detection Fix
- **File**: `prisma/schema.prisma` — Added `updatedAt DateTime @default(now()) @updatedAt` to Book model
- **File**: `src/app/api/books/[id]/route.ts` — Changed stale detection from `createdAt` to `updatedAt`, increased PLANNING timeout to 15min
- **File**: `src/lib/jobQueue.ts` — Added `touchBook()` helper; `updatePhases` and `updateStatus` now also set `updatedAt`

### Issue 2: Resume Endpoint Fix
- **File**: `src/app/api/books/[id]/resume/route.ts` — Now allows resuming books in FAILED, PLANNING, WRITING, or EXPORTING status; resets stale chapter statuses before enqueuing

### Issue 3: Niche Research Depth
- **File**: `src/app/api/agent/niche-research/route.ts` — 6 parallel searches (was 4) + second LLM deepen pass
- **File**: `src/lib/agent/prompts.ts` — Added `NICHE_DEEPEN_SYSTEM_PROMPT` for the second LLM pass

### Issue 4: JobQueue updatedAt Tracking
- **File**: `src/lib/jobQueue.ts` — `touchBook()` called on chapter creation and completion; phase transitions auto-touch via `updatePhases`/`updateStatus`

### Supabase Sync Compatibility
- **Files**: `src/lib/supabaseSync.ts`, `src/app/api/books/route.ts`, `src/lib/jobQueue.ts` — Added `updatedAt` to `SyncBookData` and all construction sites

## Verification
- `bun run db:push` — Successful (backward compatible with default value)
- `bun run lint` — No errors
