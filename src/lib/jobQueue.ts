/**
 * Job Queue & Orchestration Module (MVP)
 *
 * Manages the full e-book generation pipeline:
 *   Phase 1: Planning  — generate title, subtitle, ToC + metadata
 *   Phase 2: Writing   — generate each chapter (Writer + Editor)
 *   Phase 3: Exporting — produce EPUB, PDF, MOBI + cover image
 *
 * Features:
 *   - Resume capability: if a job fails, it can be resumed from where it left off
 *   - Rate-limit protection: configurable delay between LLM calls
 *   - Token tracking: records token usage for cost estimation
 *   - Multi-language support via i18n module
 *   - Auto metadata generation (keywords, abstract, copyright)
 *   - Book cover generation (AI image)
 *   - PDF template selection
 *
 * MVP note: In-memory queue. For production, use BullMQ + Redis.
 */

import { db } from "./db";
import { planBook, type ChapterOutline } from "./bookPlanner";
import {
  generateChapterDraft,
  editChapterDraft,
  summarizeChapter,
  type BookContext,
} from "./chapterGenerator";
import { exportToEpub, type EpubMetadata } from "./exportEpub";
import { exportToPdf } from "./exportPdf";
import { exportToMobi, isCalibreAvailable } from "./exportMobi";
import { generateBookMetadata } from "./metadataGenerator";
import { generateBookCover } from "./coverGenerator";
import { createTokenTracker, TokenTracker } from "./tokenTracker";
import { type LanguageCode } from "./i18n";
import { type PdfTemplate } from "./pdfTemplates";
import { join } from "path";
import { syncBookToCloud, syncChapterToCloud, syncBookFilesToCloud, type SyncBookData, type SyncChapterData } from "./supabaseSync";

// ─── Config ───────────────────────────────────────────────────────────

/** Delay between LLM calls to avoid rate limits (ms) */
const INTER_CALL_DELAY = 1_500;

// ─── Types ────────────────────────────────────────────────────────────

interface Phases {
  planning: boolean;
  writing: boolean;
  exporting: boolean;
}

// ─── In-Memory Queue (MVP) ───────────────────────────────────────────

type JobFn = () => Promise<void>;

const queue: JobFn[] = [];
let isProcessing = false;

/** Track which book IDs are currently being processed */
const activeBookIds = new Set<string>();

export function isBookBeingProcessed(bookId: string): boolean {
  return activeBookIds.has(bookId);
}

export function enqueueBookJob(bookId: string): void {
  const job: JobFn = async () => {
    activeBookIds.add(bookId);
    try {
      await runBookPipeline(bookId);
    } finally {
      activeBookIds.delete(bookId);
    }
  };
  queue.push(job);
  console.log(`[JobQueue] Enqueued book job: ${bookId} (queue size: ${queue.length})`);
  processQueue();
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  if (queue.length === 0) return;

  isProcessing = true;
  const job = queue.shift()!;

  try {
    await job();
  } catch (err) {
    console.error("[JobQueue] Job failed with error:", err);
  } finally {
    isProcessing = false;
    processQueue();
  }
}

/**
 * Auto-resume: On module load, find any books stuck in active statuses
 * (PLANNING/WRITING/EXPORTING) and re-enqueue them.
 * This handles the case where the server restarts and the in-memory
 * queue is lost, leaving books stuck forever.
 */
async function autoResumeStuckBooks(): Promise<void> {
  try {
    const stuckBooks = await db.book.findMany({
      where: {
        status: { in: ["PLANNING", "WRITING", "EXPORTING"] },
      },
      select: { id: true, status: true, title: true },
    });

    if (stuckBooks.length === 0) return;

    console.log(`[JobQueue] Auto-resuming ${stuckBooks.length} stuck book(s) on startup...`);
    for (const book of stuckBooks) {
      // Reset any mid-process chapters back to PENDING
      await db.chapter.updateMany({
        where: { bookId: book.id, status: { in: ["GENERATING", "EDITING"] } },
        data: { status: "PENDING" },
      });
      enqueueBookJob(book.id);
      console.log(`[JobQueue] Auto-resumed book ${book.id} (was ${book.status}: "${book.title || 'untitled'}")`);
    }
  } catch (err) {
    console.error("[JobQueue] Auto-resume failed:", err);
  }
}

// Run auto-resume on module load (with a small delay to let DB initialize)
setTimeout(autoResumeStuckBooks, 2000);

// ─── Pipeline ─────────────────────────────────────────────────────────

