/**
 * Job Queue & Orchestration Module (MVP)
 *
 * Manages the full e-book generation pipeline:
 *   Phase 1: Planning  — generate title, subtitle, ToC
 *   Phase 2: Writing   — generate each chapter (Writer + Editor)
 *   Phase 3: Exporting — produce EPUB and PDF files
 *
 * MVP note: This uses an in-memory queue with sequential processing.
 * For production, replace with BullMQ + Redis for durability and concurrency.
 * Jobs run one at a time to avoid overwhelming the free-tier API rate limits.
 */

import { db } from "./db";
import { planBook, type ChapterOutline } from "./bookPlanner";
import {
  generateChapterDraft,
  editChapterDraft,
  summarizeChapter,
  type BookContext,
} from "./chapterGenerator";
import { exportToEpub } from "./exportEpub";
import { exportToPdf } from "./exportPdf";
import { join } from "path";

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

/**
 * Enqueue a book generation job.
 * Jobs are processed sequentially (one at a time).
 */
export function enqueueBookJob(bookId: string): void {
  const job: JobFn = async () => {
    await runBookPipeline(bookId);
  };
  queue.push(job);
  console.log(`[JobQueue] Enqueued book job: ${bookId} (queue size: ${queue.length})`);
  processQueue();
}

/**
 * Process the next job in the queue (if not already processing).
 */
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
    // Process next job
    processQueue();
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────

/**
 * Run the full book generation pipeline for a given book ID.
 */
async function runBookPipeline(bookId: string): Promise<void> {
  console.log(`[Pipeline] Starting book generation: ${bookId}`);

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) {
    console.error(`[Pipeline] Book not found: ${bookId}`);
    return;
  }

  try {
    // ── Phase 1: Planning ──────────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: false, exporting: false });
    await updateStatus(bookId, "PLANNING");

    const plan = await planBook(
      `${book.prompt}\n\nTarget audience: ${book.audience}\nTone: ${book.tone}\nDesired length: ${book.lengthHint}`
    );

    // Save plan to DB
    await db.book.update({
      where: { id: bookId },
      data: {
        title: plan.title,
        subtitle: plan.subtitle,
        tocJson: JSON.stringify(plan.toc),
      },
    });

    // Create chapter records in PENDING state
    for (let i = 0; i < plan.toc.length; i++) {
      const ch = plan.toc[i];
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

    console.log(`[Pipeline] Plan complete: "${plan.title}" with ${plan.toc.length} chapters`);

    // ── Phase 2: Writing ───────────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: true, exporting: false });
    await updateStatus(bookId, "WRITING");

    const context: BookContext = {
      title: plan.title,
      subtitle: plan.subtitle,
      audience: book.audience,
      tone: book.tone,
    };

    const chapterSummaries: string[] = [];

    for (let i = 0; i < plan.toc.length; i++) {
      const chapterOutline = plan.toc[i];
      const chapterNum = i + 1;

      // Update chapter status to GENERATING
      await db.chapter.updateMany({
        where: { bookId, chapterNumber: chapterNum },
        data: { status: "GENERATING" },
      });

      console.log(`[Pipeline] Generating chapter ${chapterNum}/${plan.toc.length}: "${chapterOutline.chapterTitle}"`);

      // Writer pass
      const draft = await generateChapterDraft(
        context,
        chapterOutline,
        chapterNum,
        chapterSummaries
      );

      // Update chapter status to EDITING
      await db.chapter.updateMany({
        where: { bookId, chapterNumber: chapterNum },
        data: { status: "EDITING" },
      });

      // Editor pass
      const edited = await editChapterDraft(
        context,
        chapterOutline,
        chapterNum,
        draft
      );

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

      // Generate summary for context of next chapters
      const summary = await summarizeChapter(chapterOutline.chapterTitle, edited);
      chapterSummaries.push(summary);

      console.log(`[Pipeline] Chapter ${chapterNum} complete`);
    }

    // ── Phase 3: Exporting ─────────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: true, exporting: true });
    await updateStatus(bookId, "EXPORTING");

    // Fetch all chapters with content
    const chapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
    });

    const exportChapters = chapters
      .filter((ch) => ch.markdown)
      .map((ch) => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        markdown: ch.markdown!,
      }));

    // Export directory — store in /home/z/my-project/download/
    const exportDir = join(process.cwd(), "download", bookId);

    // Generate EPUB
    console.log("[Pipeline] Exporting EPUB...");
    const epubPath = await exportToEpub({
      title: plan.title,
      subtitle: plan.subtitle,
      chapters: exportChapters,
      outputDir: exportDir,
    });

    // Generate PDF
    console.log("[Pipeline] Exporting PDF...");
    const pdfPath = await exportToPdf({
      title: plan.title,
      subtitle: plan.subtitle,
      chapters: exportChapters,
      outputDir: exportDir,
    });

    // Save file paths to DB
    await db.book.update({
      where: { id: bookId },
      data: {
        epubPath,
        pdfPath,
        status: "DONE",
        completedAt: new Date(),
      },
    });

    console.log(`[Pipeline] Book generation complete: ${bookId}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Book generation failed (${bookId}):`, errorMessage);

    await db.book.update({
      where: { id: bookId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000), // Truncate long errors
      },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function updatePhases(bookId: string, phases: Phases): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { phasesJson: JSON.stringify(phases) },
  });
}

async function updateStatus(bookId: string, status: string): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { status },
  });
}
