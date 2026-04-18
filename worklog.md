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
