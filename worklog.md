---
Task ID: 1
Agent: Main
Task: Fix Ebook Agent module bugs and test all 5 agents

Work Log:
- Diagnosed "Cannot read properties of undefined (reading 'create')" → Prisma client was stale after schema update
- Fixed by running `bun run db:push` to regenerate Prisma client with AgentSession model
- Diagnosed "Unexpected token '<'" → server crashes during API requests returning HTML error pages instead of JSON
- Found TypeScript error in cover-prompt/route.ts: `zai.images.generate()` doesn't exist → fixed to `zai.images.generations.create()`
- Fixed base64 data extraction: `imageResult.data?.[0]?.base64` instead of `imageResult.base64`
- Changed `Promise.all` to `Promise.allSettled` in niche-research, competition, and seo-optimize routes for resilience
- Added global error handler in `src/instrumentation.ts` to prevent uncaught exceptions from crashing the server
- Removed Prisma query logging (`log: ['query']`) from db.ts for better performance
- Fixed ESLint warnings: renamed Lucide `Image` import to `ImageIcon` in ebook-agent-view.tsx
- Tested all 5 agents successfully:
  - Agent 1 (Niche Research): ✅ Returns profitability/demand/competition/potential scores + sub-niche suggestions
  - Agent 2 (Competition Research): ✅ Returns competitor list, pricing, market gaps, suggested angles
  - Agent 2b (Batch Generate): ✅ Creates book records with unique angles based on competition analysis
  - Agent 3 (Quality Assessment): ✅ Evaluates books on 6 criteria, returns scores + strengths/suggestions
  - Agent 4 (SEO & Sales Prep): ✅ Generates SEO titles, descriptions, tags, keywords, pricing, Payhip checklist
  - Agent 5 (Cover Prompt): ✅ Generates AI image prompts + 3 style options + actual image generation works (128KB PNG saved)
- Server stability: using `node node_modules/.bin/next dev -p 3000` instead of `bun run dev` for stability

Stage Summary:
- All 5 Ebook Agent APIs are functional and tested
- Cover image generation works correctly with z-ai-web-dev-sdk
- API routes are resilient to web search failures (Promise.allSettled)
- Global error handler prevents server crashes from unhandled rejections
- Lint passes clean (0 errors, 0 warnings)

---
Task ID: 2+3
Agent: Main
Task: Fix batch-generate pipeline start + Rewrite Writer/Editor/Planner prompts for human-quality writing

Work Log:

### Task 1: Fix batch-generate to start the book pipeline
- Identified that `/src/app/api/agent/batch-generate/route.ts` created Book records but never called `enqueueBookJob()` to start the generation pipeline (planning → writing → editing → exporting)
- Added import: `import { enqueueBookJob } from "@/lib/jobQueue";`
- Added Step 5 after book creation: loops through `createdBooks` and calls `enqueueBookJob(book.id)` for each
- Added 500ms delay between each enqueue to avoid overwhelming the system
- Books created via batch-generate will now automatically proceed through the full pipeline

### Task 2: Rewrite Writer and Editor prompts for professional human-quality writing
- Completely rewrote `WRITER_SYSTEM_PROMPT` in `/src/lib/chapterGenerator.ts`:
  - Personality-driven voice: "trusted mentor / smart friend" persona (not textbook)
  - Mandatory chapter hooks: vivid anecdotes, surprising stats, provocative questions
  - Storytelling throughout: "show don't tell", scenarios, case studies
  - Sentence rhythm rules: dramatic length variation, fragments for emphasis
  - Concrete specificity: every claim needs a number, example, or vivid scenario
  - Counterintuitive insights: challenge common assumptions
  - Comprehensive AI cliché prohibition list (20+ banned phrases/patterns)
  - Bridge endings instead of summary paragraphs
  - Kept `{tone}` and `{audience}` placeholders

- Completely rewrote `EDITOR_SYSTEM_PROMPT` in `/src/lib/chapterGenerator.ts`:
  - 9-point "Editing Manifesto" instead of generic guidelines
  - AI pattern extermination with specific detection criteria
  - "So what?" test for every paragraph
  - Abstract→Concrete replacement rules with examples
  - Narrative tension requirements
  - Rhythm and musicality checks
  - Mandatory hook opening and bridge closing
  - Natural transition enforcement (no "Now we'll discuss...")
  - Coverage verification with depth requirements
  - Substance preservation rule (max 15% reduction)
  - Kept `{tone}` and `{audience}` placeholders

- Rewrote `PLANNER_SYSTEM_PROMPT` in `/src/lib/bookPlanner.ts`:
  - Chapter titles must be COMPELLING & INTRIGUING with bad/good examples
  - Sub-topics must be specific & curiosity-driven with bad/good examples
  - No generic labels ("Introduction", "Conclusion") — replaced with irresistible alternatives
  - TOC should read like a page-turner
  - Narrative thread within each chapter's sub-topics
  - Logical progression: hook → foundation → core insights → advanced/reveals → synthesis

