/**
 * PDF Export Module
 *
 * Converts a book's chapters (in Markdown) to a styled PDF using WeasyPrint.
 *
 * Process:
 * 1. Convert each chapter's Markdown to HTML
 * 2. Combine all chapters into a single styled HTML document
 * 3. Call WeasyPrint to render the HTML+CSS to PDF
 *
 * Requires: weasyprint (already installed on the system)
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

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
 * Generate the CSS stylesheet for the PDF.
 */
function generatePdfCss(): string {
  return `
    @page {
      size: A5;
      margin: 2cm 1.8cm;
      @bottom-center {
        content: counter(page);
        font-size: 9pt;
        color: #666;
      }
    }
    @page :first {
      @bottom-center { content: none; }
    }
    body {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
    }
    h1 {
      font-size: 20pt;
      margin-top: 2em;
      margin-bottom: 0.5em;
      page-break-before: always;
      color: #111;
    }
    h1:first-of-type {
      page-break-before: auto;
    }
    h2 {
      font-size: 15pt;
      margin-top: 1.5em;
      margin-bottom: 0.4em;
      color: #222;
    }
    h3 {
      font-size: 12pt;
      margin-top: 1.2em;
      margin-bottom: 0.3em;
      color: #333;
    }
    p {
      margin-bottom: 0.8em;
      text-align: justify;
    }
    ul, ol {
      margin-bottom: 0.8em;
      padding-left: 1.5em;
    }
    li {
      margin-bottom: 0.3em;
    }
    code {
      font-family: "Courier New", monospace;
      font-size: 9.5pt;
      background: #f4f4f4;
      padding: 0.1em 0.3em;
      border-radius: 3px;
    }
    pre {
      background: #f8f8f8;
      border: 1px solid #ddd;
      padding: 0.8em;
      overflow-x: auto;
      font-size: 9pt;
      line-height: 1.4;
      border-radius: 4px;
    }
    pre code {
      background: none;
      padding: 0;
    }
    hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 1.5em 0;
    }
    .title-page {
      text-align: center;
      padding-top: 35%;
    }
    .title-page h1 {
      font-size: 26pt;
      page-break-before: auto;
      margin-bottom: 0.3em;
    }
    .title-page .subtitle {
      font-size: 14pt;
      color: #555;
      font-style: italic;
      margin-bottom: 2em;
    }
    .toc {
      page-break-after: always;
    }
    .toc h2 {
      font-size: 18pt;
      margin-bottom: 1em;
    }
    .toc ul {
      list-style: none;
      padding-left: 0;
    }
    .toc li {
      margin-bottom: 0.4em;
      font-size: 11pt;
    }
    .toc .chapter-num {
      font-weight: bold;
      margin-right: 0.5em;
    }
  `;
}

/**
 * Export a book to PDF format using WeasyPrint.
 *
 * @returns Path to the generated .pdf file
 */
export async function exportToPdf(input: PdfExportInput): Promise<string> {
  const { title, subtitle, chapters, outputDir } = input;
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
  <style>${generatePdfCss()}</style>
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
      const { unlink } = await import("fs/promises");
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
