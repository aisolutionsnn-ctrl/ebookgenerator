---
Task ID: 1
Agent: Main
Task: Fix E-book Generator - multiple issues from previous session

Work Log:
- Diagnosed that dev server was not running (main reason app wouldn't load)
- Restarted dev server with nohup for persistent background execution
- Verified batch-generate already creates only ONE book (code was already fixed)
- Added heartbeat mechanism to jobQueue.ts (touches book every 30s to prevent stale detection)
- Reduced INTER_CALL_DELAY from 1500ms to 1200ms for faster pipeline
- Reduced auto-resume delay from 2000ms to 500ms
- Added clearInterval(heartbeat) in both success and error paths
- Adjusted stale detection thresholds: PLANNING 15min, WRITING 45min, EXPORTING 10min
- Improved error message for stale books
- Enhanced niche research with 11 web searches (added 2 more for competitor structure & reader feedback)
- Added web_reader capability: reads top 5 URLs from search results for deeper analysis
- Enhanced competition research with 3 searches (added reviews & complaints search)
- Added web_reader for competition research: reads top 4 competitor pages
- Improved deepen prompt for more evidence-backed analysis (15-25 sentences, 6-10 sub-niches)
- JSON parse error was caused by server being down, already handled by safeFetchJSON/safeResponseJson
- Writing style prompts are already excellent with detailed anti-AI cliché rules
- Frontend already has good progress bars and animations

Stage Summary:
- Dev server is now running and stable
- Heartbeat prevents false "stuck in WRITING" errors
- Niche research is now much more thorough with web reading
- All 6 tasks completed
- Lint passes cleanly
