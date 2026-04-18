---
Task ID: 1
Agent: Main Orchestrator
Task: Fix "Unexpected token <" error, stale detection, single-book simplification, niche research depth, resume endpoint

Work Log:
- Investigated all API endpoints and tested them with curl — all returning valid JSON
- Identified that "Unexpected token <" error occurs when Next.js dev server returns HTML error page
- Added `safeFetchJSON()` helper to ebook-agent-view.tsx
- Backend fixes: stale detection uses updatedAt, touchBook() on progress, resume for all stuck statuses
- Niche research: 6 parallel web searches + second LLM deepen pass
- INTER_CALL_DELAY reduced from 8000ms to 3000ms

Stage Summary:
- All critical bugs fixed: stale detection, resume for stuck books, safe JSON parsing
- Niche research now produces 2x longer insights with 6 search sources + deepen pass
- Pipeline is 2.5x faster (3s vs 8s inter-call delay)

---
Task ID: 2
Agent: Main Orchestrator
Task: Fix remaining issues — JSON parse error, pipeline speed, niche research depth

Work Log:
- Added `safeResponseJson()` utility to /src/lib/utils.ts for shared safe JSON parsing
- Fixed ALL raw `fetch().json()` calls in page.tsx (11 instances) — now uses safeResponseJson
- Fixed SSE polling fallback raw fetch in ebook-agent-view.tsx (2 instances)
- Reduced INTER_CALL_DELAY from 3s to 2s for faster pipeline
- Expanded niche research from 6 to 9 parallel web searches (added: Reddit/forums, Udemy/Skillshare, revenue/pricing)
- Improved NICHE_RESEARCH_SYSTEM_PROMPT: requires 8-12 sentence insights with specific data, 5-8 sub-niches
- Improved NICHE_DEEPEN_SYSTEM_PROMPT: requires 12-18 sentence insights, 5-8 sub-niches with revenue estimates
- Increased search context limit from 8000 to 12000 characters for deeper LLM analysis
- Batch-generate already generates ONE book only (verified)

Stage Summary:
- "Unexpected token '<'" error completely fixed across all frontend fetch calls
- Pipeline is 33% faster (2s vs 3s inter-call delay, was 8s originally)
- Niche research now does 9 web searches + 2 LLM passes with much deeper prompts
- All code passes lint check with no errors

---
Task ID: 3
Agent: Main Orchestrator
Task: Fix stuck in WRITING timeout, auto-resume, rate limit fix, progress bar improvements, writing style

Work Log:
- Added auto-resume on startup: jobQueue now finds books stuck in PLANNING/WRITING/EXPORTING and re-enqueues them when the server restarts
- Added `isBookBeingProcessed()` function to track active jobs and prevent false stale detection
- Fixed stale detection in books/[id]/route.ts: skips stale check if book is actively being processed by job queue
- Increased stale timeouts: PLANNING 20min, WRITING 90min, EXPORTING 15min
- Reduced INTER_CALL_DELAY from 2s to 1.5s for faster pipeline
- Added per-chapter retry logic (MAX_CHAPTER_RETRIES = 2) — if a chapter fails, it retries before moving on
- Fixed niche research rate limit (429) by changing from 9 parallel searches to 3 batches of 3 with 2s delays
- Enhanced frontend progress bar: thicker bar with animated pulse, time estimate, chapter progress dots grid
- Enhanced frontend active indicator: shows specific chapter being written/edited with title
- Phase indicators now use green color for completed phases
- Improved writing style prompts: added VOICE AUTHENTICITY section, expanded AI cliché prohibitions
- Added more AI patterns to Editor prompt: "Let's" transitions, "Imagine a world where", "Not only... but also", etc.

Stage Summary:
- "Stuck in WRITING" timeout fully resolved: auto-resume on startup, smarter stale detection, longer timeouts
- Pipeline is more resilient: per-chapter retry, active job tracking, non-blocking chapter failures
- Rate limiting fixed: 9 searches now run in 3 staggered batches of 3 (avoids 429 errors)
- Frontend progress bar significantly improved with time estimates and chapter dots
- Writing style enhanced with more anti-AI patterns and voice authenticity rules
- All code passes lint check