async function runBookPipeline(bookId: string): Promise<void> {
  console.log(`[Pipeline] Starting book generation: ${bookId}`);

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) {
    console.error(`[Pipeline] Book not found: ${bookId}`);
    return;
  }

  const tracker = createTokenTracker();
  const language = (book.language || "en") as LanguageCode;
  const pdfTemplate = (book.pdfTemplate || "professional") as PdfTemplate;

  try {
    // ── Reset stale chapter statuses ────────────────────────
    await db.chapter.updateMany({
      where: { bookId, status: { in: ["GENERATING", "EDITING"] } },
      data: { status: "PENDING" },
    });

    const existingChapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
    });

    const hasPlan = !!book.tocJson && !!book.title;
    const doneChapterNums = existingChapters
      .filter((c) => c.status === "DONE" && c.markdown)
      .map((c) => c.chapterNumber);
    const allChaptersDone =
      existingChapters.length > 0 &&
      existingChapters.every((c) => c.status === "DONE");

    console.log(`[Pipeline] hasPlan=${hasPlan}, doneChapters=[${doneChapterNums.join(",")}], language=${language}, pdfTemplate=${pdfTemplate}`);

    let plan: { title: string; subtitle: string; toc: ChapterOutline[] };

    // ── Phase 1: Planning ──────────────────────────────────
    if (hasPlan) {
      plan = {
        title: book.title!,
        subtitle: book.subtitle ?? "",
        toc: JSON.parse(book.tocJson!),
      };
      console.log(`[Pipeline] Resuming with existing plan: "${plan.title}"`);
    } else {
      await updatePhases(bookId, { planning: true, writing: false, exporting: false });
      await updateStatus(bookId, "PLANNING");

      plan = await planBook(
        `${book.prompt}\n\nTarget audience: ${book.audience}\nTone: ${book.tone}\nDesired length: ${book.lengthHint}`,
        { language }
      );

      await db.book.update({
        where: { id: bookId },
        data: {
          title: plan.title,
          subtitle: plan.subtitle,
          tocJson: JSON.stringify(plan.toc),
          tokenUsageJson: tracker.toJSON(),
        },
      });

      // Create chapter records
      for (let i = 0; i < plan.toc.length; i++) {
        const ch = plan.toc[i];
        const exists = existingChapters.some((ec) => ec.chapterNumber === i + 1);
        if (!exists) {
          await db.chapter.create({
            data: {
              bookId,
              chapterNumber: i + 1,
              title: ch.chapterTitle,
              outline: ch.subTopics.join("\n"),
              status: "PENDING",
            },
          });
        }
      }

      // Touch book to indicate planning phase made progress
      await touchBook(bookId);

      // T19: Auto-generate metadata
      try {
        const metadata = await generateBookMetadata(
          plan.title, plan.subtitle, JSON.stringify(plan.toc), book.prompt, language
        );
        await db.book.update({
          where: { id: bookId },
          data: { metadataJson: JSON.stringify(metadata) },
        });
        await delay(INTER_CALL_DELAY);
      } catch (err) {
        console.warn("[Pipeline] Metadata generation failed (non-critical):", err);
      }

      console.log(`[Pipeline] Plan complete: "${plan.title}" with ${plan.toc.length} chapters`);

      // Auto-sync: push updated book + new chapters to Supabase
      const bookAfterPlan = await db.book.findUnique({ where: { id: bookId } });
      if (bookAfterPlan) autoSyncBook(buildSyncBook(bookAfterPlan));
      const newChapters = await db.chapter.findMany({ where: { bookId } });
      for (const ch of newChapters) {
        autoSyncChapter({
          id: ch.id, bookId: ch.bookId, chapterNumber: ch.chapterNumber,
          title: ch.title, outline: ch.outline, markdown: ch.markdown,
          status: ch.status, generatedAt: ch.generatedAt?.toISOString() ?? null,
          editedAt: ch.editedAt?.toISOString() ?? null,
        });
      }

      await delay(INTER_CALL_DELAY);
    }

    // ── Phase 2: Writing ───────────────────────────────────
    if (!allChaptersDone) {
      await updatePhases(bookId, { planning: true, writing: true, exporting: false });
      await updateStatus(bookId, "WRITING");

      const context: BookContext = {
        title: plan.title,
        subtitle: plan.subtitle,
        audience: book.audience,
        tone: book.tone,
        language,
      };

      // Build summaries from already-done chapters
      const chapterSummaries: string[] = [];
      for (const doneNum of doneChapterNums) {
        const doneCh = existingChapters.find((c) => c.chapterNumber === doneNum);
        if (doneCh?.markdown) {
          const summary = await summarizeChapter(doneCh.title, doneCh.markdown);
          chapterSummaries.push(summary);
          await delay(INTER_CALL_DELAY);
        }
      }

      // Generate remaining chapters (with retry logic per chapter)
      const MAX_CHAPTER_RETRIES = 2;

      for (let i = 0; i < plan.toc.length; i++) {
        const chapterOutline = plan.toc[i];
        const chapterNum = i + 1;

        if (doneChapterNums.includes(chapterNum)) {
          console.log(`[Pipeline] Skipping chapter ${chapterNum} (already done)`);
          continue;
        }

        let chapterSucceeded = false;
        for (let attempt = 1; attempt <= MAX_CHAPTER_RETRIES; attempt++) {
          try {
            await db.chapter.updateMany({
              where: { bookId, chapterNumber: chapterNum },
              data: { status: "GENERATING" },
            });

            console.log(`[Pipeline] Generating chapter ${chapterNum}/${plan.toc.length}: "${chapterOutline.chapterTitle}"${attempt > 1 ? ` (attempt ${attempt})` : ""}`);

            // Writer pass
            const draft = await generateChapterDraft(context, chapterOutline, chapterNum, chapterSummaries);
            tracker.recordEstimated("writing", JSON.stringify(chapterOutline), draft);
            await delay(INTER_CALL_DELAY);

            // Editor pass
            await db.chapter.updateMany({
              where: { bookId, chapterNumber: chapterNum },
              data: { status: "EDITING" },
            });

            const edited = await editChapterDraft(context, chapterOutline, chapterNum, draft);
            tracker.recordEstimated("editing", draft, edited);
            await delay(INTER_CALL_DELAY);

            // Save the edited markdown
            await db.chapter.updateMany({
              where: { bookId, chapterNumber: chapterNum },
              data: {
                markdown: edited,
                status: "DONE",
                generatedAt: new Date(),
                editedAt: new Date(),
              },
            });

            // Touch book to indicate chapter completed — prevents stale detection
            await touchBook(bookId);

            // Auto-sync: push updated chapter to Supabase
            const updatedChapter = await db.chapter.findFirst({ where: { bookId, chapterNumber: chapterNum } });
            if (updatedChapter) {
              autoSyncChapter({
                id: updatedChapter.id, bookId: updatedChapter.bookId,
                chapterNumber: updatedChapter.chapterNumber, title: updatedChapter.title,
                outline: updatedChapter.outline, markdown: updatedChapter.markdown,
                status: updatedChapter.status,
                generatedAt: updatedChapter.generatedAt?.toISOString() ?? null,
                editedAt: updatedChapter.editedAt?.toISOString() ?? null,
              });
            }

            // Generate summary for context of next chapters
            const summary = await summarizeChapter(chapterOutline.chapterTitle, edited);
            chapterSummaries.push(summary);
            await delay(INTER_CALL_DELAY);

            // Save token usage periodically
            await db.book.update({
              where: { id: bookId },
              data: { tokenUsageJson: tracker.toJSON() },
            });

            console.log(`[Pipeline] Chapter ${chapterNum} complete`);
            chapterSucceeded = true;
            break; // success, exit retry loop
          } catch (chapterErr) {
            console.error(`[Pipeline] Chapter ${chapterNum} attempt ${attempt} failed:`, chapterErr);
            if (attempt < MAX_CHAPTER_RETRIES) {
              console.log(`[Pipeline] Retrying chapter ${chapterNum}...`);
              await delay(3_000); // Wait before retry
            } else {
              // Final attempt failed — mark chapter as FAILED and continue with remaining chapters
              console.error(`[Pipeline] Chapter ${chapterNum} failed after ${MAX_CHAPTER_RETRIES} attempts, moving on`);
              await db.chapter.updateMany({
                where: { bookId, chapterNumber: chapterNum },
                data: { status: "FAILED" },
              });
              await touchBook(bookId);
            }
          }
        }
      }
    }

    // ── Phase 3: Exporting ─────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: true, exporting: true });
    await updateStatus(bookId, "EXPORTING");
    // touchBook already called by updatePhases + updateStatus

    const allChapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
    });

    const exportChapters = allChapters
      .filter((ch) => ch.markdown)
      .map((ch) => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        markdown: ch.markdown!,
      }));

    const exportDir = join(process.cwd(), "download", bookId);

    // Parse metadata for enhanced EPUB export
    let epubMetadata: EpubMetadata | undefined;
    if (book.metadataJson) {
      try {
        const meta = JSON.parse(book.metadataJson);
        epubMetadata = {
          keywords: meta.keywords,
          description: meta.abstract,
          subject: meta.subject,
          language: meta.language || language,
          date: new Date().toISOString().split("T")[0],
        };
      } catch {
        // Non-critical
      }
    }

    // T23: Generate book cover
    let coverPath: string | undefined;
    try {
      coverPath = await generateBookCover(plan.title, plan.subtitle, exportDir);
      await db.book.update({ where: { id: bookId }, data: { coverImagePath: coverPath } });
    } catch (err) {
      console.warn("[Pipeline] Cover generation failed (non-critical):", err);
    }

    // Generate EPUB (with metadata + cover)
    console.log("[Pipeline] Exporting EPUB...");
    const epubPath = await exportToEpub({
      title: plan.title,
      subtitle: plan.subtitle,
      chapters: exportChapters,
      outputDir: exportDir,
      coverImagePath: coverPath,
      metadata: epubMetadata,
    });

    // Generate PDF (with template)
    console.log("[Pipeline] Exporting PDF...");
    const pdfPath = await exportToPdf({
      title: plan.title,
      subtitle: plan.subtitle,
      chapters: exportChapters,
      outputDir: exportDir,
      template: pdfTemplate,
    });

    // T21: Generate MOBI (if Calibre is available)
    let mobiPath: string | undefined;
    try {
      const calibreAvailable = await isCalibreAvailable();
      if (calibreAvailable) {
        console.log("[Pipeline] Exporting MOBI...");
        mobiPath = await exportToMobi(epubPath, exportDir);
      } else {
        console.log("[Pipeline] Calibre not available, skipping MOBI export");
      }
    } catch (err) {
      console.warn("[Pipeline] MOBI export failed (non-critical):", err);
    }

    // Save all paths and mark as done
    await db.book.update({
      where: { id: bookId },
      data: {
        epubPath,
        pdfPath,
        mobiPath,
        tokenUsageJson: tracker.toJSON(),
        status: "DONE",
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    // Auto-sync: push final book state + files to Supabase
    const finalBook = await db.book.findUnique({ where: { id: bookId } });
    if (finalBook) autoSyncBook(buildSyncBook(finalBook));
    autoSyncFiles({ id: bookId, pdfPath, epubPath, mobiPath: mobiPath ?? null, coverImagePath: coverPath ?? null });

    console.log(`[Pipeline] Book generation complete: ${bookId}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Book generation failed (${bookId}):`, errorMessage);

    await db.book.update({
      where: { id: bookId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000),
        tokenUsageJson: tracker.toJSON(),
      },
    });

    // Auto-sync: push failed state to Supabase
    const failedBook = await db.book.findUnique({ where: { id: bookId } });
    if (failedBook) autoSyncBook(buildSyncBook(failedBook));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Update the book's updatedAt timestamp to indicate progress is being made.
 *  This prevents the stale-book detector from falsely marking active books as FAILED. */
async function touchBook(bookId: string): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { updatedAt: new Date() },
  });
}

