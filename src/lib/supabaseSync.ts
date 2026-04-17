/**
 * Supabase Sync Module
 *
 * Syncs local SQLite data with Supabase cloud database.
 * - Every write to local DB triggers an async sync to Supabase
 * - Can restore data from Supabase if local DB is lost
 * - File storage in Supabase Storage bucket (PDF, EPUB, MOBI, covers)
 *
 * All communication goes through HTTPS REST API (port 443).
 */

import { getSupabase, isSupabaseConfigured } from "./supabaseClient";
import { readFile, stat, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

// ─── Auto-create tables if they don't exist ───────────────────────────

let tablesVerified = false;

async function ensureTables(): Promise<boolean> {
  if (tablesVerified) return true;
  const sb = getSupabase();
  if (!sb) return false;

  // Try a simple query to check if tables exist
  const { error } = await sb.from("books").select("id").limit(1);
  if (!error) {
    tablesVerified = true;
    return true;
  }

  // Tables don't exist — we can't create them via REST API
  // The user needs to run the SQL setup script in Supabase dashboard
  if (error.code === "PGRST205" || error.message.includes("Could not find")) {
    console.warn("[Supabase] Tables don't exist yet. Please run the SQL setup script in Supabase Dashboard → SQL Editor.");
    console.warn("[Supabase] See the setup instructions in the app or check console for SQL.");
    return false;
  }

  console.error("[Supabase] Table check error:", error.message);
  return false;
}

// ─── Book Sync ────────────────────────────────────────────────────────

export interface SyncBookData {
  id: string;
  userId: string | null;
  prompt: string;
  audience: string;
  tone: string;
  lengthHint: string;
  status: string;
  title: string | null;
  subtitle: string | null;
  tocJson: string | null;
  phasesJson: string | null;
  errorMessage: string | null;
  epubPath: string | null;
  pdfPath: string | null;
  tokenUsageJson: string | null;
  metadataJson: string | null;
  language: string;
  mobiPath: string | null;
  pdfTemplate: string;
  coverImagePath: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Convert camelCase book fields to snake_case for Supabase */
function bookToRow(b: SyncBookData): Record<string, unknown> {
  return {
    id: b.id,
    user_id: b.userId,
    prompt: b.prompt,
    audience: b.audience,
    tone: b.tone,
    length_hint: b.lengthHint,
    status: b.status,
    title: b.title,
    subtitle: b.subtitle,
    toc_json: b.tocJson,
    phases_json: b.phasesJson,
    error_message: b.errorMessage,
    epub_path: b.epubPath,
    pdf_path: b.pdfPath,
    token_usage_json: b.tokenUsageJson,
    metadata_json: b.metadataJson,
    language: b.language,
    mobi_path: b.mobiPath,
    pdf_template: b.pdfTemplate,
    cover_image_path: b.coverImagePath,
    created_at: b.createdAt,
    completed_at: b.completedAt,
  };
}

/** Convert snake_case Supabase row to camelCase */
function rowToBook(row: Record<string, unknown>): SyncBookData {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    prompt: row.prompt as string,
    audience: (row.audience as string) ?? "General readers",
    tone: (row.tone as string) ?? "Informative and engaging",
    lengthHint: (row.length_hint as string) ?? "Medium (8-12 chapters)",
    status: (row.status as string) ?? "PLANNING",
    title: (row.title as string) ?? null,
    subtitle: (row.subtitle as string) ?? null,
    tocJson: (row.toc_json as string) ?? null,
    phasesJson: (row.phases_json as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    epubPath: (row.epub_path as string) ?? null,
    pdfPath: (row.pdf_path as string) ?? null,
    tokenUsageJson: (row.token_usage_json as string) ?? null,
    metadataJson: (row.metadata_json as string) ?? null,
    language: (row.language as string) ?? "en",
    mobiPath: (row.mobi_path as string) ?? null,
    pdfTemplate: (row.pdf_template as string) ?? "professional",
    coverImagePath: (row.cover_image_path as string) ?? null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) ?? null,
  };
}

// ─── Chapter Sync ─────────────────────────────────────────────────────

export interface SyncChapterData {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  outline: string | null;
  markdown: string | null;
  status: string;
  generatedAt: string | null;
  editedAt: string | null;
}

function chapterToRow(ch: SyncChapterData): Record<string, unknown> {
  return {
    id: ch.id,
    book_id: ch.bookId,
    chapter_number: ch.chapterNumber,
    title: ch.title,
    outline: ch.outline,
    markdown: ch.markdown,
    status: ch.status,
    generated_at: ch.generatedAt,
    edited_at: ch.editedAt,
  };
}

function rowToChapter(row: Record<string, unknown>): SyncChapterData {
  return {
    id: row.id as string,
    bookId: row.book_id as string,
    chapterNumber: row.chapter_number as number,
    title: row.title as string,
    outline: (row.outline as string) ?? null,
    markdown: (row.markdown as string) ?? null,
    status: (row.status as string) ?? "PENDING",
    generatedAt: (row.generated_at as string) ?? null,
    editedAt: (row.edited_at as string) ?? null,
  };
}

// ─── Public API: Data Sync ────────────────────────────────────────────

/** Sync a single book to Supabase (upsert) */
export async function syncBookToCloud(book: SyncBookData): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const ready = await ensureTables();
  if (!ready) return false;

  const sb = getSupabase()!;
  const { error } = await sb
    .from("books")
    .upsert(bookToRow(book), { onConflict: "id" });

  if (error) {
    console.error("[Supabase] syncBookToCloud error:", error.message);
    return false;
  }
  return true;
}

