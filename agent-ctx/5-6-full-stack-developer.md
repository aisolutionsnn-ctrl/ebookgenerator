# Task 5-6: Build Agent 1 & 2 API Routes

## Agent: full-stack-developer

## Files Created

1. **`/home/z/my-project/src/app/api/agent/niche-research/route.ts`**
   - POST handler accepting `{ niche, subNiche, customNiche? }`
   - Uses `z-ai-web-dev-sdk` web_search with 2 parallel queries
   - Calls `createChatCompletionJSON` with `NICHE_RESEARCH_SYSTEM_PROMPT`
   - Creates `AgentSession` in DB with `nicheDataJson`
   - Returns `{ sessionId, nicheData }` with parsed `NicheResearchResult`

2. **`/home/z/my-project/src/app/api/agent/competition/route.ts`**
   - POST handler accepting `{ sessionId, niche, subNiche, customNiche? }`
   - Verifies session exists
   - Uses `z-ai-web-dev-sdk` web_search with 2 parallel queries
   - Calls `createChatCompletionJSON` with `COMPETITION_RESEARCH_SYSTEM_PROMPT`
   - Updates session: sets `competitionDataJson` and `currentStep = 2`
   - Returns `{ sessionId, competitionData }` with parsed `CompetitionResult`

3. **`/home/z/my-project/src/app/api/agent/batch-generate/route.ts`**
   - POST handler accepting `{ sessionId, niche, subNiche, customNiche?, bookCount }`
   - Fetches competition data from session
   - Uses `BATCH_BOOK_ANGLES_PROMPT` to generate unique angles
   - Creates `Book` records for each angle (status: PLANNING)
   - Updates session with `generatedBookIds` and `currentStep = 2`
   - Returns `{ sessionId, bookIds, books }` with angle details

4. **`/home/z/my-project/src/app/api/agent/sessions/route.ts`**
   - GET handler returning all sessions ordered by `createdAt` desc
   - Parses all JSON fields (nicheData, competitionData, etc.) before returning
   - Returns `{ sessions: [...] }`

5. **`/home/z/my-project/src/app/api/agent/sessions/[id]/route.ts`**
   - GET handler returning single session with all parsed JSON data
   - DELETE handler removing a session
   - Both handle 404 if session not found

## Key Decisions
- All web search calls use `ZAI.create()` singleton pattern (backend only)
- JSON fields from DB are parsed before returning to client for clean API responses
- Error handling uses try/catch with proper HTTP status codes (400, 404, 500)
- `params` in Next.js 16 route handlers uses `Promise<{ id: string }>` pattern (awaited)
- Book creation uses the existing `Book` model with `status: "PLANNING"` for later pickup by the generation pipeline
