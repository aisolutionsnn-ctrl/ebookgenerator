"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen, Download, FileText, Loader2, CheckCircle2, Circle,
  Clock, AlertCircle, Sparkles, ChevronDown, ChevronUp, RotateCcw,
  Sun, Moon, History, BarChart3, Edit3, X, Languages, Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { PDF_TEMPLATES, type PdfTemplate } from "@/lib/pdfTemplates";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────

interface ChapterInfo {
  id: string; chapterNumber: number; title: string; outline: string | null;
  markdown: string | null; status: "PENDING" | "GENERATING" | "EDITING" | "DONE" | "FAILED";
  generatedAt: string | null; editedAt: string | null;
}

interface TokenUsage {
  totalPromptTokens: number; totalCompletionTokens: number;
  totalTokens: number; estimatedCost: number;
}

interface BookData {
  id: string; prompt: string; audience: string; tone: string; lengthHint: string;
  language: string; pdfTemplate: string;
  status: "PLANNING" | "WRITING" | "EXPORTING" | "DONE" | "FAILED";
  title: string | null; subtitle: string | null;
  toc: { chapterTitle: string; subTopics: string[] }[] | null;
  phases: { planning: boolean; writing: boolean; exporting: boolean };
  metadata: { keywords?: string[]; abstract?: string; copyrightPage?: string } | null;
  tokenUsage: TokenUsage | null;
  errorMessage: string | null;
  epubPath: string | null; pdfPath: string | null; mobiPath: string | null;
  coverImagePath: string | null;
  createdAt: string; completedAt: string | null;
  chapters: ChapterInfo[];
}

interface BookListItem {
  id: string; title: string | null; subtitle: string | null; status: string;
  prompt: string; language: string; coverImagePath: string | null;
  createdAt: string; completedAt: string | null;
}

type ViewMode = "landing" | "generate" | "progress" | "history" | "dashboard";

// ─── Main App ─────────────────────────────────────────────────────────

