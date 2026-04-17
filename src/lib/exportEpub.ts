/**
 * EPUB Export Module (with T27: Enhanced Metadata)
 *
 * Converts a book's chapters (in Markdown) to EPUB format using Pandoc.
 *
 * Process:
 * 1. Write each chapter as a separate .md file
 * 2. Generate a metadata.yml with title, subtitle, keywords, description, etc.
 * 3. Call Pandoc to compile all chapters into an EPUB with a table of contents
 *
 * Requires: pandoc (already installed on the system)
 */

import { writeFile, mkdir, rm, copyFile } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface EpubMetadata {
  keywords?: string[];
  description?: string; // Abstract
  subject?: string; // BISAC category
  language?: string;
  author?: string;
  date?: string;
}

export interface EpubExportInput {
  title: string;
  subtitle: string;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    markdown: string;
  }>;
  outputDir: string;
  coverImagePath?: string; // T23: Path to generated cover image
  metadata?: EpubMetadata; // T27: Enhanced metadata
}

/**
 * Export a book to EPUB format using Pandoc.
 *
 * @returns Path to the generated .epub file
 */
export async function exportToEpub(input: EpubExportInput): Promise<string> {
  const { title, subtitle, chapters, outputDir, coverImagePath, metadata } = input;

  // Create a temporary working directory
  const workDir = join(outputDir, `_epub_work_${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  try {
    // 1. Copy cover image if available
    let coverArg: string | null = null;
    if (coverImagePath) {
      const coverDest = join(workDir, "cover.png");
      try {
        await copyFile(coverImagePath, coverDest);
        coverArg = coverDest;
      } catch {
        console.warn("[EPUB] Could not copy cover image, skipping...");
      }
    }

    // 2. Generate metadata.yml (T27: Enhanced with keywords, description, subject, etc.)
    const metaLines: string[] = [
      `title: "${escapeYaml(title)}"`,
      `subtitle: "${escapeYaml(subtitle)}"`,
      `lang: ${metadata?.language ?? "en"}`,
    ];

    if (metadata?.author) {
      metaLines.push(`author: "${escapeYaml(metadata.author)}"`);
    }
    if (metadata?.subject) {
      metaLines.push(`subject: "${escapeYaml(metadata.subject)}"`);
    }
    if (metadata?.description) {
      metaLines.push(`description: "${escapeYaml(metadata.description.slice(0, 500))}"`);
    }
    if (metadata?.keywords && metadata.keywords.length > 0) {
      metaLines.push(`keywords: "${escapeYaml(metadata.keywords.join(", "))}"`);
    }
    if (metadata?.date) {
      metaLines.push(`date: "${metadata.date}"`);
    }
    if (coverArg) {
      metaLines.push(`cover-image: cover.png`);
    }

    const metadataYml = `---\n${metaLines.join("\n")}\n---\n`;
    const metadataPath = join(workDir, "metadata.yml");
    await writeFile(metadataPath, metadataYml, "utf-8");

    // 3. Write each chapter as a .md file
    const chapterPaths: string[] = [];
    for (const ch of chapters) {
      const content = `# ${ch.title}\n\n${ch.markdown}`;
      const filename = `chapter_${String(ch.chapterNumber).padStart(2, "0")}.md`;
      const filePath = join(workDir, filename);
      await writeFile(filePath, content, "utf-8");
      chapterPaths.push(filePath);
    }

    // 4. Call Pandoc to generate EPUB
    const epubFilename = `${sanitizeFilename(title)}.epub`;
    const epubPath = join(outputDir, epubFilename);

    const pandocArgs = [
      metadataPath,
      ...chapterPaths,
      "--from=markdown",
      "--to=epub3",
      `--output=${epubPath}`,
      "--toc",
      "--toc-depth=2",
      "--epub-chapter-level=1",
    ];

    console.log(`[EPUB] Running Pandoc with ${chapters.length} chapters`);

    const { stderr } = await execFileAsync("pandoc", pandocArgs, {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr) {
      console.warn(`[EPUB] Pandoc warnings: ${stderr}`);
    }

    console.log(`[EPUB] Generated: ${epubPath}`);
    return epubPath;
  } finally {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Non-critical
    }
  }
}

function escapeYaml(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}