### Verification
- `bun run lint` passes clean (0 errors, 0 warnings)
- All changes compile successfully

Stage Summary:
- Batch-generate now starts the full generation pipeline automatically
- Writer, Editor, and Planner prompts completely rewritten for human-quality, engaging writing
- AI clichés comprehensively banned and detected
- Prompts emphasize storytelling, specificity, rhythm, and reader engagement

---
Task ID: 4
Agent: Main
Task: Rewrite the EbookAgentView component with progress tracking, animations, and book generation status

Work Log:

### Major Rewrite of `/src/components/ebook-agent-view.tsx`

1. **Book Generation Progress Polling**
   - Added `BookProgress` interface with id, title, status, progress%, currentPhase, doneChapters, totalChapters, errorMessage, angle
   - Added `useEffect` in main component that polls `/api/books/{id}` for each book every 3 seconds
   - Polling starts when `generatedBookIds` is set, stops when all books are DONE or FAILED
   - Added `computeBookProgress()` helper to derive progress percentage and phase from API data (PLANNING→10%, WRITING→20-80% based on chapter completion, EXPORTING→85%, DONE→100%)
   - Added `allBooksDone` and `showCelebration` state flags

2. **Animated Loader Component (AgentLoader)**
   - Shows spinning icon + rotating status messages that cycle every 2 seconds
   - Each step has custom contextual messages (e.g., "Searching competitor listings...", "Analyzing pricing strategies...")
   - Uses `anim-rotate-msg` keyframe for smooth message transitions

3. **CSS Keyframe Animations** (injected via `<style>` tag)
   - `agent-fade-in`: opacity 0→1, translateY(10px→0)
   - `agent-slide-in`: translateX(-20px→0)
   - `agent-pulse-glow`: box-shadow pulse for active sidebar items and step indicators
   - `agent-shimmer`: background shimmer for loading placeholders
   - `agent-confetti-fall`: confetti pieces falling animation
   - `agent-progress-pulse`: opacity pulse for active progress bars
   - `agent-celebrate-bounce`: scale bounce for celebration card
   - `agent-rotate-msg`: fade/slide transition for rotating messages
   - All animations use `agent-` prefix to avoid conflicts

4. **Book Progress Cards (BookProgressCard)**
   - Replaced simple ID list with rich progress cards showing:
     - Book emoji (📗📘📕 based on status) + title
     - Angle description from prompt
     - Color-coded status badge (DONE/FAILED/Planning/Writing/Exporting)
     - Animated progress bar with percentage
     - Phase pipeline: ✓ Planning → ◐ Writing → ○ Exporting → Done (with icons)
     - Chapter grid showing completion (✓ done, pulsing current, numbered pending)
     - Error message display for FAILED books
     - "View Book" button when DONE

5. **Overall Progress Bar (OverallProgressBar)**
   - Shows at top of main content area
   - Displays step description + overall percentage
   - Uses shadcn Progress component
   - Step dots with icons showing completed/current/accessible states
   - Pulsing glow animation on current step

6. **Celebration Effect**
   - When all books reach DONE status, a celebration card appears with:
     - ConfettiEffect component (30 falling colored pieces)
     - PartyPopper icon + success message
     - "Evaluate Quality" and "Dismiss" buttons
   - Confetti uses CSS animations with randomized positions, delays, colors

7. **Enhanced Animations Throughout**
   - Staggered `anim-fade-in` with delays on cards, stats, score bars
   - `anim-slide-in` on competitor items and sub-sections
   - `anim-shimmer` on placeholder loading cards before progress data loads
   - `anim-pulse-glow` on active sidebar items and step dots
   - Smooth progress bar transitions (duration-700)

8. **All Existing Functionality Preserved**
   - Step 1: Niche Research (dropdowns, custom input, score bars, suggested sub-niches)
   - Step 2: Competition + Batch Generate (stats, competitors, market gaps, angles, book count)
   - Step 3: Quality Assessment (score bars, strengths, suggestions, view button)
   - Step 4: SEO & Sales (titles, descriptions, tags, keywords, pricing, checklist, copy buttons)
   - Step 5: Cover Image (prompts, style options, image generation, download)

### New Imports Added
- `useEffect`, `useRef` from React
- `Circle`, `HalfCircle`, `Zap`, `PartyPopper`, `PenLine`, `FileOutput`, `Brain`, `AlertCircle` from lucide-react

### State Changes
- Added to `AgentState`: `bookProgress: BookProgress[]`, `allBooksDone: boolean`, `showCelebration: boolean`
- Step2Competition receives new props: `bookProgress`, `allBooksDone`, `showCelebration`, `onOpenBook`, `onDismissCelebration`

### Verification
- `bun run lint` passes clean (0 errors, 0 warnings)
- Dev server running without errors
- All 5 steps preserved with identical API calls
