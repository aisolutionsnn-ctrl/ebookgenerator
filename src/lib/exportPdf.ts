/**
 * PDF Export Module (with T22: Template System)
 *
 * Converts a book's chapters (in Markdown) to a styled PDF using WeasyPrint.
 * Supports multiple PDF templates: professional, academic, creative, minimalist.
 *
 * Process:
 * 1. Convert each chapter's Markdown to HTML
 * 2. Combine all chapters into a single styled HTML document
 * 3. Call WeasyPrint to render the HTML+CSS to PDF
 *
 * Requires: weasyprint (already installed on the system)
 */

import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getPdfTemplateCss, type PdfTemplate } from "./pdfTemplates";

const execFileAsync = promisify(execFile);

export interface PdfExportInput {
  title: string;
  subtitle: string;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    markdown: string;
  }>;
  outputDir: string;
  template?: PdfTemplate;
}

/**
 * Simple Markdown-to-HTML converter.
 * Handles: headings (##, ###), bold, italic, bullet lists, numbered lists,
 * paragraphs, code blocks, and horizontal rules.
 *
 * Note: We use this lightweight converter instead of a heavy dependency
 * because Pandoc is already used for EPUB and we want to keep the
 * PDF pipeline independent of Pandoc's HTML output quirks.
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const htmlLines: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCodeBlock = false;
  let codeContent: string[] = [];

  for (const line of lines) {
    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        htmlLines.push(
          `<pre><code>${escapeHtml(codeContent.join("\n"))}</code></pre>`
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        closeLists();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      closeLists();
      htmlLines.push("<hr>");
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      closeLists();
      htmlLines.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeLists();
      htmlLines.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      closeLists();
      htmlLines.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        htmlLines.push("<ul>");
        inUl = true;
      }
      htmlLines.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        htmlLines.push("<ol>");
        inOl = true;
      }
      htmlLines.push(
        `<li>${inlineFormat(line.replace(/^\d+\.\s+/, ""))}</li>`
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      closeLists();
      continue;
    }

    // Paragraph
    closeLists();
    htmlLines.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeLists();

  function closeLists() {
    if (inUl) {
      htmlLines.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      htmlLines.push("</ol>");
      inOl = false;
    }
  }

  return htmlLines.join("\n");
}

/**
 * Inline formatting: bold, italic, inline code, links.
 */
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate the CSS stylesheet for the PDF based on the selected template.
 */
function generatePdfCss(template: PdfTemplate = "professional"): string {
  return getPdfTemplateCss(template);
}

/**
 * Export a book to PDF format using WeasyPrint.
 *
 * @returns Path to the generated .pdf file
 */
export async function exportToPdf(input: PdfExportInput): Promise<string> {
  const { title, subtitle, chapters, outputDir, template = "professional" } = input;
  await mkdir(outputDir, { recursive: true });

  // 1. Build the full HTML document
  const titlePage = `
    <div class="title-page">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">${escapeHtml(subtitle)}</div>
    </div>
  `;

  const tocItems = chapters
    .map(
      (ch) =>
        `<li><span class="chapter-num">${ch.chapterNumber}.</span> ${escapeHtml(ch.title)}</li>`
    )
    .join("\n");

  const toc = `
    <div class="toc">
      <h2>Table of Contents</h2>
      <ul>${tocItems}</ul>
    </div>
  `;

  const chaptersHtml = chapters
    .map((ch) => {
      const bodyHtml = markdownToHtml(ch.markdown);
      return `<h1>${ch.chapterNumber}. ${escapeHtml(ch.title)}</h1>\n${bodyHtml}`;
    })
    .join("\n\n");

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>${generatePdfCss(template)}</style>
</head>
<body>
  ${titlePage}
  ${toc}
  ${chaptersHtml}
</body>
</html>`;

  // 2. Write HTML to temp file
  const htmlPath = join(outputDir, `_book_${Date.now()}.html`);
  await writeFile(htmlPath, fullHtml, "utf-8");

  // 3. Call WeasyPrint
  const pdfFilename = `${sanitizeFilename(title)}.pdf`;
  const pdfPath = join(outputDir, pdfFilename);

  console.log(`[PDF] Running WeasyPrint: ${htmlPath} -> ${pdfPath}`);

  try {
    const { stdout, stderr } = await execFileAsync("weasyprint", [htmlPath, pdfPath], {
      timeout: 120_000,
    });

    if (stderr) {
      console.warn(`[PDF] WeasyPrint warnings: ${stderr}`);
    }

    console.log(`[PDF] Generated: ${pdfPath}`);
    return pdfPath;
  } finally {
    // Clean up temp HTML file
    try {
      await unlink(htmlPath);
    } catch {
      // Non-critical
    }
  }
}

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}
