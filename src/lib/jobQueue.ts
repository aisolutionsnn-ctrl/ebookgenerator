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

// ─── Config ───────────────────────────────────────────────────────────

/** Delay between LLM calls to avoid rate limits (ms) */
const INTER_CALL_DELAY = 8_000;

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

export function enqueueBookJob(bookId: string): void {
  const job: JobFn = async () => {
    await runBookPipeline(bookId);
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

      // Generate remaining chapters
      for (let i = 0; i < plan.toc.length; i++) {
        const chapterOutline = plan.toc[i];
        const chapterNum = i + 1;

        if (doneChapterNums.includes(chapterNum)) {
          console.log(`[Pipeline] Skipping chapter ${chapterNum} (already done)`);
          continue;
        }

        await db.chapter.updateMany({
          where: { bookId, chapterNumber: chapterNum },
          data: { status: "GENERATING" },
        });

        console.log(`[Pipeline] Generating chapter ${chapterNum}/${plan.toc.length}: "${chapterOutline.chapterTitle}"`);

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
      }
    }

    // ── Phase 3: Exporting ─────────────────────────────────
    await updatePhases(bookId, { planning: true, writing: true, exporting: true });
    await updateStatus(bookId, "EXPORTING");

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
