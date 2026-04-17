/**
 * EPUB Export Module
 *
 * Converts a book's chapters (in Markdown) to EPUB format using Pandoc.
 *
 * Process:
 * 1. Write each chapter as a separate .md file
 * 2. Generate a metadata.yml with title, subtitle, ToC
 * 3. Call Pandoc to compile all chapters into an EPUB with a table of contents
 *
 * Requires: pandoc (already installed on the system)
 */

import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { ChapterOutline } from "./bookPlanner";

const execFileAsync = promisify(execFile);

export interface EpubExportInput {
  title: string;
  subtitle: string;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    markdown: string;
  }>;
  outputDir: string; // Where to write the final .epub file
}

/**
 * Export a book to EPUB format using Pandoc.
 *
 * @returns Path to the generated .epub file
 */
export async function exportToEpub(input: EpubExportInput): Promise<string> {
  const { title, subtitle, chapters, outputDir } = input;

  // Create a temporary working directory
  const workDir = join(outputDir, `_epub_work_${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  try {
    // 1. Generate metadata.yml
    const metadataYml = `---
title: "${escapeYaml(title)}"
subtitle: "${escapeYaml(subtitle)}"
lang: en
---
`;
    const metadataPath = join(workDir, "metadata.yml");
    await writeFile(metadataPath, metadataYml, "utf-8");

    // 2. Write each chapter as a .md file
    const chapterPaths: string[] = [];
    for (const ch of chapters) {
      // Prepend chapter title as H1 for Pandoc to pick up as chapter heading
      const content = `# ${ch.title}\n\n${ch.markdown}`;
      const filename = `chapter_${String(ch.chapterNumber).padStart(2, "0")}.md`;
      const filePath = join(workDir, filename);
      await writeFile(filePath, content, "utf-8");
      chapterPaths.push(filePath);
    }

    // 3. Call Pandoc to generate EPUB
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

    console.log(`[EPUB] Running Pandoc: pandoc ${pandocArgs.join(" ")}`);

    const { stdout, stderr } = await execFileAsync("pandoc", pandocArgs, {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large books
    });

    if (stderr) {
      console.warn(`[EPUB] Pandoc warnings: ${stderr}`);
    }

    console.log(`[EPUB] Generated: ${epubPath}`);
    return epubPath;
  } finally {
    // Clean up temporary working directory
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Non-critical — temp dir cleanup failure
    }
  }
}

/**
 * Escape special characters for YAML string values.
 */
function escapeYaml(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Sanitize a string for use as a filename.
 */
function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}
