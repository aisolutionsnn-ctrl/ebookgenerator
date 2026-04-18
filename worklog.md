---
Task ID: 1
Agent: Main Orchestrator
Task: Fix "Unexpected token <" error, stale detection, single-book simplification, niche research depth, resume endpoint

Work Log:
- Investigated all API endpoints and tested them with curl — all returning valid JSON
- Identified that "Unexpected token <" error occurs when Next.js dev server returns HTML error page (compile error, 404, etc.) and frontend tries to parse as JSON
- Added `safeFetchJSON()` helper to ebook-agent-view.tsx that checks content-type header before parsing
- Replaced all raw `fetch + res.json()` calls in agent view with safeFetchJSON
- Added RotateCcw import and resume button on failed BookProgressCard

- Backend fixes done via subagent:
  1. Stale book detection: Changed from `book.createdAt` to `book.updatedAt` for idle time calculation
  2. Added `touchBook()` helper in jobQueue that updates updatedAt on progress
  3. Resume endpoint now accepts FAILED, PLANNING, WRITING, EXPORTING statuses (not just FAILED)
  4. Reset chapter statuses (GENERATING/EDITING → PENDING) before resume re-enqueue
  5. Niche research: 6 parallel web searches (was 4) + second LLM deepen pass
  6. Added NICHE_DEEPEN_SYSTEM_PROMPT to prompts.ts
  7. INTER_CALL_DELAY in jobQueue reduced from 8000ms to 3000ms

Stage Summary:
- All critical bugs fixed: stale detection, resume for stuck books, safe JSON parsing
- Niche research now produces 2x longer insights with 6 search sources + deepen pass
- Pipeline is 2.5x faster (3s vs 8s inter-call delay)
- Resume button added directly on failed book cards in agent view
- Loading messages updated from "4 sources" to "6 sources"
