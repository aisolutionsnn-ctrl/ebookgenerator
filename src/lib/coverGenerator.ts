/**
 * T23: Book Cover Generator
 *
 * Temporarily disabled Z-AI image generation to allow serverless deployment on Vercel.
 * Generates a placeholder or skips image generation.
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * Generate a book cover image (Currently returns a placeholder path)
 */
export async function generateBookCover(
  title: string,
  subtitle: string,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  
  // No longer using ZAI to prevent crashes
  console.log(`[Cover] Skipped generating real cover for: "${title}" (ZAI disabled)`);
  
  const coverPath = join(outputDir, "cover.png");
  // Just create an empty/dummy file to satisfy the builder
  await writeFile(coverPath, Buffer.from(""));
  
  return coverPath;
}