/** Sync a single chapter to Supabase (upsert) */
export async function syncChapterToCloud(chapter: SyncChapterData): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const ready = await ensureTables();
  if (!ready) return false;

  const sb = getSupabase()!;
  const { error } = await sb
    .from("chapters")
    .upsert(chapterToRow(chapter), { onConflict: "id" });

  if (error) {
    console.error("[Supabase] syncChapterToCloud error:", error.message);
    return false;
  }
  return true;
}

/** Sync all chapters for a book to Supabase */
export async function syncChaptersToCloud(chapters: SyncChapterData[]): Promise<boolean> {
  if (!isSupabaseConfigured() || chapters.length === 0) return false;
  const ready = await ensureTables();
  if (!ready) return false;

  const sb = getSupabase()!;
  const rows = chapters.map(chapterToRow);
  const { error } = await sb
    .from("chapters")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("[Supabase] syncChaptersToCloud error:", error.message);
    return false;
  }
  return true;
}

/** Fetch all books from Supabase cloud */
export async function fetchBooksFromCloud(): Promise<SyncBookData[]> {
  if (!isSupabaseConfigured()) return [];
  const ready = await ensureTables();
  if (!ready) return [];

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[Supabase] fetchBooksFromCloud error:", error?.message);
    return [];
  }
  return data.map(rowToBook);
}

/** Fetch a single book with its chapters from Supabase */
export async function fetchBookFromCloud(bookId: string): Promise<{ book: SyncBookData; chapters: SyncChapterData[] } | null> {
  if (!isSupabaseConfigured()) return null;
  const ready = await ensureTables();
  if (!ready) return null;

  const sb = getSupabase()!;
  const [bookRes, chaptersRes] = await Promise.all([
    sb.from("books").select("*").eq("id", bookId).single(),
    sb.from("chapters").select("*").eq("book_id", bookId).order("chapter_number"),
  ]);

  if (bookRes.error || !bookRes.data) {
    console.error("[Supabase] fetchBookFromCloud error:", bookRes.error?.message);
    return null;
  }

  return {
    book: rowToBook(bookRes.data),
    chapters: (chaptersRes.data ?? []).map(rowToChapter),
  };
}

/** Delete a book and its files from Supabase */
export async function deleteBookFromCloud(bookId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const sb = getSupabase()!;

  // Delete files from storage first
  await deleteBookFilesFromCloud(bookId);

  // Delete book_files records
  await sb.from("book_files").delete().eq("book_id", bookId);

  // Delete book (chapters cascade)
  const { error } = await sb.from("books").delete().eq("id", bookId);
  if (error) {
    console.error("[Supabase] deleteBookFromCloud error:", error.message);
    return false;
  }
  return true;
}

