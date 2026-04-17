/**
 * T23: Book Cover Generator
 *
 * Generates AI-powered book cover images using z-ai-web-dev-sdk.
 * Creates a professional cover design based on the book's title and subtitle.
 *
 * IMPORTANT: z-ai-web-dev-sdk must be used in backend code only.
 */

import ZAI from "z-ai-web-dev-sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Generate a book cover image.
 *
 * @param title - Book title
 * @param subtitle - Book subtitle
 * @param outputDir - Directory to save the cover image
 * @returns Path to the generated cover image (PNG)
 */
export async function generateBookCover(
  title: string,
  subtitle: string,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const zai = await getZAI();

  // Design a professional book cover prompt
  const prompt = `Professional book cover design for a non-fiction book titled "${title}". Subtitle: "${subtitle}". Elegant, modern, clean design with tasteful typography and subtle visual elements. No text other than decorative elements. High quality, print-ready.`;

  console.log(`[Cover] Generating cover for: "${title}"`);

  const response = await zai.images.generations.create({
    prompt,
    size: "768x1344", // Portrait — suitable for book covers
  });

  const imageBase64 = response.data[0].base64;
  const buffer = Buffer.from(imageBase64, "base64");

  const coverPath = join(outputDir, "cover.png");
  await writeFile(coverPath, buffer);

  console.log(`[Cover] Generated: ${coverPath}`);
  return coverPath;
}
