"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen, Download, FileText, Loader2, CheckCircle2, Circle,
  Clock, AlertCircle, Sparkles, ChevronDown, ChevronUp, RotateCcw,
  Sun, Moon, History, BarChart3, Edit3, X, Languages, Palette,
  LogIn, LogOut, User, Mail, Lock, UserPlus,
  Cloud, CloudUpload, CloudDownload, Database, Copy, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
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
  userId: string | null;
  createdAt: string; completedAt: string | null;
}

type ViewMode = "landing" | "generate" | "progress" | "history" | "dashboard" | "auth" | "cloud";

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

// ─── Dark Mode Hook ───────────────────────────────────────────────────

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("ebook-dark-mode");
    const prefersDark = saved === "true" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (prefersDark) document.documentElement.classList.add("dark");
    return prefersDark;
  });

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("ebook-dark-mode", String(next));
      return next;
    });
  }, []);

  return { dark, toggle };
}

// ─── Main App ─────────────────────────────────────────────────────────

export default function Home() {
  const [view, setView] = useState<ViewMode>("landing");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [books, setBooks] = useState<BookListItem[]>([]);
  const { dark, toggle: toggleDark } = useDarkMode();

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setAuthUser(data.user);
          }
        }
      } catch { /* ignore */ } finally { setAuthLoading(false); }
    })();
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    setAuthUser(data.user);
    setView("landing");
  }, []);

  // Email verification state
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

  const handleRegister = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    // Check if email verification is needed (no session returned)
    if (data.needsVerification) {
      setVerificationNeeded(true);
      setVerificationEmail(email);
      return;
    }

    if (!data.user) throw new Error(data.message || "Registration succeeded but no session");
    setAuthUser(data.user);
    setView("landing");
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setView("landing");
  }, []);

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

  // ── Delete a book ──────────────────────────────────────────────
  const handleDeleteBook = useCallback(async (bookId: string) => {
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      // Refresh the list
      await fetchBooks();
      // If we're viewing this book, go back to history
      if (activeBookId === bookId) {
        setActiveBookId(null);
        setBookData(null);
        setView("history");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete book");
    }
  }, [fetchBooks, activeBookId]);

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
            <Button variant={view === "cloud" ? "secondary" : "ghost"} size="sm" onClick={() => setView("cloud")}>
              <Cloud className="w-4 h-4 mr-1" /> Cloud
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {authUser ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {authUser.displayName || authUser.email}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-1" /> Logout
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setView("auth")}>
                <LogIn className="w-4 h-4 mr-1" /> Sign In
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggleDark} title="Toggle dark mode">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
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
        {view === "history" && <HistoryView books={books} onOpen={openBook} onRefresh={fetchBooks} onDelete={handleDeleteBook} />}
        {view === "dashboard" && <DashboardView books={books} />}
        {view === "cloud" && <CloudView />}
        {view === "auth" && (
          <AuthView
            onLogin={handleLogin}
            onRegister={handleRegister}
            verificationNeeded={verificationNeeded}
            verificationEmail={verificationEmail}
            onVerificationDismiss={() => setVerificationNeeded(false)}
          />
        )}
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