/** Get Supabase sync status */
export async function getSupabaseStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  bookCount: number;
  tableExists: boolean;
  storageBucketExists: boolean;
}> {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return { configured: false, connected: false, bookCount: 0, tableExists: false, storageBucketExists: false };
  }

  const sb = getSupabase()!;
  const { data, error } = await sb.from("books").select("id", { count: "exact", head: true });

  // Check storage bucket
  let storageBucketExists = false;
  try {
    const { data: buckets } = await sb.storage.listBuckets();
    storageBucketExists = buckets?.some((b) => b.name === "book-exports") ?? false;
  } catch {
    // Storage might not be accessible
  }

  if (error) {
    const tableExists = !error.message.includes("Could not find");
    return { configured: true, connected: false, bookCount: 0, tableExists, storageBucketExists };
  }

  return {
    configured: true,
    connected: true,
    bookCount: data?.length ?? 0,
    tableExists: true,
    storageBucketExists,
  };
}

// ─── File Storage API ────────────────────────────────────────────────

const STORAGE_BUCKET = "book-exports";

/** Upload a file to Supabase Storage */
export async function uploadFileToCloud(
  bookId: string,
  fileType: "pdf" | "epub" | "mobi" | "cover",
  localFilePath: string
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase()!;

  try {
    // Read the file
    if (!existsSync(localFilePath)) {
      console.warn(`[Supabase] File not found for upload: ${localFilePath}`);
      return null;
    }

    const fileBuffer = await readFile(localFilePath);
    const fileStat = await stat(localFilePath);

    // Determine content type
    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      epub: "application/epub+zip",
      mobi: "application/x-mobipocket-ebook",
      cover: "image/png",
    };

    // Build storage path: {bookId}/{fileType}.{ext}
    const extensions: Record<string, string> = {
      pdf: "pdf",
      epub: "epub",
      mobi: "mobi",
      cover: "png",
    };
    const storagePath = `${bookId}/${fileType}.${extensions[fileType]}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: contentTypes[fileType],
        upsert: true,
      });

    if (uploadError) {
      console.error("[Supabase] File upload error:", uploadError.message);
      return null;
    }

    // Record in book_files table
    const { error: dbError } = await sb
      .from("book_files")
      .upsert(
        {
          book_id: bookId,
          file_type: fileType,
          storage_path: storagePath,
          file_size: fileStat.size,
          content_type: contentTypes[fileType],
        },
        { onConflict: "book_id,file_type" }
      );

    if (dbError) {
      console.warn("[Supabase] book_files record error (non-critical):", dbError.message);
    }

    console.log(`[Supabase] Uploaded ${fileType} for book ${bookId} (${(fileStat.size / 1024).toFixed(1)} KB)`);
    return storagePath;
  } catch (err) {
    console.error("[Supabase] uploadFileToCloud error:", err);
    return null;
  }
}

/** Get a signed URL for downloading a file from Supabase Storage */
export async function getFileSignedUrl(
  bookId: string,
  fileType: "pdf" | "epub" | "mobi" | "cover"
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase()!;

  try {
    // Look up the storage path from book_files table
    const { data: fileRecord, error: dbError } = await sb
      .from("book_files")
      .select("storage_path")
      .eq("book_id", bookId)
      .eq("file_type", fileType)
      .single();

    if (dbError || !fileRecord) {
      // Fallback: try standard path
      const extensions: Record<string, string> = { pdf: "pdf", epub: "epub", mobi: "mobi", cover: "png" };
      const fallbackPath = `${bookId}/${fileType}.${extensions[fileType]}`;
      const { data, error } = await sb.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(fallbackPath, 3600); // 1 hour

      if (error || !data) return null;
      return data.signedUrl;
    }

    const { data, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fileRecord.storage_path, 3600);

    if (error || !data) return null;
    return data.signedUrl;
  } catch (err) {
    console.error("[Supabase] getFileSignedUrl error:", err);
    return null;
  }
}

/** Download a file from Supabase Storage to local filesystem */
export async function downloadFileFromCloud(
  bookId: string,
  fileType: "pdf" | "epub" | "mobi" | "cover",
  localDir: string
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase()!;

  try {
    const extensions: Record<string, string> = { pdf: "pdf", epub: "epub", mobi: "mobi", cover: "png" };
    const storagePath = `${bookId}/${fileType}.${extensions[fileType]}`;

    const { data, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (error || !data) {
      console.error("[Supabase] File download error:", error?.message);
      return null;
    }

    // Ensure directory exists
    if (!existsSync(localDir)) {
      await mkdir(localDir, { recursive: true });
    }

    // Write to local filesystem
    const localPath = join(localDir, `${fileType}.${extensions[fileType]}`);
    const arrayBuffer = await data.arrayBuffer();
    const { writeFile } = await import("fs/promises");
    await writeFile(localPath, Buffer.from(arrayBuffer));

    console.log(`[Supabase] Downloaded ${fileType} for book ${bookId} to ${localPath}`);
    return localPath;
  } catch (err) {
    console.error("[Supabase] downloadFileFromCloud error:", err);
    return null;
  }
}

/** Delete all files for a book from Supabase Storage */
export async function deleteBookFilesFromCloud(bookId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const sb = getSupabase()!;

  try {
    // List all files in the book's folder
    const { data: files, error: listError } = await sb.storage
      .from(STORAGE_BUCKET)
      .list(bookId);

    if (listError || !files || files.length === 0) {
      return true; // No files to delete
    }

    // Delete all files
    const filePaths = files.map((f) => `${bookId}/${f.name}`);
    const { error: deleteError } = await sb.storage
      .from(STORAGE_BUCKET)
      .remove(filePaths);

    if (deleteError) {
      console.error("[Supabase] File delete error:", deleteError.message);
      return false;
    }

    console.log(`[Supabase] Deleted ${filePaths.length} files for book ${bookId}`);
    return true;
  } catch (err) {
    console.error("[Supabase] deleteBookFilesFromCloud error:", err);
    return false;
  }
}

/** Upload all export files for a completed book to Supabase Storage */
export async function syncBookFilesToCloud(book: {
  id: string;
  pdfPath: string | null;
  epubPath: string | null;
  mobiPath: string | null;
  coverImagePath: string | null;
}): Promise<{ uploaded: string[]; failed: string[] }> {
  const uploaded: string[] = [];
  const failed: string[] = [];

  const fileMap: Array<{ type: "pdf" | "epub" | "mobi" | "cover"; path: string | null }> = [
    { type: "pdf", path: book.pdfPath },
    { type: "epub", path: book.epubPath },
    { type: "mobi", path: book.mobiPath },
    { type: "cover", path: book.coverImagePath },
  ];

  for (const { type, path } of fileMap) {
    if (path && existsSync(path)) {
      const result = await uploadFileToCloud(book.id, type, path);
      if (result) {
        uploaded.push(type);
      } else {
        failed.push(type);
      }
    }
  }

  if (uploaded.length > 0) {
    console.log(`[Supabase] Synced files for book ${book.id}: uploaded=[${uploaded.join(",")}], failed=[${failed.join(",")}]`);
  }

  return { uploaded, failed };
}

// ─── Bulk Sync Operations ────────────────────────────────────────────

/** Push all local data to Supabase (full sync) */
export async function pushAllToCloud(): Promise<{
  booksSynced: number;
  chaptersSynced: number;
  filesSynced: number;
  errors: string[];
}> {
  if (!isSupabaseConfigured()) {
    return { booksSynced: 0, chaptersSynced: 0, filesSynced: 0, errors: ["Supabase not configured"] };
  }

  const errors: string[] = [];
  let booksSynced = 0;
  let chaptersSynced = 0;
  let filesSynced = 0;

  try {
    // Dynamic import to avoid circular dependencies
    const { db } = await import("./db");

    const books = await db.book.findMany({
      include: { chapters: { orderBy: { chapterNumber: "asc" } } },
    });

    for (const book of books) {
      // Sync book
      const bookOk = await syncBookToCloud({
        id: book.id,
        userId: book.userId,
        prompt: book.prompt,
        audience: book.audience,
        tone: book.tone,
        lengthHint: book.lengthHint,
        status: book.status,
        title: book.title,
        subtitle: book.subtitle,
        tocJson: book.tocJson,
        phasesJson: book.phasesJson,
        errorMessage: book.errorMessage,
        epubPath: book.epubPath,
        pdfPath: book.pdfPath,
        tokenUsageJson: book.tokenUsageJson,
        metadataJson: book.metadataJson,
        language: book.language,
        mobiPath: book.mobiPath,
        pdfTemplate: book.pdfTemplate,
        coverImagePath: book.coverImagePath,
        createdAt: book.createdAt.toISOString(),
        completedAt: book.completedAt?.toISOString() ?? null,
      });
      if (bookOk) booksSynced++;
      else errors.push(`Failed to sync book: ${book.id}`);

      // Sync chapters
      const chapterRows = book.chapters.map((ch) => ({
        id: ch.id,
        bookId: ch.bookId,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        outline: ch.outline,
        markdown: ch.markdown,
        status: ch.status,
        generatedAt: ch.generatedAt?.toISOString() ?? null,
        editedAt: ch.editedAt?.toISOString() ?? null,
      }));
      if (chapterRows.length > 0) {
        const chOk = await syncChaptersToCloud(chapterRows);
        if (chOk) chaptersSynced += chapterRows.length;
        else errors.push(`Failed to sync chapters for book: ${book.id}`);
      }

      // Sync files (only for completed books)
      if (book.status === "DONE" && (book.pdfPath || book.epubPath)) {
        const fileResult = await syncBookFilesToCloud(book);
        filesSynced += fileResult.uploaded.length;
        if (fileResult.failed.length > 0) {
          errors.push(`Some files failed for book ${book.id}: ${fileResult.failed.join(", ")}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Push error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { booksSynced, chaptersSynced, filesSynced, errors };
}

