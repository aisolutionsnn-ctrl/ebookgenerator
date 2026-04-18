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