export default function Home() {
  const [view, setView] = useState<ViewMode>("landing");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [books, setBooks] = useState<BookListItem[]>([]);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Form state
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState("General readers");
  const [tone, setTone] = useState("Informative and engaging");
  const [lengthHint, setLengthHint] = useState("Medium (8-12 chapters)");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>("professional");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Chapter preview + editor
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [editMarkdown, setEditMarkdown] = useState("");

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch books for history/dashboard ───────────────────────────
  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch("/api/books");
      if (res.ok) { const data = await res.json(); setBooks(data.books); }
    } catch { /* ignore */ }
  }, []);

  // ── Create a new book ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || prompt.trim().length < 10) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, audience, tone, lengthHint, language, pdfTemplate }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const data = await res.json();
      setActiveBookId(data.id);
      setView("progress");
      setPrompt("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, audience, tone, lengthHint, language, pdfTemplate]);

  // ── Poll for book status ───────────────────────────────────────
  useEffect(() => {
    if (!activeBookId) return;
    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${activeBookId}`);
        if (res.ok) {
          const data: BookData = await res.json();
          setBookData(data);
          if (data.status === "DONE" || data.status === "FAILED") {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          }
        }
      } catch { /* keep polling */ }
    };
    fetchBook();
    pollRef.current = setInterval(fetchBook, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [activeBookId]);

  // ── Resume failed book ─────────────────────────────────────────
  const handleResume = useCallback(async () => {
    if (!activeBookId) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/books/${activeBookId}/resume`, { method: "POST" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      setBookData(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsResuming(false);
    }
  }, [activeBookId]);

  // ── Save edited chapter ────────────────────────────────────────
  const handleSaveChapter = useCallback(async (chapterId: string, markdown: string) => {
    try {
      await fetch(`/api/books/${activeBookId}/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      setEditingChapter(null);
      // Refresh book data
      const res = await fetch(`/api/books/${activeBookId}`);
      if (res.ok) setBookData(await res.json());
    } catch { alert("Failed to save chapter"); }
  }, [activeBookId]);

  // ── Progress calculation ───────────────────────────────────────
  const getProgress = (): number => {
    if (!bookData) return 0;
    if (bookData.status === "DONE") return 100;
    if (bookData.status === "FAILED") return 0;
    const chapters = bookData.chapters;
    const totalChapters = chapters.length || 1;
    const doneChapters = chapters.filter((c) => c.status === "DONE").length;
    let progress = 0;
    if (bookData.phases.planning) progress += 10;
    if (bookData.phases.writing) progress += 10 + (doneChapters / totalChapters) * 70;
    if (bookData.phases.exporting) progress += 90;
    return Math.min(Math.round(progress), 95);
  };

  // ── Load history on view change ────────────────────────────────
  useEffect(() => {
    if (view === "history" || view === "dashboard") fetchBooks();
  }, [view, fetchBooks]);

  // ── Open a book from history ───────────────────────────────────
  const openBook = (id: string) => {
    setActiveBookId(id);
    setView("progress");
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setView("landing")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg hidden sm:inline">E-book Generator</span>
          </button>

          <nav className="flex items-center gap-1 ml-4">
            <Button variant={view === "landing" || view === "generate" ? "secondary" : "ghost"} size="sm" onClick={() => setView("generate")}>
              <Sparkles className="w-4 h-4 mr-1" /> New
            </Button>
            <Button variant={view === "history" ? "secondary" : "ghost"} size="sm" onClick={() => setView("history")}>
              <History className="w-4 h-4 mr-1" /> History
            </Button>
            <Button variant={view === "dashboard" ? "secondary" : "ghost"} size="sm" onClick={() => setView("dashboard")}>
              <BarChart3 className="w-4 h-4 mr-1" /> Stats
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {mounted ? (
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle dark mode">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            ) : (
              <Button variant="ghost" size="icon" disabled title="Toggle dark mode">
                <Moon className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        {view === "landing" && <LandingPage onGetStarted={() => setView("generate")} />}
        {view === "generate" && (
          <PromptForm
            prompt={prompt} setPrompt={setPrompt}
            audience={audience} setAudience={setAudience}
            tone={tone} setTone={setTone}
            lengthHint={lengthHint} setLengthHint={setLengthHint}
            language={language} setLanguage={setLanguage}
            pdfTemplate={pdfTemplate} setPdfTemplate={setPdfTemplate}
            onGenerate={handleGenerate} isSubmitting={isSubmitting}
          />
        )}
        {view === "progress" && bookData && (
          <BookProgress
            book={bookData} progress={getProgress()}
            expandedChapter={expandedChapter} setExpandedChapter={setExpandedChapter}
            editingChapter={editingChapter} setEditingChapter={setEditingChapter}
            editMarkdown={editMarkdown} setEditMarkdown={setEditMarkdown}
            onResume={handleResume} isResuming={isResuming}
            onSaveChapter={handleSaveChapter}
            onNewBook={() => { setActiveBookId(null); setBookData(null); setView("generate"); }}
          />
        )}
        {view === "progress" && !bookData && activeBookId && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {view === "history" && <HistoryView books={books} onOpen={openBook} onRefresh={fetchBooks} />}
        {view === "dashboard" && <DashboardView books={books} />}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-3 text-center text-sm text-muted-foreground">
          Powered by AI • Built with Next.js & Tailwind CSS
        </div>
      </footer>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 py-12">
      <div className="relative w-36 h-36">
        <img src="/hero.png" alt="E-book Generator" className="w-full h-full object-contain rounded-2xl" />
      </div>
      <div className="text-center space-y-4 max-w-2xl">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          AI-Powered E-book Generator
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          Describe the book you want, and our AI will plan, write, and format it —
          complete with EPUB, PDF, and MOBI exports.
        </p>
      </div>

      <Button size="lg" onClick={onGetStarted} className="text-lg px-8 py-6">
        <Sparkles className="w-5 h-5 mr-2" /> Start Generating
      </Button>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl mt-8">
        {[
          { icon: BookOpen, title: "Multi-Chapter", desc: "6-12 chapter books with Writer + Editor AI" },
          { icon: FileText, title: "EPUB + PDF + MOBI", desc: "Export to all major e-book formats" },
          { icon: Languages, title: "10 Languages", desc: "Write books in English, Serbian, German..." },
          { icon: Palette, title: "PDF Templates", desc: "Professional, academic, creative, minimalist" },
        ].map((f, i) => (
          <Card key={i} className="text-center">
            <CardContent className="pt-6 pb-4 space-y-2">
              <f.icon className="w-8 h-8 mx-auto text-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Prompt Form ──────────────────────────────────────────────────────

function PromptForm({
  prompt, setPrompt, audience, setAudience, tone, setTone,
  lengthHint, setLengthHint, language, setLanguage, pdfTemplate, setPdfTemplate,
  onGenerate, isSubmitting,
}: {
  prompt: string; setPrompt: (v: string) => void;
  audience: string; setAudience: (v: string) => void;
  tone: string; setTone: (v: string) => void;
  lengthHint: string; setLengthHint: (v: string) => void;
  language: LanguageCode; setLanguage: (v: LanguageCode) => void;
  pdfTemplate: PdfTemplate; setPdfTemplate: (v: PdfTemplate) => void;
  onGenerate: () => void; isSubmitting: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2 mb-6">
        <h2 className="text-2xl font-bold">Create Your E-book</h2>
        <p className="text-muted-foreground">Fill in the details below and let AI do the rest.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Book Topic / Description <span className="text-destructive">*</span></label>
            <Textarea
              placeholder='e.g., "A comprehensive guide to personal finance for millennials — covering budgeting, investing, debt management, and building wealth"'
              value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} className="resize-none"
            />
            <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Audience</label>
              <Input placeholder="General readers" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tone</label>
              <Input placeholder="Informative and engaging" value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Length</label>
              <Input placeholder="Medium (8-12 chapters)" value={lengthHint} onChange={(e) => setLengthHint(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1"><Languages className="w-3.5 h-3.5" /> Language</label>
              <Select value={language} onValueChange={(v) => setLanguage(v as LanguageCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.nativeName} ({l.name})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> PDF Template</label>
              <Select value={pdfTemplate} onValueChange={(v) => setPdfTemplate(v as PdfTemplate)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PDF_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} — {t.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={onGenerate} disabled={isSubmitting || prompt.trim().length < 10} className="w-full" size="lg">
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting generation...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate E-book</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Book Progress ────────────────────────────────────────────────────

function BookProgress({
  book, progress, expandedChapter, setExpandedChapter,
  editingChapter, setEditingChapter, editMarkdown, setEditMarkdown,
  onResume, isResuming, onSaveChapter, onNewBook,
}: {
  book: BookData; progress: number;
  expandedChapter: number | null; setExpandedChapter: (n: number | null) => void;
  editingChapter: number | null; setEditingChapter: (n: number | null) => void;
  editMarkdown: string; setEditMarkdown: (v: string) => void;
  onResume: () => void; isResuming: boolean;
  onSaveChapter: (chapterId: string, markdown: string) => void;
  onNewBook: () => void;
}) {
  const isDone = book.status === "DONE";
  const isFailed = book.status === "FAILED";
  const isActive = !isDone && !isFailed;
  const doneCount = book.chapters.filter((c) => c.status === "DONE").length;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-xl leading-tight">{book.title || "Planning your book..."}</CardTitle>
              {book.subtitle && <p className="text-sm text-muted-foreground">{book.subtitle}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={isDone ? "default" : isFailed ? "destructive" : "secondary"}>{book.status}</Badge>
              <Button variant="outline" size="sm" onClick={onNewBook}>New</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Phase indicators */}
          <div className="grid grid-cols-3 gap-3">
            {(["Planning", "Writing", "Exporting"] as const).map((label) => {
              const key = label.toLowerCase() as "planning" | "writing" | "exporting";
              const done = book.phases[key] && (key === "planning" ? book.phases.writing || isDone : key === "writing" ? book.phases.exporting || isDone : isDone);
              const current = book.status === label.slice(0, -3).toUpperCase() + "ING" || (label === "Writing" && book.status === "WRITING");
              return (
                <div key={key} className={`rounded-lg border p-3 text-center transition-all ${done ? "bg-primary/5 border-primary/20" : current ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-muted"}`}>
                  <div className="flex items-center justify-center mb-1.5">
                    {done ? <CheckCircle2 className="w-5 h-5 text-primary" /> : current ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Circle className="w-5 h-5 text-muted-foreground/40" />}
                  </div>
                  <span className={`text-xs font-medium ${done || current ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                </div>
              );
            })}
          </div>

          {/* Active indicator */}
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {book.status === "PLANNING" && "AI is planning your book structure..."}
                {book.status === "WRITING" && `Writing chapters (${doneCount}/${book.chapters.length} complete)...`}
                {book.status === "EXPORTING" && "Exporting to EPUB, PDF, MOBI..."}
              </span>
            </div>
          )}

          {/* Error + Resume */}
          {isFailed && book.errorMessage && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Generation Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{book.errorMessage}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={onResume} disabled={isResuming}>
                  {isResuming ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Resuming...</> : <><RotateCcw className="w-4 h-4 mr-1" /> Resume from Checkpoint</>}
                </Button>
              </div>
            </div>
          )}

          {/* Token usage */}
          {book.tokenUsage && book.tokenUsage.totalTokens > 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-4">
              <span>Tokens: {book.tokenUsage.totalTokens.toLocaleString()}</span>
              <span>Chapters: {doneCount}/{book.chapters.length}</span>
              {book.language && book.language !== "en" && <span>Lang: {book.language.toUpperCase()}</span>}
            </div>
          )}

          {/* Downloads */}
          {isDone && (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild><a href={`/api/books/${book.id}/download/epub`}><Download className="w-4 h-4 mr-2" /> EPUB</a></Button>
              <Button asChild variant="outline"><a href={`/api/books/${book.id}/download/pdf`}><FileText className="w-4 h-4 mr-2" /> PDF</a></Button>
              {book.mobiPath && (
                <Button asChild variant="outline"><a href={`/api/books/${book.id}/download/mobi`}><Download className="w-4 h-4 mr-2" /> MOBI</a></Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ToC */}
      {book.toc && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><BookOpen className="w-5 h-5" /> Table of Contents</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {book.toc.map((ch, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[2ch] text-right">{i + 1}.</span>
                  <div>
                    <span className="font-medium">{ch.chapterTitle}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ch.subTopics.map((st, j) => (
                        <span key={j} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{st}</span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Chapters with sidebar layout on desktop */}
      {book.chapters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Chapters</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y">
                {book.chapters.map((ch) => {
                  const isExpanded = expandedChapter === ch.chapterNumber;
                  const isEditing = editingChapter === ch.chapterNumber;
                  return (
                    <div key={ch.id} className="px-6">
                      <button
                        className="w-full py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => { setExpandedChapter(isExpanded ? null : ch.chapterNumber); setEditingChapter(null); }}
                      >
                        <ChapterStatusIcon status={ch.status} />
                        <span className="font-medium text-sm flex-1">{ch.chapterNumber}. {ch.title}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{ch.status}</Badge>
                        {ch.markdown && (isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
                      </button>

                      {isExpanded && ch.markdown && !isEditing && (
                        <div className="pb-4 pl-9 space-y-2">
                          <div className="rounded-lg border bg-muted/20 p-4 prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{ch.markdown}</ReactMarkdown>
                          </div>
                          {book.status === "DONE" && (
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingChapter(ch.chapterNumber); setEditMarkdown(ch.markdown || ""); }}>
                              <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                            </Button>
                          )}
                        </div>
                      )}

                      {isEditing && (
                        <div className="pb-4 pl-9 space-y-2">
                          <Textarea value={editMarkdown} onChange={(e) => setEditMarkdown(e.target.value)} rows={15} className="font-mono text-sm" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => onSaveChapter(ch.id, editMarkdown)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingChapter(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── History View ──────────────────────────────────────────────────────

function HistoryView({ books, onOpen, onRefresh }: { books: BookListItem[]; onOpen: (id: string) => void; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Book History</h2>
        <Button variant="outline" size="sm" onClick={onRefresh}><RotateCcw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>
      {books.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No books yet. Create your first e-book!</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onOpen(b.id)}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight line-clamp-2">{b.title || "Untitled"}</h3>
                  <Badge variant={b.status === "DONE" ? "default" : b.status === "FAILED" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">{b.status}</Badge>
                </div>
                {b.subtitle && <p className="text-sm text-muted-foreground line-clamp-1">{b.subtitle}</p>}
                <p className="text-xs text-muted-foreground line-clamp-2">{b.prompt.slice(0, 120)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                  {b.language && b.language !== "en" && <Badge variant="outline" className="text-[10px]">{b.language.toUpperCase()}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────

function DashboardView({ books }: { books: BookListItem[] }) {
  const total = books.length;
  const done = books.filter((b) => b.status === "DONE").length;
  const failed = books.filter((b) => b.status === "FAILED").length;
  const inProgress = total - done - failed;

  const stats = [
    { label: "Total Books", value: total, icon: BookOpen },
    { label: "Completed", value: done, icon: CheckCircle2 },
    { label: "In Progress", value: inProgress, icon: Loader2 },
    { label: "Failed", value: failed, icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-5 flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Languages used */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Languages Used</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.filter((l) => books.some((b) => b.language === l.code)).length === 0 ? (
              <p className="text-sm text-muted-foreground">No books generated yet.</p>
            ) : (
              SUPPORTED_LANGUAGES.filter((l) => books.some((b) => b.language === l.code)).map((l) => (
                <Badge key={l.code} variant="secondary">{l.nativeName} ({books.filter((b) => b.language === l.code).length})</Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {books.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {books.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center gap-3 text-sm">
                  <ChapterStatusIcon status={b.status} />
                  <span className="flex-1 truncate">{b.title || "Untitled"}</span>
                  <span className="text-muted-foreground shrink-0">{new Date(b.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────

function ChapterStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "DONE": return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
    case "GENERATING": case "EDITING": return <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
    case "FAILED": return <AlertCircle className="w-4 h-4 text-destructive shrink-0" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}