/** Pull all data from Supabase to local DB (restore) */
export async function pullAllFromCloud(): Promise<{
  booksRestored: number;
  chaptersRestored: number;
  errors: string[];
}> {
  if (!isSupabaseConfigured()) {
    return { booksRestored: 0, chaptersRestored: 0, errors: ["Supabase not configured"] };
  }

  const errors: string[] = [];
  let booksRestored = 0;
  let chaptersRestored = 0;

  try {
    const { db } = await import("./db");

    const cloudBooks = await fetchBooksFromCloud();

    for (const cloudBook of cloudBooks) {
      // Check if book already exists locally
      const existing = await db.book.findUnique({ where: { id: cloudBook.id } });

      if (existing) {
        // Update existing book (cloud wins if newer)
        await db.book.update({
          where: { id: cloudBook.id },
          data: {
            userId: cloudBook.userId,
            status: cloudBook.status,
            title: cloudBook.title,
            subtitle: cloudBook.subtitle,
            tocJson: cloudBook.tocJson,
            phasesJson: cloudBook.phasesJson,
            errorMessage: cloudBook.errorMessage,
            epubPath: cloudBook.epubPath,
            pdfPath: cloudBook.pdfPath,
            tokenUsageJson: cloudBook.tokenUsageJson,
            metadataJson: cloudBook.metadataJson,
            language: cloudBook.language,
            mobiPath: cloudBook.mobiPath,
            pdfTemplate: cloudBook.pdfTemplate,
            coverImagePath: cloudBook.coverImagePath,
            completedAt: cloudBook.completedAt ? new Date(cloudBook.completedAt) : null,
          },
        });
      } else {
        // Create new book
        await db.book.create({
          data: {
            id: cloudBook.id,
            userId: cloudBook.userId,
            prompt: cloudBook.prompt,
            audience: cloudBook.audience,
            tone: cloudBook.tone,
            lengthHint: cloudBook.lengthHint,
            status: cloudBook.status,
            title: cloudBook.title,
            subtitle: cloudBook.subtitle,
            tocJson: cloudBook.tocJson,
            phasesJson: cloudBook.phasesJson,
            errorMessage: cloudBook.errorMessage,
            epubPath: cloudBook.epubPath,
            pdfPath: cloudBook.pdfPath,
            tokenUsageJson: cloudBook.tokenUsageJson,
            metadataJson: cloudBook.metadataJson,
            language: cloudBook.language,
            mobiPath: cloudBook.mobiPath,
            pdfTemplate: cloudBook.pdfTemplate,
            coverImagePath: cloudBook.coverImagePath,
            createdAt: new Date(cloudBook.createdAt),
            completedAt: cloudBook.completedAt ? new Date(cloudBook.completedAt) : null,
          },
        });
      }
      booksRestored++;

      // Fetch and restore chapters
      const cloudData = await fetchBookFromCloud(cloudBook.id);
      if (cloudData) {
        for (const ch of cloudData.chapters) {
          const existingCh = await db.chapter.findUnique({ where: { id: ch.id } });
          if (existingCh) {
            await db.chapter.update({
              where: { id: ch.id },
              data: {
                title: ch.title,
                outline: ch.outline,
                markdown: ch.markdown,
                status: ch.status,
                generatedAt: ch.generatedAt ? new Date(ch.generatedAt) : null,
                editedAt: ch.editedAt ? new Date(ch.editedAt) : null,
              },
            });
          } else {
            await db.chapter.create({
              data: {
                id: ch.id,
                bookId: ch.bookId,
                chapterNumber: ch.chapterNumber,
                title: ch.title,
                outline: ch.outline,
                markdown: ch.markdown,
                status: ch.status,
                generatedAt: ch.generatedAt ? new Date(ch.generatedAt) : null,
                editedAt: ch.editedAt ? new Date(ch.editedAt) : null,
              },
            });
          }
          chaptersRestored++;
        }
      }
    }
  } catch (err) {
    errors.push(`Pull error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { booksRestored, chaptersRestored, errors };
}

// ─── SQL Setup Script ────────────────────────────────────────────────

/** Get the SQL setup script for first-time Supabase setup */
export function getSetupSQL(): string {
  return `-- ═══════════════════════════════════════════════════════════════
-- E-book Generator: COMPLETE Supabase Backend Setup
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════

-- ============================================
-- 1. CREATE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  prompt TEXT NOT NULL,
  audience TEXT DEFAULT 'General readers',
  tone TEXT DEFAULT 'Informative and engaging',
  length_hint TEXT DEFAULT 'Medium (8-12 chapters)',
  status TEXT DEFAULT 'PLANNING',
  title TEXT,
  subtitle TEXT,
  toc_json TEXT,
  phases_json TEXT,
  error_message TEXT,
  epub_path TEXT,
  pdf_path TEXT,
  token_usage_json TEXT,
  metadata_json TEXT,
  language TEXT DEFAULT 'en',
  mobi_path TEXT,
  pdf_template TEXT DEFAULT 'professional',
  cover_image_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INT NOT NULL,
  title TEXT NOT NULL,
  outline TEXT,
  markdown TEXT,
  status TEXT DEFAULT 'PENDING',
  generated_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ
);

-- Track which files are stored in Supabase Storage
CREATE TABLE IF NOT EXISTS book_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  content_type TEXT DEFAULT 'application/octet-stream',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, file_type)
);

-- ============================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. CREATE POLICIES (service_role = full access)
-- ============================================

CREATE POLICY "Service role full access on books" ON books
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on chapters" ON chapters
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on book_files" ON book_files
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_book_files_book_id ON book_files(book_id);
CREATE INDEX IF NOT EXISTS idx_book_files_file_type ON book_files(file_type);

-- ============================================
-- 5. CREATE STORAGE BUCKET + POLICIES
-- ============================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('book-exports', 'book-exports', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role can upload files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'book-exports' AND auth.role() = 'service_role');

CREATE POLICY "Service role can read files" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-exports' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete files" ON storage.objects
  FOR DELETE USING (bucket_id = 'book-exports' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'book-exports' AND auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- DONE! Your Supabase backend is ready.
-- Next: Go back to the app and click "Push to Cloud"
-- ═══════════════════════════════════════════════════════════════`;
}
