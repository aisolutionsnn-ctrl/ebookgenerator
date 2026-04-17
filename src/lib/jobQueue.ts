/**
 * Job Queue & Orchestration Module (MVP)
 *
 * Manages the full e-book generation pipeline:
 *   Phase 1: Planning  — generate title, subtitle, ToC
 *   Phase 2: Writing   — generate each chapter (Writer + Editor)
 *   Phase 3: Exporting — produce EPUB and PDF files
 *
 * Features:
 *   - Resume capability: if a job fails (e.g., rate limit), it can be
 *     resumed from where it left off.
 *   - Rate-limit protection: configurable delay between LLM calls.
 *
 * MVP note: This uses an in-memory queue with sequential processing.
 * For production, replace with BullMQ + Redis for durability and concurrency.
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

// ─── Config ───────────────────────────────────────────────────────────

/** Delay between LLM calls to avoid rate limits (ms) */
const INTER_CALL_DELAY = 8_000; // 8 seconds between API calls

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
    processQueue();
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────

/**
 * Run the full book generation pipeline for a given book ID.
 * Supports resuming from where a previous run left off (after a failure).
 */
async function runBookPipeline(bookId: string): Promise<void> {
  console.log(`[Pipeline] Starting book generation: ${bookId}`);

  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { chapterNumber: "asc" } } },
  });
  if (!book) {
    console.error(`[Pipeline] Book not found: ${bookId}`);
    return;
  }

  try {
    // ── Determine what phase to resume from ────────────────────

    // Reset any stale chapter statuses (GENERATING/EDITING from a failed run → PENDING)
    await db.chapter.updateMany({
      where: { bookId, status: { in: ["GENERATING", "EDITING"] } },
      data: { status: "PENDING" },
    });

    // Re-fetch chapters after reset
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

    console.log(`[Pipeline] hasPlan=${hasPlan}, title="${book.title}", tocJson=${book.tocJson ? "exists" : "null"}, doneChapters=[${doneChapterNums.join(",")}], totalChapters=${existingChapters.length}`);

    let plan: { title: string; subtitle: string; toc: ChapterOutline[] };

    if (hasPlan) {
      // Resume: plan already exists
      plan = {
        title: book.title!,
        subtitle: book.subtitle ?? "",
        toc: JSON.parse(book.tocJson!),
      };
      console.log(`[Pipeline] Resuming with existing plan: "${plan.title}" (${doneChapterNums.length}/${plan.toc.length} chapters done)`);
    } else {
      // ── Phase 1: Planning ──────────────────────────────────
      await updatePhases(bookId, { planning: true, writing: false, exporting: false });
      await updateStatus(bookId, "PLANNING");

      plan = await planBook(
        `${book.prompt}\n\nTarget audience: ${book.audience}\nTone: ${book.tone}\nDesired length: ${book.lengthHint}`
      );

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
        // Only create if doesn't already exist (idempotent)
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

      console.log(`[Pipeline] Plan complete: "${plan.title}" with ${plan.toc.length} chapters`);
      await delay(INTER_CALL_DELAY);
    }

    // ── Phase 2: Writing (skip done chapters) ─────────────────
    if (!allChaptersDone) {
      await updatePhases(bookId, { planning: true, writing: true, exporting: false });
      await updateStatus(bookId, "WRITING");

      const context: BookContext = {
        title: plan.title,
        subtitle: plan.subtitle,
        audience: book.audience,
        tone: book.tone,
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

      // Generate remaining chapters
      for (let i = 0; i < plan.toc.length; i++) {
        const chapterOutline = plan.toc[i];
        const chapterNum = i + 1;

        // Skip already-done chapters
        if (doneChapterNums.includes(chapterNum)) {
          console.log(`[Pipeline] Skipping chapter ${chapterNum} (already done)`);
          continue;
        }

        // Reset any stale status (GENERATING/EDITING from failed run)
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

        await delay(INTER_CALL_DELAY);

        // Editor pass
        await db.chapter.updateMany({
          where: { bookId, chapterNumber: chapterNum },
          data: { status: "EDITING" },
        });

        const edited = await editChapterDraft(
          context,
          chapterOutline,
          chapterNum,
          draft
        );

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

        // Generate summary for context of next chapters
        const summary = await summarizeChapter(chapterOutline.chapterTitle, edited);
        chapterSummaries.push(summary);

        await delay(INTER_CALL_DELAY);

        console.log(`[Pipeline] Chapter ${chapterNum} complete`);
      }
    }

    // ── Phase 3: Exporting ─────────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: true, exporting: true });
    await updateStatus(bookId, "EXPORTING");

    // Fetch all chapters with content
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
        errorMessage: null, // Clear any previous error
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
        errorMessage: errorMessage.slice(0, 1000),
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