async function updatePhases(bookId: string, phases: Phases): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { phasesJson: JSON.stringify(phases), updatedAt: new Date() },
  });
}

async function updateStatus(bookId: string, status: string): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { status, updatedAt: new Date() },
  });
}

// ─── Supabase Auto-Sync ───────────────────────────────────────────────

/** Helper to build SyncBookData from a Prisma book record */
function buildSyncBook(book: {
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
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): SyncBookData {
  return {
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
    updatedAt: book.updatedAt.toISOString(),
    completedAt: book.completedAt?.toISOString() ?? null,
  };
}

/** Async sync: book data to Supabase (non-blocking) */
function autoSyncBook(book: SyncBookData): void {
  syncBookToCloud(book).catch((err) =>
    console.warn("[AutoSync] Book sync failed:", err?.message || err)
  );
}

/** Async sync: chapter data to Supabase (non-blocking) */
function autoSyncChapter(chapter: SyncChapterData): void {
  syncChapterToCloud(chapter).catch((err) =>
    console.warn("[AutoSync] Chapter sync failed:", err?.message || err)
  );
}

/** Async sync: upload files to Supabase Storage (non-blocking) */
function autoSyncFiles(book: { id: string; pdfPath: string | null; epubPath: string | null; mobiPath: string | null; coverImagePath: string | null }): void {
  syncBookFilesToCloud(book).catch((err) =>
    console.warn("[AutoSync] File sync failed:", err?.message || err)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
