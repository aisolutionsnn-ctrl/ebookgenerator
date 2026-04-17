"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Download,
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

// ─── Types ────────────────────────────────────────────────────────────

interface ChapterInfo {
  id: string;
  chapterNumber: number;
  title: string;
  outline: string | null;
  markdown: string | null;
  status: "PENDING" | "GENERATING" | "EDITING" | "DONE" | "FAILED";
  generatedAt: string | null;
  editedAt: string | null;
}

interface BookData {
  id: string;
  prompt: string;
  audience: string;
  tone: string;
  lengthHint: string;
  status: "PLANNING" | "WRITING" | "EXPORTING" | "DONE" | "FAILED";
  title: string | null;
  subtitle: string | null;
  toc: { chapterTitle: string; subTopics: string[] }[] | null;
  phases: { planning: boolean; writing: boolean; exporting: boolean };
  errorMessage: string | null;
  epubPath: string | null;
  pdfPath: string | null;
  createdAt: string;
  completedAt: string | null;
  chapters: ChapterInfo[];
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function Home() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);

  // Form state
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState("General readers");
  const [tone, setTone] = useState("Informative and engaging");
  const [lengthHint, setLengthHint] = useState("Medium (8-12 chapters)");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Chapter preview
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Create a new book ───────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || prompt.trim().length < 10) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, audience, tone, lengthHint }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create book");
      }

      const data = await res.json();
      setActiveBookId(data.id);
      setPrompt("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, audience, tone, lengthHint]);

  // ── Poll for book status ────────────────────────────────────────

  useEffect(() => {
    if (!activeBookId) return;

    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${activeBookId}`);
        if (res.ok) {
          const data: BookData = await res.json();
          setBookData(data);

          // Stop polling when done or failed
          if (data.status === "DONE" || data.status === "FAILED") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    fetchBook();
    pollRef.current = setInterval(fetchBook, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeBookId]);

  // ── Reset and start a new book ──────────────────────────────────

  const handleNewBook = () => {
    setActiveBookId(null);
    setBookData(null);
    setExpandedChapter(null);
  };

  // ── Resume a failed book ──────────────────────────────────────

  const handleResume = useCallback(async () => {
    if (!activeBookId) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/books/${activeBookId}/resume`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to resume book");
      }
      // Re-start polling
      setBookData(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(message);
    } finally {
      setIsResuming(false);
    }
  }, [activeBookId]);

  // ── Progress calculation ────────────────────────────────────────

  const getProgress = (): number => {
    if (!bookData) return 0;
    if (bookData.status === "DONE") return 100;
    if (bookData.status === "FAILED") return 0;

    const phases = bookData.phases;
    const chapters = bookData.chapters;
    const totalChapters = chapters.length || 1;
    const doneChapters = chapters.filter((c) => c.status === "DONE").length;

    let progress = 0;
    if (phases.planning) progress += 10;
    if (phases.writing) progress += 10 + (doneChapters / totalChapters) * 70;
    if (phases.exporting) progress += 90;

    return Math.min(Math.round(progress), 95); // Cap at 95 until truly DONE
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">E-book Generator</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered non-fiction e-book creation
            </p>
          </div>
          {bookData && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleNewBook}
            >
              <Sparkles className="w-4 h-4 mr-1" /> New Book
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-6 w-full">
        {!bookData ? (
          <PromptForm
            prompt={prompt}
            setPrompt={setPrompt}
            audience={audience}
            setAudience={setAudience}
            tone={tone}
            setTone={setTone}
            lengthHint={lengthHint}
            setLengthHint={setLengthHint}
            onGenerate={handleGenerate}
            isSubmitting={isSubmitting}
          />
        ) : (
          <BookProgress
            book={bookData}
            progress={getProgress()}
            expandedChapter={expandedChapter}
            setExpandedChapter={setExpandedChapter}
            onResume={handleResume}
            isResuming={isResuming}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-3 text-center text-sm text-muted-foreground">
          Powered by AI • Built with Next.js & Tailwind CSS
        </div>
      </footer>
    </div>
  );
}

// ─── Prompt Form Component ────────────────────────────────────────────

function PromptForm({
  prompt,
  setPrompt,
  audience,
  setAudience,
  tone,
  setTone,
  lengthHint,
  setLengthHint,
  onGenerate,
  isSubmitting,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  audience: string;
  setAudience: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  lengthHint: string;
  setLengthHint: (v: string) => void;
  onGenerate: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-2xl space-y-6">
        {/* Hero section with image */}
        <div className="text-center space-y-4 mb-8">
          <div className="relative w-32 h-32 mx-auto mb-2">
            <img
              src="/hero.png"
              alt="E-book Generator"
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Generate Your E-book
          </h2>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Describe the book you want, and our AI will plan, write, and format
            it for you — complete with EPUB and PDF exports.
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Book Topic / Description{" "}
                <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder='e.g., "A comprehensive guide to personal finance for millennials — covering budgeting, investing, debt management, and building wealth over time"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Describe your book topic, what it should cover, and any specific
                requirements. Minimum 10 characters.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Audience</label>
                <Input
                  placeholder="General readers"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tone</label>
                <Input
                  placeholder="Informative and engaging"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Length</label>
                <Input
                  placeholder="Medium (8-12 chapters)"
                  value={lengthHint}
                  onChange={(e) => setLengthHint(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={onGenerate}
              disabled={isSubmitting || prompt.trim().length < 10}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting
                  generation...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Generate E-book
                </>
              )}
            </Button>

            {/* Feature badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="secondary" className="text-xs">
                <BookOpen className="w-3 h-3 mr-1" /> Multi-chapter
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <FileText className="w-3 h-3 mr-1" /> EPUB + PDF
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="w-3 h-3 mr-1" /> Writer + Editor AI
              </Badge>
              <Badge variant="secondary" className="text-xs">
                💰 Free to use
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Book Progress Component ──────────────────────────────────────────

function BookProgress({
  book,
  progress,
  expandedChapter,
  setExpandedChapter,
  onResume,
  isResuming,
}: {
  book: BookData;
  progress: number;
  expandedChapter: number | null;
  setExpandedChapter: (n: number | null) => void;
  onResume: () => void;
  isResuming: boolean;
}) {
  const isDone = book.status === "DONE";
  const isFailed = book.status === "FAILED";
  const isActive = !isDone && !isFailed;

  return (
    <div className="space-y-6">
      {/* Book header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-xl leading-tight">
                {book.title || "Planning your book..."}
              </CardTitle>
              {book.subtitle && (
                <p className="text-sm text-muted-foreground">{book.subtitle}</p>
              )}
            </div>
            <Badge
              variant={
                isDone
                  ? "default"
                  : isFailed
                    ? "destructive"
                    : "secondary"
              }
              className="shrink-0"
            >
              {book.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Phase indicators */}
          <div className="grid grid-cols-3 gap-3">
            <PhaseIndicator
              label="Planning"
              active={book.phases.planning}
              done={book.phases.planning && (book.phases.writing || isDone)}
              isCurrentPhase={book.status === "PLANNING"}
            />
            <PhaseIndicator
              label="Writing"
              active={book.phases.writing}
              done={book.phases.writing && (book.phases.exporting || isDone)}
              isCurrentPhase={book.status === "WRITING"}
            />
            <PhaseIndicator
              label="Exporting"
              active={book.phases.exporting}
              done={isDone}
              isCurrentPhase={book.status === "EXPORTING"}
            />
          </div>

          {/* Error message */}
          {isFailed && book.errorMessage && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">
                  Generation Failed
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {book.errorMessage}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onResume}
                  disabled={isResuming}
                >
                  {isResuming ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Resuming...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 mr-1" /> Resume from Checkpoint
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Active indicator */}
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {book.status === "PLANNING" &&
                  "AI is planning your book structure..."}
                {book.status === "WRITING" &&
                  `Writing chapters (${
                    book.chapters.filter((c) => c.status === "DONE").length
                  }/${book.chapters.length} complete)...`}
                {book.status === "EXPORTING" &&
                  "Exporting to EPUB and PDF..."}
              </span>
            </div>
          )}

          {/* Download buttons */}
          {isDone && (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild>
                <a href={`/api/books/${book.id}/download/epub`}>
                  <Download className="w-4 h-4 mr-2" /> Download EPUB
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/books/${book.id}/download/pdf`}>
                  <FileText className="w-4 h-4 mr-2" /> Download PDF
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table of Contents */}
      {book.toc && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Table of Contents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {book.toc.map((ch, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[2ch] text-right">
                    {i + 1}.
                  </span>
                  <div>
                    <span className="font-medium">{ch.chapterTitle}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ch.subTopics.map((st, j) => (
                        <span
                          key={j}
                          className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Chapters list with previews */}
      {book.chapters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" /> Chapters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y">
                {book.chapters.map((ch) => {
                  const isExpanded = expandedChapter === ch.chapterNumber;
                  return (
                    <div key={ch.id} className="px-6">
                      <button
                        className="w-full py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                        onClick={() =>
                          setExpandedChapter(
                            isExpanded ? null : ch.chapterNumber
                          )
                        }
                      >
                        <ChapterStatusIcon status={ch.status} />
                        <span className="font-medium text-sm flex-1">
                          {ch.chapterNumber}. {ch.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs shrink-0"
                        >
                          {ch.status}
                        </Badge>
                        {ch.markdown && (
                          <>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </>
                        )}
                      </button>

                      {/* Chapter preview */}
                      {isExpanded && ch.markdown && (
                        <div className="pb-4 pl-9">
                          <div className="rounded-lg border bg-muted/20 p-4 prose prose-sm max-w-none">
                            <ReactMarkdown>{ch.markdown}</ReactMarkdown>
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

// ─── Phase Indicator ──────────────────────────────────────────────────

function PhaseIndicator({
  label,
  active,
  done,
  isCurrentPhase,
}: {
  label: string;
  active: boolean;
  done: boolean;
  isCurrentPhase: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-center transition-all ${
        done
          ? "bg-primary/5 border-primary/20"
          : isCurrentPhase
            ? "bg-primary/10 border-primary/30"
            : "bg-muted/30 border-muted"
      }`}
    >
      <div className="flex items-center justify-center mb-1.5">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-primary" />
        ) : isCurrentPhase ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground/40" />
        )}
      </div>
      <span
        className={`text-xs font-medium ${
          done || isCurrentPhase ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Chapter Status Icon ──────────────────────────────────────────────

function ChapterStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "DONE":
      return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
    case "GENERATING":
    case "EDITING":
      return <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
    case "FAILED":
      return <AlertCircle className="w-4 h-4 text-destructive shrink-0" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}
