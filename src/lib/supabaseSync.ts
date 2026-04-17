/**
 * Supabase Sync Module
 *
 * Syncs local SQLite data with Supabase cloud database.
 * - Every write to local DB triggers an async sync to Supabase
 * - Can restore data from Supabase if local DB is lost
 * - Tables are auto-created on first sync if they don't exist
 *
 * All communication goes through HTTPS REST API (port 443).
 */

import { getSupabase, isSupabaseConfigured } from "./supabaseClient";

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

// ─── Public API ───────────────────────────────────────────────────────

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

/** Delete a book from Supabase */
export async function deleteBookFromCloud(bookId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const sb = getSupabase()!;
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
}> {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return { configured: false, connected: false, bookCount: 0, tableExists: false };
  }

  const sb = getSupabase()!;
  const { data, error } = await sb.from("books").select("id", { count: "exact", head: true });

  if (error) {
    const tableExists = !error.message.includes("Could not find");
    return { configured: true, connected: false, bookCount: 0, tableExists };
  }

  return {
    configured: true,
    connected: true,
    bookCount: data?.length ?? 0,
    tableExists: true,
  };
}

/** Get the SQL setup script for first-time table creation */
export function getSetupSQL(): string {
  return `-- E-book Generator: Supabase Tables Setup
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
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

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on books" ON books FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on chapters" ON chapters FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);`;
}
