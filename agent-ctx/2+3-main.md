# Task 2+3 - Main Agent Work Record

## Task 1: Fix batch-generate to start the book pipeline

**File modified:** `/home/z/my-project/src/app/api/agent/batch-generate/route.ts`

**Problem:** The batch-generate route created Book records with status "PLANNING" but never called `enqueueBookJob()` to actually start the generation pipeline. Books would sit in PLANNING status forever.

**Fix:**
1. Added import: `import { enqueueBookJob } from "@/lib/jobQueue";`
2. After Step 4 (updating the session), added Step 5 that loops through `createdBooks` and calls `enqueueBookJob(book.id)` for each
3. Added 500ms delay between enqueues to avoid overwhelming the system

**Result:** Books created via batch-generate now automatically enter the full pipeline (planning → writing → editing → exporting).

---

## Task 2: Rewrite prompts for professional human-quality writing

### File 1: `/home/z/my-project/src/lib/chapterGenerator.ts` - WRITER_SYSTEM_PROMPT

Completely rewritten from a generic 10-line prompt to a comprehensive ~70-line prompt covering:
- **Voice & Personality**: Trusted mentor/smart friend persona, not textbook
- **Chapter Hooks**: Mandatory vivid anecdotes, surprising stats, provocative questions
- **Storytelling**: "Show don't tell", scenarios, case studies throughout
- **Sentence Rhythm**: Dramatic length variation, fragments for emphasis
- **Concrete Specificity**: Every claim anchored to numbers, examples, or vivid scenarios
- **Counterintuitive Insights**: Challenge common assumptions
- **AI Cliché Prohibition**: 20+ banned phrases/patterns with examples
- **Bridge Endings**: Questions/teasers instead of summary paragraphs
- Preserved `{tone}` and `{audience}` placeholders

### File 2: `/home/z/my-project/src/lib/chapterGenerator.ts` - EDITOR_SYSTEM_PROMPT

Completely rewritten from a generic 10-line prompt to a 9-point "Editing Manifesto":
1. **Exterminate AI Patterns** - Specific detection criteria for AI-generated text
2. **"So What?" Test** - Every paragraph must earn its place
3. **Abstract → Concrete** - Replacement rules with before/after examples
4. **Narrative Tension** - Provocative questions, suspense, charged statements
5. **Rhythm & Musicality** - Sentence length variation, strategic breaks
6. **Opening & Closing** - Mandatory hook + bridge (not summary)
7. **Natural Transitions** - No "Now we'll discuss..." patterns
8. **Coverage Verification** - Missing sub-topics get concrete coverage
9. **Preserve Substance** - Max 15% length reduction
- Preserved `{tone}` and `{audience}` placeholders

### File 3: `/home/z/my-project/src/lib/bookPlanner.ts` - PLANNER_SYSTEM_PROMPT

Rewritten with emphasis on compelling TOC design:
- Chapter titles must spark CURIOSITY with bad/good examples
- Sub-topics must be specific & curiosity-driven with bad/good examples
- No generic labels ("Introduction", "Conclusion") 
- TOC should read like a page-turner
- Narrative thread within each chapter's sub-topics
- Progression: hook → foundation → core insights → advanced/reveals → synthesis

---

## Verification
- `bun run lint` passes clean (0 errors, 0 warnings)
- All TypeScript compiles successfully
