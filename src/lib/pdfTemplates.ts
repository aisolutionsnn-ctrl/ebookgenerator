/**
 * T22: PDF Template System
 *
 * Provides different CSS templates for PDF export:
 *   - professional: serif, clean, business-like
 *   - academic: larger margins, numbered, formal
 *   - creative: sans-serif, colorful headings, modern
 *   - minimalist: very clean, lots of whitespace
 */

export type PdfTemplate = "professional" | "academic" | "creative" | "minimalist";

export const PDF_TEMPLATES: { id: PdfTemplate; name: string; description: string }[] = [
  { id: "professional", name: "Professional", description: "Classic serif typography, clean layout" },
  { id: "academic", name: "Academic", description: "Larger margins, formal numbering, scholarly" },
  { id: "creative", name: "Creative", description: "Modern sans-serif, colorful headings" },
  { id: "minimalist", name: "Minimalist", description: "Clean, lots of whitespace, thin rules" },
];

/** Shared base CSS for all templates */
function baseCss(): string {
  return `
    pre { background: #f8f8f8; border: 1px solid #ddd; padding: 0.8em; overflow-x: auto; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    code { font-family: "Courier New", monospace; font-size: 9.5pt; background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }
    hr { border: none; margin: 1.5em 0; }
    a { color: inherit; }
    .title-page { text-align: center; padding-top: 35%; }
    .toc { page-break-after: always; }
    .toc h2 { font-size: 18pt; margin-bottom: 1em; }
    .toc ul { list-style: none; padding-left: 0; }
    .toc li { margin-bottom: 0.4em; font-size: 11pt; }
  `;
}

/** Professional template — serif, classic */
function professionalCss(): string {
  return `
    @page { size: A5; margin: 2cm 1.8cm; @bottom-center { content: counter(page); font-size: 9pt; color: #666; } }
    @page :first { @bottom-center { content: none; } }
    body { font-family: "Georgia", "Times New Roman", serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; }
    h1 { font-size: 20pt; margin-top: 2em; margin-bottom: 0.5em; page-break-before: always; color: #111; }
    h1:first-of-type { page-break-before: auto; }
    h2 { font-size: 15pt; margin-top: 1.5em; margin-bottom: 0.4em; color: #222; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
    h3 { font-size: 12pt; margin-top: 1.2em; margin-bottom: 0.3em; color: #333; }
    p { margin-bottom: 0.8em; text-align: justify; }
    ul, ol { margin-bottom: 0.8em; padding-left: 1.5em; }
    li { margin-bottom: 0.3em; }
    hr { border-top: 1px solid #ccc; }
    .title-page h1 { font-size: 26pt; }
    .title-page .subtitle { font-size: 14pt; color: #555; font-style: italic; }
  `;
}

/** Academic template — formal, scholarly */
function academicCss(): string {
  return `
    @page { size: A4; margin: 2.5cm 2.5cm 3cm 3cm; @bottom-center { content: counter(page); font-size: 9pt; color: #444; } @top-right { content: string(chapter-title); font-size: 8pt; color: #888; } }
    @page :first { @bottom-center { content: none; } @top-right { content: none; } }
    body { font-family: "Times New Roman", "Georgia", serif; font-size: 12pt; line-height: 1.8; color: #111; }
    h1 { font-size: 18pt; margin-top: 2.5em; margin-bottom: 0.6em; page-break-before: always; color: #000; string-set: chapter-title content(); }
    h1:first-of-type { page-break-before: auto; }
    h2 { font-size: 14pt; margin-top: 2em; margin-bottom: 0.5em; color: #111; }
    h3 { font-size: 12pt; margin-top: 1.5em; margin-bottom: 0.4em; color: #222; }
    p { margin-bottom: 1em; text-align: justify; text-indent: 1.5em; }
    p:first-child { text-indent: 0; }
    ul, ol { margin-bottom: 1em; padding-left: 2em; }
    li { margin-bottom: 0.4em; }
    hr { border-top: 1px solid #999; }
    .title-page h1 { font-size: 24pt; }
    .title-page .subtitle { font-size: 13pt; color: #444; }
  `;
}

/** Creative template — modern, colorful */
function creativeCss(): string {
  return `
    @page { size: A5; margin: 1.8cm 1.5cm; @bottom-center { content: counter(page); font-size: 9pt; color: #16a34a; } }
    @page :first { @bottom-center { content: none; } }
    body { font-family: "Helvetica Neue", "Arial", sans-serif; font-size: 10.5pt; line-height: 1.7; color: #1e293b; }
    h1 { font-size: 22pt; margin-top: 2em; margin-bottom: 0.5em; page-break-before: always; color: #16a34a; letter-spacing: -0.02em; }
    h1:first-of-type { page-break-before: auto; }
    h2 { font-size: 14pt; margin-top: 1.8em; margin-bottom: 0.4em; color: #15803d; border-left: 3px solid #16a34a; padding-left: 0.5em; }
    h3 { font-size: 11.5pt; margin-top: 1.3em; margin-bottom: 0.3em; color: #166534; }
    p { margin-bottom: 0.8em; }
    ul, ol { margin-bottom: 0.8em; padding-left: 1.5em; }
    li { margin-bottom: 0.3em; }
    hr { border-top: 2px solid #16a34a; opacity: 0.3; }
    .title-page h1 { font-size: 28pt; color: #16a34a; }
    .title-page .subtitle { font-size: 13pt; color: #64748b; }
  `;
}

/** Minimalist template — clean, airy */
function minimalistCss(): string {
  return `
    @page { size: A5; margin: 2.5cm 2cm; @bottom-center { content: counter(page); font-size: 8pt; color: #aaa; } }
    @page :first { @bottom-center { content: none; } }
    body { font-family: "Georgia", serif; font-size: 10.5pt; line-height: 1.8; color: #333; }
    h1 { font-size: 18pt; margin-top: 3em; margin-bottom: 0.8em; page-break-before: always; color: #111; font-weight: 300; letter-spacing: 0.05em; text-transform: uppercase; }
    h1:first-of-type { page-break-before: auto; }
    h2 { font-size: 12pt; margin-top: 2em; margin-bottom: 0.5em; color: #555; font-weight: 400; letter-spacing: 0.03em; }
    h3 { font-size: 10.5pt; margin-top: 1.5em; margin-bottom: 0.3em; color: #666; font-weight: 600; }
    p { margin-bottom: 1em; }
    ul, ol { margin-bottom: 1em; padding-left: 1.5em; }
    li { margin-bottom: 0.4em; }
    hr { border-top: 0.5px solid #ddd; margin: 2em 0; }
    .title-page h1 { font-size: 24pt; }
    .title-page .subtitle { font-size: 12pt; color: #999; font-weight: 300; }
  `;
}

/**
 * Get the complete CSS for a PDF template.
 */
export function getPdfTemplateCss(template: PdfTemplate): string {
  const templates: Record<PdfTemplate, () => string> = {
    professional: professionalCss,
    academic: academicCss,
    creative: creativeCss,
    minimalist: minimalistCss,
  };

  const generator = templates[template] ?? templates.professional;
  return baseCss() + generator();
}