function HistoryView({ books, onOpen, onRefresh, onDelete }: { books: BookListItem[]; onOpen: (id: string) => void; onRefresh: () => void; onDelete: (id: string) => void }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (bookId: string) => {
    setDeletingId(bookId);
    setConfirmDeleteId(null);
    try {
      await onDelete(bookId);
    } finally {
      setDeletingId(null);
    }
  };

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
            <Card key={b.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight line-clamp-2 cursor-pointer hover:text-primary transition-colors" onClick={() => onOpen(b.id)}>{b.title || "Untitled"}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={b.status === "DONE" ? "default" : b.status === "FAILED" ? "destructive" : "secondary"} className="text-[10px]">{b.status}</Badge>
                  </div>
                </div>
                {b.subtitle && <p className="text-sm text-muted-foreground line-clamp-1">{b.subtitle}</p>}
                <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" onClick={() => onOpen(b.id)}>{b.prompt.slice(0, 120)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                  {b.language && b.language !== "en" && <Badge variant="outline" className="text-[10px]">{b.language.toUpperCase()}</Badge>}
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2 border-t mt-2">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => onOpen(b.id)}>
                    <BookOpen className="w-3.5 h-3.5 mr-1" /> View
                  </Button>
                  {confirmDeleteId === b.id ? (
                    <>
                      <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(b.id)} disabled={deletingId === b.id}>
                        {deletingId === b.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteId(b.id)}>
                      <X className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  )}
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

// ─── Auth View (Login / Register) ─────────────────────────────────────

function AuthView({
  onLogin,
  onRegister,
  verificationNeeded,
  verificationEmail,
  onVerificationDismiss,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, displayName: string) => Promise<void>;
  verificationNeeded: boolean;
  verificationEmail: string;
  onVerificationDismiss: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        await onRegister(email, password, displayName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Email verification success screen
  if (verificationNeeded) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10">
              <Mail className="w-7 h-7 text-green-600" />
            </div>
            <CardTitle className="text-xl">Check Your Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
              <p className="text-sm text-center">
                We&apos;ve sent a verification link to:
              </p>
              <p className="text-sm font-semibold text-center break-all">{verificationEmail}</p>
              <p className="text-xs text-muted-foreground text-center">
                Click the link in the email to activate your account, then sign in below.
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>Didn&apos;t receive the email? Check your spam folder.</p>
              <p>The link expires in 24 hours.</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { onVerificationDismiss(); setMode("login"); }}>
              <LogIn className="w-4 h-4 mr-2" /> Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <User className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => { setMode(v as "login" | "register"); setError(""); }}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-9"
                />
              </div>
              {mode === "register" && (
                <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {mode === "login" ? "Signing in..." : "Creating account..."}</>
              ) : (
                <>{mode === "login" ? "Sign In" : "Create Account"}</>
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>Don&apos;t have an account? <button onClick={() => { setMode("register"); setError(""); }} className="text-primary hover:underline">Register</button></>
            ) : (
              <>Already have an account? <button onClick={() => { setMode("login"); setError(""); }} className="text-primary hover:underline">Sign in</button></>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────

// ─── Cloud View (Supabase Sync) ────────────────────────────────────────

function CloudView() {
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    bookCount: number;
    tableExists: boolean;
    storageBucketExists: boolean;
    setupSQL?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<{ type: "push" | "pull"; data: Record<string, unknown> } | null>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handlePush = async () => {
    setPushing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const data = await res.json();
      setResult({ type: "push", data });
    } catch (err) {
      setResult({ type: "push", data: { error: err instanceof Error ? err.message : "Push failed" } });
    } finally { setPushing(false); }
  };

  const handlePull = async () => {
    if (!confirm("This will overwrite local data with cloud data. Are you sure?")) return;
    setPulling(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync/pull", { method: "POST" });
      const data = await res.json();
      setResult({ type: "pull", data });
    } catch (err) {
      setResult({ type: "pull", data: { error: err instanceof Error ? err.message : "Pull failed" } });
    } finally { setPulling(false); }
  };

  const handleCopySQL = async () => {
    if (!status?.setupSQL) return;
    await navigator.clipboard.writeText(status.setupSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Cloud className="w-6 h-6" /> Cloud Sync</h2>
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">Supabase Not Configured</h3>
            <p className="text-muted-foreground">
              Add <code className="bg-muted px-1.5 py-0.5 rounded text-sm">SUPABASE_URL</code> and
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm ml-1">SUPABASE_SERVICE_KEY</code> to your
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm ml-1">.env</code> file to enable cloud sync.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Cloud className="w-6 h-6" /> Cloud Sync</h2>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          <RotateCcw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Connection Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${status.connected ? "bg-green-500/10" : "bg-red-500/10"}`}>
              {status.connected ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Connection</p>
              <p className="font-semibold">{status.connected ? "Connected" : "Disconnected"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cloud Books</p>
              <p className="font-semibold">{status.bookCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${status.storageBucketExists ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
              {status.storageBucketExists ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-yellow-600" />}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Storage</p>
              <p className="font-semibold">{status.storageBucketExists ? "Ready" : "Not Set Up"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Required */}
      {!status.tableExists && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="w-5 h-5" /> Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Supabase tables don&apos;t exist yet. You need to run the SQL setup script in your Supabase Dashboard.
            </p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>Go to <strong>Supabase Dashboard</strong> &rarr; <strong>SQL Editor</strong></li>
              <li>Click <strong>New Query</strong></li>
              <li>Copy the SQL below and paste it</li>
              <li>Click <strong>Run</strong></li>
            </ol>
            <Button variant="outline" size="sm" onClick={() => setShowSQL(!showSQL)}>
              {showSQL ? "Hide" : "Show"} SQL Setup Script
            </Button>
            {showSQL && status.setupSQL && (
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96 border">
                  {status.setupSQL}
                </pre>
                <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={handleCopySQL}>
                  {copied ? <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync Actions */}
      {status.tableExists && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudUpload className="w-5 h-5 text-primary" /> Push to Cloud
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload all local books, chapters, and files (PDF, EPUB, MOBI, covers) to Supabase cloud storage.
              </p>
              <Button onClick={handlePush} disabled={pushing} className="w-full">
                {pushing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pushing...</> : <><CloudUpload className="w-4 h-4 mr-2" /> Push All to Cloud</>}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudDownload className="w-5 h-5 text-primary" /> Restore from Cloud
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Download all books and chapters from Supabase cloud to your local database. Overwrites local data.
              </p>
              <Button onClick={handlePull} disabled={pulling} variant="outline" className="w-full">
                {pulling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restoring...</> : <><CloudDownload className="w-4 h-4 mr-2" /> Pull from Cloud</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Result */}
      {result && (
        <Card className={result.data.error ? "border-destructive/50" : "border-green-500/50"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {result.data.error ? <AlertCircle className="w-5 h-5 text-destructive" /> : <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {result.type === "push" ? "Push Result" : "Restore Result"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.data.error ? (
              <p className="text-sm text-destructive">{String(result.data.error)}</p>
            ) : (
              <div className="space-y-2 text-sm">
                {result.type === "push" ? (
                  <>
                    <p><strong>Books synced:</strong> {String(result.data.booksSynced ?? 0)}</p>
                    <p><strong>Chapters synced:</strong> {String(result.data.chaptersSynced ?? 0)}</p>
                    <p><strong>Files uploaded:</strong> {String(result.data.filesSynced ?? 0)}</p>
                    {Array.isArray(result.data.errors) && result.data.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-yellow-600">Warnings:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {result.data.errors.map((e: unknown, i: number) => <li key={i}>{String(e)}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p><strong>Books restored:</strong> {String(result.data.booksRestored ?? 0)}</p>
                    <p><strong>Chapters restored:</strong> {String(result.data.chaptersRestored ?? 0)}</p>
                    {Array.isArray(result.data.errors) && result.data.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-yellow-600">Warnings:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {result.data.errors.map((e: unknown, i: number) => <li key={i}>{String(e)}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Auto-sync info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Auto-Sync
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Auto-sync is <Badge variant="default" className="ml-1">Enabled</Badge>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Book data (title, chapters, status) is automatically synced to Supabase on every change:
            when a book is created, when planning completes, when each chapter finishes writing,
            and when the final export is done. File uploads (PDF, EPUB, MOBI, cover images) are
            synced when a book generation completes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChapterStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "DONE": return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
    case "GENERATING": case "EDITING": return <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
    case "FAILED": return <AlertCircle className="w-4 h-4 text-destructive shrink-0" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}
