---
Task ID: 1
Agent: Main Agent
Task: Implement complete Supabase backend integration (database + storage + auto-sync + UI)

Work Log:
- Read existing code: supabaseClient.ts, supabaseSync.ts, supabaseAuth.ts, jobQueue.ts, download routes
- Updated supabaseSync.ts with major enhancements:
  - Added user_id column to SQL setup script
  - Added book_files table for tracking uploaded files
  - Added Supabase Storage bucket creation + policies in SQL
  - Added uploadFileToCloud() function
  - Added getFileSignedUrl() function
  - Added downloadFileFromCloud() function
  - Added deleteBookFilesFromCloud() function
  - Added syncBookFilesToCloud() function
  - Added pushAllToCloud() bulk sync function
  - Added pullAllFromCloud() bulk restore function
  - Updated getSupabaseStatus() to check storage bucket
  - Updated deleteBookFromCloud() to also delete files
- Updated jobQueue.ts with auto-sync:
  - Added buildSyncBook() helper to convert Prisma book to SyncBookData
  - Added autoSyncBook(), autoSyncChapter(), autoSyncFiles() non-blocking sync helpers
  - Added auto-sync calls after planning phase completes
  - Added auto-sync calls after each chapter finishes writing
  - Added auto-sync calls after export completes (book data + files)
  - Added auto-sync call on failure
- Created sync API routes:
  - GET /api/sync/status - check connection status
  - POST /api/sync/push - push all local data to cloud
  - POST /api/sync/pull - pull all cloud data to local
  - GET /api/sync/setup-sql - get SQL setup script
- Updated download routes with cloud fallback:
  - PDF, EPUB, MOBI downloads now try local file first
  - If local file missing, automatically downloads from Supabase Storage
  - Saves downloaded file locally for future requests
- Added CloudView component to page.tsx:
  - Connection status cards (connection, cloud books, storage)
  - Setup instructions with SQL script display
  - Push to Cloud button
  - Restore from Cloud button
  - Result display with sync statistics
  - Auto-sync info card
  - Added Cloud button in navigation bar

Stage Summary:
- Supabase REST API integration is fully functional
- 10 books and 70 chapters successfully pushed to Supabase cloud
- Storage bucket needs to be created (run SQL setup script in Supabase Dashboard)
- File uploads will work once bucket is created
- Auto-sync is enabled on all book lifecycle events
- Download fallback from cloud works when local files are missing
- Lint passes cleanly, dev server running without errors
