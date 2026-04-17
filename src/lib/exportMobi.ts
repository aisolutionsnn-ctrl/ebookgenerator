/**
 * T21: MOBI Export Module (Kindle)
 *
 * Converts EPUB to MOBI format using Calibre's ebook-convert.
 * Requires: calibre (ebook-convert command must be in PATH)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";

const execFileAsync = promisify(execFile);

/**
 * Check if Calibre's ebook-convert is available on the system.
 */
export async function isCalibreAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ebook-convert", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Export an EPUB file to MOBI format using Calibre's ebook-convert.
 *
 * @param epubPath - Path to the input EPUB file
 * @param outputDir - Directory to write the MOBI file
 * @returns Path to the generated MOBI file
 */
export async function exportToMobi(
  epubPath: string,
  outputDir: string
): Promise<string> {
  const available = await isCalibreAvailable();
  if (!available) {
    throw new Error(
      "Calibre is not installed. Install it to enable MOBI export: https://calibre-ebook.com/download"
    );
  }

  // Derive MOBI filename from EPUB path
  const epubFilename = epubPath.split("/").pop() ?? "book.epub";
  const mobiFilename = epubFilename.replace(/\.epub$/i, ".mobi");
  const mobiPath = join(outputDir, mobiFilename);

  console.log(`[MOBI] Converting: ${epubPath} -> ${mobiPath}`);

  const { stdout, stderr } = await execFileAsync(
    "ebook-convert",
    [epubPath, mobiPath, "--no-inline-toc"],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
  );

  if (stderr && !stderr.includes("Conversion options")) {
    console.warn(`[MOBI] Calibre warnings: ${stderr}`);
  }

  console.log(`[MOBI] Generated: ${mobiPath}`);
  return mobiPath;
}
