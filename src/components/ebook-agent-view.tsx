"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  BookOpen, Search, Trophy, CheckSquare, TrendingUp, Image as ImageIcon,
  Loader2, ChevronRight, Copy, CheckCircle, Sparkles,
  Download, Star, DollarSign, Tag, FileText, ExternalLink,
  Circle, HalfCircle, Zap, PartyPopper, PenLine, FileOutput,
  Brain, AlertCircle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NICHE_CATEGORIES } from "@/lib/agent/niche-data";
import type {
  NicheResearchResult, CompetitionResult, QualityAssessmentResult,
  SeoSalesResult, CoverPromptResult, AgentStep,
} from "@/lib/agent/types";

// ─── Safe Fetch Helper ────────────────────────────────────────────────

/**
 * Safe fetch that handles HTML error pages from Next.js dev server.
 * Prevents "Unexpected token '<'" JSON parse errors.
 */
async function safeFetchJSON<T = unknown>(url: string, options?: RequestInit): Promise<{ data: T; ok: boolean }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    const isJSON = contentType.includes("application/json");

    if (!isJSON) {
      // Server returned HTML (error page, 404, etc.)
      const text = await res.text();
      const preview = text.slice(0, 100).replace(/<[^>]*>/g, "").trim();
      throw new Error(
        res.status === 404
          ? `API endpoint not found (${url}). The server may be restarting.`
          : res.status >= 500
          ? `Server error (${res.status}). Please try again in a moment.`
          : `Unexpected response from server: ${preview || res.statusText}`
      );
    }

    const data = await res.json() as T;
    return { data, ok: res.ok };
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error("Network error — the server may be down or restarting. Please try again.");
    }
    throw err;
  }
}

// ─── CSS Keyframe Animations ─────────────────────────────────────────

const ANIMATION_STYLES = `
@keyframes agent-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes agent-slide-in {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes agent-pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0); }
  50% { box-shadow: 0 0 12px 4px rgba(var(--primary-rgb), 0.15); }
}
@keyframes agent-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes agent-dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}
@keyframes agent-confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100px) rotate(720deg); opacity: 0; }
}
@keyframes agent-progress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@keyframes agent-celebrate-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
@keyframes agent-rotate-msg {
  0% { opacity: 0; transform: translateY(8px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-8px); }
}
.anim-fade-in { animation: agent-fade-in 0.4s ease-out both; }
.anim-slide-in { animation: agent-slide-in 0.35s ease-out both; }
.anim-pulse-glow { animation: agent-pulse-glow 2s ease-in-out infinite; }
.anim-shimmer {
  background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.08) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: agent-shimmer 1.5s ease-in-out infinite;
}
.anim-progress-pulse { animation: agent-progress-pulse 1.5s ease-in-out infinite; }
.anim-celebrate { animation: agent-celebrate-bounce 0.6s ease-in-out; }
.anim-rotate-msg { animation: agent-rotate-msg 2s ease-in-out; }
.confetti-piece {
  position: absolute;
  width: 8px; height: 8px;
  border-radius: 2px;
  animation: agent-confetti-fall 1.5s ease-out forwards;
}
@keyframes agent-typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-4px); }
}
.typing-dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: currentColor; margin: 0 2px; }
.typing-dot:nth-child(1) { animation: agent-typing 1.4s ease-in-out infinite; }
.typing-dot:nth-child(2) { animation: agent-typing 1.4s ease-in-out 0.2s infinite; }
.typing-dot:nth-child(3) { animation: agent-typing 1.4s ease-in-out 0.4s infinite; }
`;

// ─── Types ────────────────────────────────────────────────────────────

interface EbookAgentViewProps {
  onOpenBook: (id: string) => void;
}

interface BookProgress {
  id: string;
  title: string | null;
  status: string;
  progress: number;
  currentPhase: string;
  doneChapters: number;
  totalChapters: number;
  errorMessage: string | null;
  angle: string | null;
  currentChapterNum?: number | null;
  currentChapterStatus?: string | null;
  currentChapterTitle?: string | null;
}

interface AgentState {
  sessionId: string | null;
  currentStep: AgentStep;
  niche: string;
  subNiche: string;
  customNiche: string;
  nicheData: NicheResearchResult | null;
  competitionData: CompetitionResult | null;
  generatedBookIds: string[];
  evaluationData: QualityAssessmentResult[] | null;
  seoData: SeoSalesResult[] | null;
  coverData: CoverPromptResult[] | null;
  loading: boolean;
  error: string | null;
  bookProgress: BookProgress[];
  allBooksDone: boolean;
  showCelebration: boolean;
}

const STEPS = [
  { num: 1, label: "Niche Research", icon: Search, desc: "Find profitable sub-niches" },
  { num: 2, label: "Competition & Create", icon: Trophy, desc: "Analyze competitors, create your book" },
  { num: 3, label: "Quality Assessment", icon: CheckSquare, desc: "Evaluate book quality" },
  { num: 4, label: "SEO & Sales Prep", icon: TrendingUp, desc: "Optimize for sales" },
  { num: 5, label: "Cover Image", icon: ImageIcon, desc: "Generate cover prompts" },
];

const LOADING_MESSAGES = [
  "Searching the web...",
  "Analyzing market data...",
  "Generating insights...",
  "Processing information...",
  "Building recommendations...",
  "Evaluating opportunities...",
  "Crafting strategies...",
  "Identifying patterns...",
];

const CONFETTI_COLORS = [
  "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// ─── Typing Dots Animation ─────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center ml-1">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

// ─── Helper: Compute book progress from API data ─────────────────────

function computeBookProgress(bookData: {
  id: string;
  title: string | null;
  status: string;
  phases: { planning?: boolean; writing?: boolean; exporting?: boolean } | null;
  chapters: { status: string }[];
  errorMessage: string | null;
  prompt: string;
}): BookProgress {
  const phases = bookData.phases || { planning: false, writing: false, exporting: false };
  const doneChapters = bookData.chapters.filter((c) => c.status === "DONE").length;
  const totalChapters = bookData.chapters.length;

  let currentPhase = "Queued";
  let progress = 0;

  if (bookData.status === "DONE") {
    currentPhase = "Done";
    progress = 100;
  } else if (bookData.status === "FAILED") {
    currentPhase = "Failed";
    progress = 0;
  } else if (bookData.status === "EXPORTING") {
    currentPhase = "Exporting";
    progress = 85;
  } else if (bookData.status === "WRITING") {
    currentPhase = "Writing";
    progress = totalChapters > 0 ? 20 + Math.round((doneChapters / totalChapters) * 60) : 40;
  } else if (bookData.status === "PLANNING") {
    currentPhase = "Planning";
    progress = 10;
  }

  return {
    id: bookData.id,
    title: bookData.title,
    status: bookData.status,
    progress,
    currentPhase,
    doneChapters,
    totalChapters,
    errorMessage: bookData.errorMessage,
    angle: bookData.prompt,
  };
}

// ─── Animated Loader Component ───────────────────────────────────────

function AgentLoader({ messages }: { messages?: string[] }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const msgs = messages || LOADING_MESSAGES;

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % msgs.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [msgs.length]);

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <div className="h-6 flex items-center">
        <p key={msgIndex} className="text-sm text-muted-foreground anim-rotate-msg">
          {msgs[msgIndex]}
        </p>
      </div>
    </div>
  );
}

// ─── Confetti Effect ─────────────────────────────────────────────────

function ConfettiEffect() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 6,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            top: "-10px",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}

// ─── Book Progress Card ──────────────────────────────────────────────

function BookProgressCard({ book, index, onOpenBook }: {
  book: BookProgress; index: number; onOpenBook?: (id: string) => void;
}) {
  const isDone = book.status === "DONE";
  const isFailed = book.status === "FAILED";
  const isActive = !isDone && !isFailed;

  const phaseSteps = [
    { label: "Planning", done: book.status !== "PLANNING" || isDone || isFailed, active: book.status === "PLANNING" },
    { label: "Writing", done: ["WRITING", "EXPORTING", "DONE"].includes(book.status), active: book.status === "WRITING" },
    { label: "Exporting", done: ["EXPORTING", "DONE"].includes(book.status), active: book.status === "EXPORTING" },
    { label: "Done", done: isDone, active: false },
  ];

  const statusColor = isDone
    ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
    : isFailed
    ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
    : "bg-primary/5 text-primary border-primary/20";

  const progressColor = isDone
    ? "bg-green-500"
    : isFailed
    ? "bg-red-500"
    : "bg-primary";

  return (
    <Card
      className={`anim-fade-in ${isDone ? "border-green-500/30" : isFailed ? "border-red-500/30" : ""}`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Title & Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base">
                {isDone ? "📗" : isFailed ? "📕" : "📘"}
              </span>
              <h4 className="text-sm font-semibold truncate">
                {book.title || `Book ${index + 1}`}
              </h4>
            </div>
            {book.angle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Angle: {book.angle}
              </p>
            )}
          </div>
          <Badge variant="outline" className={`shrink-0 text-xs ${statusColor}`}>
            {isDone ? "DONE" : isFailed ? "FAILED" : book.currentPhase}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {(() => {
                if (isDone) return "Complete — ready to view";
                if (isFailed) return "Generation failed";
                if (book.status === "EXPORTING") return "Exporting to EPUB, PDF...";
                if (book.status === "WRITING") {
                  if (book.currentChapterTitle && book.currentChapterNum) {
                    const action = book.currentChapterStatus === "EDITING" ? "Editing" : "Writing";
                    return `${action} Ch. ${book.currentChapterNum}: "${book.currentChapterTitle}"`;
                  }
                  if (book.totalChapters > 0) {
                    return `Writing Chapter ${book.doneChapters + 1}/${book.totalChapters}`;
                  }
                  return "Writing...";
                }
                if (book.status === "PLANNING") return "Planning book structure...";
                return "Queued...";
              })()}
              {isActive && <TypingDots />}
            </span>
            <div className="flex items-center gap-2">
              {isActive && book.status === "WRITING" && book.totalChapters > 0 && (() => {
                const remaining = book.totalChapters - book.doneChapters;
                if (remaining <= 0) return null;
                const minutes = Math.ceil(remaining * 0.5);
                return <span className="text-muted-foreground/70">~{minutes} min left</span>;
              })()}
              <span className="font-medium">{book.progress}%</span>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressColor} ${
                isActive ? "anim-progress-pulse" : ""
              }`}
              style={{ width: `${book.progress}%` }}
            />
          </div>
        </div>

        {/* Phase Pipeline */}
        <div className="flex items-center gap-1">
          {phaseSteps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1">
              {i > 0 && (
                <div className={`w-4 h-px ${step.done ? "bg-green-400" : "bg-muted-foreground/30"}`} />
              )}
              <div className="flex items-center gap-1">
                {step.done ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : step.active ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
                <span className={`text-xs ${step.done ? "text-green-700 dark:text-green-400 font-medium" : step.active ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Chapter progress (when writing) */}
        {book.status === "WRITING" && book.totalChapters > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: book.totalChapters }, (_, i) => (
              <div
                key={i}
                className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-medium border ${
                  i < book.doneChapters
                    ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
                    : i === book.doneChapters
                    ? "bg-primary/10 border-primary/30 text-primary anim-pulse-glow"
                    : "bg-muted/30 border-muted text-muted-foreground"
                }`}
              >
                {i < book.doneChapters ? "✓" : i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Error message + Resume */}
        {isFailed && book.errorMessage && (
          <div className="rounded-md bg-red-500/5 border border-red-500/20 p-2 space-y-2">
            <div className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{book.errorMessage}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={async () => {
                try {
                  const { ok } = await safeFetchJSON(`/api/books/${book.id}/resume`, { method: "POST" });
                  if (ok) window.location.reload();
                } catch (err) {
                  console.error("Resume failed:", err);
                }
              }}
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Resume from Checkpoint
            </Button>
          </div>
        )}

        {/* View button when done */}
        {isDone && onOpenBook && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenBook(book.id)}>
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> View Book
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Overall Progress Bar ────────────────────────────────────────────

function OverallProgressBar({ currentStep, loading, bookProgress }: {
  currentStep: AgentStep; loading: boolean; bookProgress: BookProgress[];
}) {
  const stepProgress = ((currentStep - 1) / 4) * 100;

  // Calculate book generation progress if on step 2
  let bookGenProgress = 0;
  if (currentStep >= 2 && bookProgress.length > 0) {
    const doneCount = bookProgress.filter((b) => b.status === "DONE" || b.status === "FAILED").length;
    bookGenProgress = Math.round((doneCount / bookProgress.length) * 100);
  }

  const overallProgress = currentStep >= 2 && bookProgress.length > 0
    ? Math.min(stepProgress + (bookGenProgress / 4) * (currentStep === 2 ? 1 : 1), 100)
    : stepProgress;

  const stepDesc = loading
    ? `Step ${currentStep}: Processing...`
    : currentStep === 1
    ? "Step 1: Research your niche"
    : currentStep === 2
    ? "Step 2: Analyze competition & generate books"
    : currentStep === 3
    ? "Step 3: Assess book quality"
    : currentStep === 4
    ? "Step 4: SEO & sales optimization"
    : "Step 5: Generate cover images";

  return (
    <div className="space-y-2 anim-fade-in">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{stepDesc}</span>
        <span className="font-medium">{Math.round(overallProgress)}%</span>
      </div>
      <Progress value={overallProgress} className="h-2" />
      {/* Step dots */}
      <div className="flex items-center justify-between">
        {STEPS.map((step) => {
          const isCompleted = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          const Icon = step.icon;
          return (
            <div key={step.num} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                isCompleted ? "bg-green-500/10 text-green-600" :
                isCurrent ? "bg-primary/10 text-primary anim-pulse-glow" :
                "bg-muted/50 text-muted-foreground"
              }`}>
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isCurrent && loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
              <span className={`text-[10px] hidden sm:block ${
                isCurrent ? "text-primary font-medium" : "text-muted-foreground"
              }`}>
                {step.num}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function EbookAgentView({ onOpenBook }: EbookAgentViewProps) {
  const [state, setState] = useState<AgentState>({
    sessionId: null,
    currentStep: 1,
    niche: "",
    subNiche: "",
    customNiche: "",
    nicheData: null,
    competitionData: null,
    generatedBookIds: [],
    evaluationData: null,
    seoData: null,
    coverData: null,
    loading: false,
    error: null,
    bookProgress: [],
    allBooksDone: false,
    showCelebration: false,
  });

  const updateState = useCallback((partial: Partial<AgentState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Book Progress via SSE (with polling fallback) ──────────────────
  useEffect(() => {
    if (state.generatedBookIds.length === 0 || state.allBooksDone) return;

    const eventSources: EventSource[] = [];
    const fallbackIntervals: ReturnType<typeof setInterval>[] = [];
    const progressMap = new Map<string, BookProgress>();

    for (const bookId of state.generatedBookIds) {
      let useFallback = false;

      try {
        const es = new EventSource(`/api/books/${bookId}/progress`);

        es.addEventListener("progress", (event) => {
          try {
            const data = JSON.parse(event.data);
            progressMap.set(bookId, {
              id: bookId,
              title: data.title,
              status: data.status,
              progress: data.progress,
              currentPhase: data.currentPhase,
              doneChapters: data.doneChapters,
              totalChapters: data.totalChapters,
              errorMessage: data.errorMessage,
              angle: null,
              currentChapterNum: data.currentChapterNum,
              currentChapterStatus: data.currentChapterStatus,
              currentChapterTitle: data.currentChapterTitle,
            });

            const allDone = Array.from(progressMap.values()).every(
              (b) => b.status === "DONE" || b.status === "FAILED"
            );
            const allSuccess = Array.from(progressMap.values()).every((b) => b.status === "DONE");

            updateState({
              bookProgress: Array.from(progressMap.values()),
              allBooksDone: allDone,
              showCelebration: allSuccess && !state.showCelebration,
            });
          } catch (err) {
            console.error("[SSE] Parse error:", err);
          }
        });

        es.addEventListener("error", () => {
          if (!useFallback) {
            useFallback = true;
            es.close();
            // Start polling fallback for this book
            const interval = setInterval(async () => {
              try {
                const res = await fetch(`/api/books/${bookId}`);
                if (res.ok) {
                  const bookData = await res.json();
                  const chapters = bookData.chapters || [];
                  const doneCh = chapters.filter((c: { status: string }) => c.status === "DONE").length;
                  const currentCh = chapters.find((c: { status: string }) => c.status === "GENERATING" || c.status === "EDITING");
                  let prog = 0;
                  let phase = "Queued";
                  if (bookData.status === "DONE") { prog = 100; phase = "Done"; }
                  else if (bookData.status === "FAILED") { prog = 0; phase = "Failed"; }
                  else if (bookData.status === "EXPORTING") { prog = 85; phase = "Exporting"; }
                  else if (bookData.status === "WRITING") { prog = chapters.length > 0 ? 20 + Math.round((doneCh / chapters.length) * 60) : 40; phase = "Writing"; }
                  else if (bookData.status === "PLANNING") { prog = 10; phase = "Planning"; }

                  progressMap.set(bookId, {
                    id: bookId, title: bookData.title, status: bookData.status,
                    progress: prog, currentPhase: phase, doneChapters: doneCh,
                    totalChapters: chapters.length, errorMessage: bookData.errorMessage,
                    angle: null, currentChapterNum: currentCh?.chapterNumber ?? null,
                    currentChapterStatus: currentCh?.status ?? null,
                    currentChapterTitle: currentCh?.title ?? null,
                  });

                  const allDone = Array.from(progressMap.values()).every(b => b.status === "DONE" || b.status === "FAILED");
                  const allSuccess = Array.from(progressMap.values()).every(b => b.status === "DONE");
                  updateState({ bookProgress: Array.from(progressMap.values()), allBooksDone: allDone, showCelebration: allSuccess && !state.showCelebration });
                  if (allDone) clearInterval(interval);
                }
              } catch { /* ignore fetch errors */ }
            }, 3000);
            fallbackIntervals.push(interval);
          }
        });

        eventSources.push(es);
      } catch {
        // SSE not available, use polling directly
        const interval = setInterval(async () => {
          try {
            const res = await fetch(`/api/books/${bookId}`);
            if (res.ok) {
              const data = await res.json();
              progressMap.set(bookId, computeBookProgress(data));
              const allDone = Array.from(progressMap.values()).every(b => b.status === "DONE" || b.status === "FAILED");
              const allSuccess = Array.from(progressMap.values()).every(b => b.status === "DONE");
              updateState({ bookProgress: Array.from(progressMap.values()), allBooksDone: allDone, showCelebration: allSuccess && !state.showCelebration });
              if (allDone) clearInterval(interval);
            }
          } catch { /* ignore */ }
        }, 3000);
        fallbackIntervals.push(interval);
      }
    }

    return () => {
      for (const es of eventSources) es.close();
      for (const interval of fallbackIntervals) clearInterval(interval);
    };
  }, [state.generatedBookIds, state.allBooksDone, state.showCelebration, updateState]);

  // ── Step 1: Niche Research ────────────────────────────────────────
  const handleNicheResearch = useCallback(async () => {
    const effectiveSubNiche = state.customNiche || state.subNiche;
    if (!state.niche || !effectiveSubNiche) return;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ sessionId: string; result: NicheResearchResult; error?: string }>("/api/agent/niche-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
        }),
      });
      if (!ok) throw new Error(data.error || "Research failed");

      updateState({
        sessionId: data.sessionId,
        nicheData: data.result,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.niche, state.subNiche, state.customNiche, updateState]);

  // ── Step 2: Competition Research ──────────────────────────────────
  const handleCompetitionResearch = useCallback(async () => {
    if (!state.sessionId) return;
    const effectiveSubNiche = state.customNiche || state.subNiche;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ sessionId: string; result: CompetitionResult; error?: string }>("/api/agent/competition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
        }),
      });
      if (!ok) throw new Error(data.error || "Competition research failed");

      updateState({
        competitionData: data.result,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.niche, state.subNiche, state.customNiche, updateState]);

  // ── Step 2b: Generate Book ─────────────────────────────────────────
  const handleBatchGenerate = useCallback(async () => {
    if (!state.sessionId) return;
    const effectiveSubNiche = state.customNiche || state.subNiche;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ sessionId: string; bookIds: string[]; error?: string }>("/api/agent/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
          bookCount: 1,
        }),
      });
      if (!ok) throw new Error(data.error || "Book generation failed");

      updateState({
        generatedBookIds: data.bookIds || [],
        currentStep: 2,
        loading: false,
        allBooksDone: false,
        bookProgress: [],
        showCelebration: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.niche, state.subNiche, state.customNiche, updateState]);

  // ── Step 3: Quality Assessment ────────────────────────────────────
  const handleQualityAssess = useCallback(async () => {
    if (!state.sessionId || state.generatedBookIds.length === 0) return;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ results: QualityAssessmentResult[]; error?: string }>("/api/agent/quality-assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookIds: state.generatedBookIds,
        }),
      });
      if (!ok) throw new Error(data.error || "Quality assessment failed");

      updateState({
        evaluationData: data.results,
        currentStep: 3,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.generatedBookIds, updateState]);

  // ── Step 4: SEO & Sales ──────────────────────────────────────────
  const handleSeoOptimize = useCallback(async () => {
    if (!state.sessionId || state.generatedBookIds.length === 0) return;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ results: SeoSalesResult[]; error?: string }>("/api/agent/seo-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookIds: state.generatedBookIds,
        }),
      });
      if (!ok) throw new Error(data.error || "SEO optimization failed");

      updateState({
        seoData: data.results,
        currentStep: 4,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.generatedBookIds, updateState]);

  // ── Step 5: Cover Image ──────────────────────────────────────────
  const handleCoverPrompt = useCallback(async (bookId: string, generateImage?: boolean) => {
    if (!state.sessionId) return;

    updateState({ loading: true, error: null });
    try {
      const { data, ok } = await safeFetchJSON<{ result: CoverPromptResult; error?: string }>("/api/agent/cover-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookId,
          generateImage: generateImage ?? false,
        }),
      });
      if (!ok) throw new Error(data.error || "Cover prompt failed");

      const newCover = data.result as CoverPromptResult;
      const existingCovers = state.coverData || [];
      const updatedCovers = [...existingCovers.filter((c) => c.bookId !== bookId), newCover];

      updateState({
        coverData: updatedCovers,
        currentStep: 5,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.coverData, updateState]);

  // ── Navigate Steps ───────────────────────────────────────────────
  const goToStep = (step: AgentStep) => {
    if (step <= state.currentStep || step === state.currentStep + 1) {
      updateState({ currentStep: step, error: null });
    }
  };

  const selectedCategory = NICHE_CATEGORIES.find((c) => c.name === state.niche);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <>
      {/* Inject animation styles */}
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="hidden md:flex flex-col w-56 shrink-0 space-y-1">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" /> Ebook Agent
          </h2>
          {STEPS.map((step) => {
            const isCompleted = state.currentStep > step.num;
            const isCurrent = state.currentStep === step.num;
            const isAccessible = step.num <= state.currentStep;
            const Icon = step.icon;

            return (
              <button
                key={step.num}
                onClick={() => isAccessible ? goToStep(step.num as AgentStep) : undefined}
                disabled={!isAccessible}
                className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                  isCurrent
                    ? "bg-primary/10 border border-primary/30 text-foreground anim-pulse-glow"
                    : isCompleted
                    ? "bg-green-500/5 border border-green-500/20 text-foreground hover:bg-green-500/10"
                    : "bg-muted/30 border border-transparent text-muted-foreground cursor-not-allowed opacity-50"
                }`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                  isCompleted ? "bg-green-500/10" : isCurrent ? "bg-primary/10" : "bg-muted/50"
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : isCurrent && state.loading ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <Icon className={`w-4 h-4 ${isCurrent ? "text-primary" : ""}`} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${isCurrent ? "text-primary" : ""}`}>
                    {step.num}. {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{step.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile step indicator */}
        <div className="md:hidden w-full">
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
            {STEPS.map((step) => {
              const isCompleted = state.currentStep > step.num;
              const isCurrent = state.currentStep === step.num;
              const Icon = step.icon;
              return (
                <button
                  key={step.num}
                  onClick={() => goToStep(step.num as AgentStep)}
                  disabled={step.num > state.currentStep}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                    isCurrent ? "bg-primary text-primary-foreground" :
                    isCompleted ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <CheckCircle className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Overall Progress Bar */}
          <OverallProgressBar
            currentStep={state.currentStep}
            loading={state.loading}
            bookProgress={state.bookProgress}
          />

          {/* Error display */}
          {state.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2 anim-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Step 1: Niche Research */}
          {state.currentStep === 1 && (
            <Step1NicheResearch
              niche={state.niche}
              subNiche={state.subNiche}
              customNiche={state.customNiche}
              nicheData={state.nicheData}
              loading={state.loading}
              selectedCategory={selectedCategory}
              onNicheChange={(v) => updateState({ niche: v, subNiche: "", nicheData: null })}
              onSubNicheChange={(v) => updateState({ subNiche: v, nicheData: null })}
              onCustomNicheChange={(v) => updateState({ customNiche: v })}
              onResearch={handleNicheResearch}
              onProceed={() => updateState({ currentStep: 2 })}
            />
          )}

          {/* Step 2: Competition + Batch Generate */}
          {state.currentStep === 2 && (
            <Step2Competition
              niche={state.niche}
              subNiche={state.customNiche || state.subNiche}
              competitionData={state.competitionData}
              generatedBookIds={state.generatedBookIds}
              bookProgress={state.bookProgress}
              allBooksDone={state.allBooksDone}
              loading={state.loading}
              showCelebration={state.showCelebration}
              onCompetitionResearch={handleCompetitionResearch}
              onBatchGenerate={handleBatchGenerate}
              onProceed={() => updateState({ currentStep: 3 })}
              onOpenBook={onOpenBook}
              onDismissCelebration={() => updateState({ showCelebration: false })}
            />
          )}

          {/* Step 3: Quality Assessment */}
          {state.currentStep === 3 && (
            <Step3Quality
              evaluationData={state.evaluationData}
              generatedBookIds={state.generatedBookIds}
              loading={state.loading}
              onAssess={handleQualityAssess}
              onProceed={() => updateState({ currentStep: 4 })}
              onOpenBook={onOpenBook}
            />
          )}

          {/* Step 4: SEO & Sales */}
          {state.currentStep === 4 && (
            <Step4SeoSales
              seoData={state.seoData}
              generatedBookIds={state.generatedBookIds}
              loading={state.loading}
              onOptimize={handleSeoOptimize}
              onProceed={() => updateState({ currentStep: 5 })}
            />
          )}

          {/* Step 5: Cover Image */}
          {state.currentStep === 5 && (
            <Step5Cover
              coverData={state.coverData}
              generatedBookIds={state.generatedBookIds}
              loading={state.loading}
              onGeneratePrompt={handleCoverPrompt}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Step 1: Niche Research ──────────────────────────────────────────

function Step1NicheResearch({
  niche, subNiche, customNiche, nicheData, loading, selectedCategory,
  onNicheChange, onSubNicheChange, onCustomNicheChange, onResearch, onProceed,
}: {
  niche: string; subNiche: string; customNiche: string;
  nicheData: NicheResearchResult | null; loading: boolean;
  selectedCategory: typeof NICHE_CATEGORIES[number] | undefined;
  onNicheChange: (v: string) => void;
  onSubNicheChange: (v: string) => void;
  onCustomNicheChange: (v: string) => void;
  onResearch: () => void;
  onProceed: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4 anim-fade-in">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Search className="w-6 h-6 text-primary" /> Niche Research
        </h2>
        <p className="text-muted-foreground">Find a profitable sub-niche for your ebooks</p>
      </div>

      <Card className="anim-fade-in" style={{ animationDelay: "100ms" }}>
        <CardContent className="pt-6 space-y-5">
          {/* Niche dropdown */}
          <div className="space-y-2">
            <Label>1. Select Your Niche</Label>
            <Select value={niche} onValueChange={onNicheChange}>
              <SelectTrigger><SelectValue placeholder="Choose a niche..." /></SelectTrigger>
              <SelectContent>
                {NICHE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-niche dropdown */}
          {niche && selectedCategory && (
            <div className="space-y-2 anim-slide-in">
              <Label>2. Select a Sub-Niche</Label>
              <Select value={subNiche} onValueChange={onSubNicheChange}>
                <SelectTrigger><SelectValue placeholder="Choose a sub-niche..." /></SelectTrigger>
                <SelectContent>
                  {selectedCategory.subNiches.map((sub) => (
                    <SelectItem key={sub.id} value={sub.name}>{sub.name} — {sub.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom niche input */}
          <div className="space-y-2">
            <Label>3. Or Enter a Custom Sub-Niche</Label>
            <Input
              placeholder="e.g., Keto diet for women over 40"
              value={customNiche}
              onChange={(e) => onCustomNicheChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Override the dropdown selection with your own niche idea</p>
          </div>

          <Button
            onClick={onResearch}
            disabled={loading || (!niche || (!subNiche && !customNiche))}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Researching niche...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" /> Research This Niche</>
            )}
          </Button>

          {loading && <AgentLoader messages={["Searching 6 web sources for niche data...", "Analyzing market trends & pricing...", "Evaluating reader demand & pain points...", "Deepening analysis with trend forecasts...", "Identifying competition gaps & reader complaints..."]} />}
        </CardContent>
      </Card>

      {/* Results */}
      {nicheData && (
        <Card className="border-green-500/30 bg-green-500/5 anim-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-green-600" /> Research Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">
              Niche: <span className="text-primary">{nicheData.niche}</span> → <span className="text-primary">{nicheData.subNiche}</span>
            </p>

            {/* Score bars */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Profitability", value: nicheData.profitability, color: "bg-green-500" },
                { label: "Demand", value: nicheData.demand, color: "bg-blue-500" },
                { label: "Competition", value: 10 - nicheData.competition, color: "bg-yellow-500", displayValue: nicheData.competition, displayLabel: "Competition (lower=better)" },
                { label: "Potential", value: nicheData.potential, color: "bg-purple-500" },
              ].map((metric, i) => (
                <div key={i} className="space-y-1 anim-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{metric.displayLabel || metric.label}</span>
                    <span className="font-medium">{metric.displayValue || metric.value}/10</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${metric.color} transition-all duration-700`} style={{ width: `${metric.value * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Search insights */}
            {nicheData.searchInsights && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">{nicheData.searchInsights}</p>
              </div>
            )}

            {/* Suggested sub-niches */}
            {nicheData.suggestedSubNiches.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Recommended Alternative Sub-Niches:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {nicheData.suggestedSubNiches.map((s, i) => (
                    <div key={i} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors anim-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{s.name}</span>
                        <Badge variant="secondary" className="text-xs">{s.score}/10</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={onProceed} className="w-full" size="lg">
              Accept & Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Step 2: Competition & Batch Generate ────────────────────────────

function Step2Competition({
  niche, subNiche, competitionData, generatedBookIds, bookProgress,
  allBooksDone, loading, showCelebration,
  onCompetitionResearch, onBatchGenerate, onProceed,
  onOpenBook, onDismissCelebration,
}: {
  niche: string; subNiche: string; competitionData: CompetitionResult | null;
  generatedBookIds: string[]; bookProgress: BookProgress[];
  allBooksDone: boolean; loading: boolean; showCelebration: boolean;
  onCompetitionResearch: () => void;
  onBatchGenerate: () => void;
  onProceed: () => void;
  onOpenBook: (id: string) => void;
  onDismissCelebration: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4 anim-fade-in">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Trophy className="w-6 h-6 text-primary" /> Competition & Generation
        </h2>
        <p className="text-muted-foreground">
          Analyze competition in <span className="text-primary font-medium">{subNiche}</span>
        </p>
      </div>

      {/* Competition research button */}
      {!competitionData && (
        <Card className="anim-fade-in" style={{ animationDelay: "100ms" }}>
          <CardContent className="pt-6 space-y-4 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Analyze the competitive landscape before generating books</p>
            <Button onClick={onCompetitionResearch} disabled={loading} size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing competition...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Research Competition</>
              )}
            </Button>
            {loading && <AgentLoader messages={["Searching competitor listings...", "Analyzing pricing strategies...", "Identifying market gaps...", "Evaluating competitive angles..."]} />}
          </CardContent>
        </Card>
      )}

      {/* Competition results */}
      {competitionData && (
        <Card className="anim-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" /> Competition Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Market stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { icon: DollarSign, color: "text-green-600", value: competitionData.averagePrice, label: "Avg Price" },
                { icon: FileText, color: "text-blue-600", value: competitionData.averageLength, label: "Avg Length" },
                { icon: Star, color: "text-yellow-500", value: String(competitionData.competitors.length), label: "Competitors Found" },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="rounded-lg border p-3 text-center anim-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                    <Icon className={`w-5 h-5 mx-auto ${stat.color} mb-1`} />
                    <p className="text-sm font-medium">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Competitors list */}
            {competitionData.competitors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Top Competitors:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {competitionData.competitors.map((comp, i) => (
                    <div key={i} className="rounded-lg border p-3 flex items-start gap-3 anim-slide-in" style={{ animationDelay: `${i * 50}ms` }}>
                      <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{comp.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{comp.price}</span>
                          {comp.rating && <span>⭐ {comp.rating}</span>}
                          <span>{comp.platform}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Market gaps */}
            {competitionData.marketGaps.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Market Gaps:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {competitionData.marketGaps.map((gap, i) => <li key={i}>{gap}</li>)}
                </ul>
              </div>
            )}

            {/* Suggested angles */}
            {competitionData.suggestedAngles.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Suggested Unique Angles:</p>
                <div className="flex flex-wrap gap-2">
                  {competitionData.suggestedAngles.map((angle, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{angle}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate book section */}
      {competitionData && generatedBookIds.length === 0 && (
        <Card className="anim-fade-in" style={{ animationDelay: "200ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Create Your Book
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Based on the competition analysis, we&apos;ll create one optimized ebook with the best unique angle to fill the market gap.
            </p>

            <Button onClick={onBatchGenerate} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Planning your book...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Create My Book</>
              )}
            </Button>

            {loading && <AgentLoader messages={["Analyzing competition gaps...", "Finding the best unique angle...", "Planning book structure...", "Initializing generation pipeline..."]} />}
          </CardContent>
        </Card>
      )}

      {/* Writing in progress banner */}
      {generatedBookIds.length > 0 && !allBooksDone && (
        <Card className="border-primary/30 bg-primary/5 anim-fade-in">
          <CardContent className="py-3 flex items-center gap-3">
            <div className="relative">
              <PenLine className="w-5 h-5 text-primary" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full anim-progress-pulse" />
            </div>
            <div>
              <p className="text-sm font-medium">Your book is being written</p>
              <p className="text-xs text-muted-foreground">
                Each chapter takes ~30 seconds. Progress is saved automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated books - with real-time progress */}
      {generatedBookIds.length > 0 && (
        <div className="space-y-4 anim-fade-in">
          {/* Celebration banner */}
          {showCelebration && (
            <Card className="border-green-500/30 bg-green-500/5 relative overflow-hidden anim-celebrate">
              <ConfettiEffect />
              <CardContent className="pt-6 pb-6 text-center space-y-3 relative z-10">
                <PartyPopper className="w-12 h-12 mx-auto text-green-600" />
                <h3 className="text-xl font-bold text-green-700 dark:text-green-400">
                  Book Generated Successfully!
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your ebook has been created and is ready for quality assessment.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={onProceed} size="lg">
                    Evaluate Quality <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button variant="outline" onClick={onDismissCelebration}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!allBooksDone ? (
                <>
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="font-medium">Generating Your Book...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-700 dark:text-green-400">
                    Book Complete
                  </span>
                </>
              )}
            </div>
            {allBooksDone && !showCelebration && (
              <Button onClick={onProceed} size="sm">
                Evaluate Quality <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>

          {/* Book progress cards */}
          {bookProgress.length > 0 ? (
            <div className="space-y-3">
              {bookProgress.map((book, i) => (
                <BookProgressCard
                  key={book.id}
                  book={book}
                  index={i}
                  onOpenBook={book.status === "DONE" ? onOpenBook : undefined}
                />
              ))}
            </div>
          ) : (
            /* Fallback when progress not yet loaded */
            <Card className="border-primary/20">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">Starting book generation pipeline...</span>
                </div>
                <div className="space-y-2">
                  {generatedBookIds.map((id, i) => (
                    <div key={id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 anim-shimmer">
                      <div className="w-8 h-8 rounded bg-muted animate-pulse" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                        <div className="h-2 w-20 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Quality Assessment ──────────────────────────────────────

function Step3Quality({
  evaluationData, generatedBookIds, loading, onAssess, onProceed, onOpenBook,
}: {
  evaluationData: QualityAssessmentResult[] | null;
  generatedBookIds: string[];
  loading: boolean;
  onAssess: () => void;
  onProceed: () => void;
  onOpenBook: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4 anim-fade-in">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <CheckSquare className="w-6 h-6 text-primary" /> Quality Assessment
        </h2>
        <p className="text-muted-foreground">Evaluate the quality of generated books</p>
      </div>

      {!evaluationData && (
        <Card className="anim-fade-in" style={{ animationDelay: "100ms" }}>
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              Assess {generatedBookIds.length} book{generatedBookIds.length > 1 ? "s" : ""} for quality
            </p>
            <p className="text-xs text-muted-foreground">
              Make sure your books have finished generating before assessing
            </p>
            <Button onClick={onAssess} disabled={loading} size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Evaluating books...</>
              ) : (
                <><CheckSquare className="w-4 h-4 mr-2" /> Start Assessment</>
              )}
            </Button>
            {loading && <AgentLoader messages={["Reading book content...", "Evaluating writing quality...", "Checking originality...", "Scoring readability..."]} />}
          </CardContent>
        </Card>
      )}

      {evaluationData && evaluationData.map((evalItem, idx) => (
        <Card
          key={evalItem.bookId}
          className={`${evalItem.passed ? "border-green-500/30" : "border-yellow-500/30"} anim-fade-in`}
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="text-base">{evalItem.bookTitle}</CardTitle>
              <Badge variant={evalItem.passed ? "default" : "secondary"}>
                {evalItem.passed ? "PASSED" : "NEEDS WORK"} — {evalItem.overallScore.toFixed(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Score bars */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(evalItem.scores).map(([key, value], i) => (
                <div key={key} className="space-y-1 anim-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="font-medium">{value}/10</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${value >= 7 ? "bg-green-500" : value >= 5 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${value * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Strengths & suggestions */}
            {evalItem.strengths.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-700 dark:text-green-400">Strengths:</p>
                <ul className="text-xs text-muted-foreground list-disc list-inside">
                  {evalItem.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {evalItem.suggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Suggestions:</p>
                <ul className="text-xs text-muted-foreground list-disc list-inside">
                  {evalItem.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => onOpenBook(evalItem.bookId)}>
              <BookOpen className="w-3.5 h-3.5 mr-1" /> View Book
            </Button>
          </CardContent>
        </Card>
      ))}

      {evaluationData && (
        <Button onClick={onProceed} className="w-full" size="lg">
          Prepare for Sales <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
}

// ─── Step 4: SEO & Sales Prep ────────────────────────────────────────

function Step4SeoSales({
  seoData, generatedBookIds, loading, onOptimize, onProceed,
}: {
  seoData: SeoSalesResult[] | null;
  generatedBookIds: string[];
  loading: boolean;
  onOptimize: () => void;
  onProceed: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4 anim-fade-in">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" /> SEO & Sales Prep
        </h2>
        <p className="text-muted-foreground">Optimize your books for Payhip/Gumroad</p>
      </div>

      {!seoData && (
        <Card className="anim-fade-in" style={{ animationDelay: "100ms" }}>
          <CardContent className="pt-6 space-y-4 text-center">
            <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Generate SEO-optimized titles, descriptions, and pricing</p>
            <Button onClick={onOptimize} disabled={loading} size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Optimizing...</>
              ) : (
                <><TrendingUp className="w-4 h-4 mr-2" /> Optimize for Sales</>
              )}
            </Button>
            {loading && <AgentLoader messages={["Analyzing search trends...", "Crafting SEO titles...", "Generating sales copy...", "Researching pricing strategies..."]} />}
          </CardContent>
        </Card>
      )}

      {seoData && seoData.map((seo, idx) => (
        <Card key={seo.bookId} className="anim-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{seo.bookTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SEO Title */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Sparkles className="w-3 h-3" /> SEO Title</Label>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium flex-1 bg-muted/50 p-2 rounded">{seo.seoTitle}</p>
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(seo.seoTitle, `title-${seo.bookId}`)}>
                  {copiedField === `title-${seo.bookId}` ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Sales Description */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><FileText className="w-3 h-3" /> Sales Description</Label>
              <div className="relative">
                <Textarea readOnly value={seo.seoDescription} rows={6} className="text-sm resize-none" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(seo.seoDescription, `desc-${seo.bookId}`)}
                >
                  {copiedField === `desc-${seo.bookId}` ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === `desc-${seo.bookId}` ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {seo.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(seo.tags.join(", "), `tags-${seo.bookId}`)}>
                {copiedField === `tags-${seo.bookId}` ? <CheckCircle className="w-3.5 h-3.5 text-green-600 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedField === `tags-${seo.bookId}` ? "Copied!" : "Copy Tags"}
              </Button>
            </div>

            {/* Keywords */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Search className="w-3 h-3" /> Keywords</Label>
              <div className="flex flex-wrap gap-1.5">
                {seo.keywords.map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(seo.keywords.join(", "), `kw-${seo.bookId}`)}>
                {copiedField === `kw-${seo.bookId}` ? <CheckCircle className="w-3.5 h-3.5 text-green-600 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedField === `kw-${seo.bookId}` ? "Copied!" : "Copy Keywords"}
              </Button>
            </div>

            {/* Pricing */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Pricing</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-2 text-center">
                  <p className="text-lg font-bold">${seo.pricing.minimum}</p>
                  <p className="text-xs text-muted-foreground">Min</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-center">
                  <p className="text-lg font-bold text-primary">${seo.pricing.suggested}</p>
                  <p className="text-xs text-muted-foreground">Suggested</p>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <p className="text-lg font-bold">${seo.pricing.premium}</p>
                  <p className="text-xs text-muted-foreground">Premium</p>
                </div>
              </div>
              {seo.pricing.launchPromo && (
                <p className="text-xs text-green-700 dark:text-green-400 text-center">
                  Launch promo: ${seo.pricing.launchPromo}
                </p>
              )}
            </div>

            {/* Payhip checklist */}
            {seo.payhipChecklist.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Payhip Setup Checklist</Label>
                <ul className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                  {seo.payhipChecklist.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {seoData && (
        <Button onClick={onProceed} className="w-full" size="lg">
          Generate Cover Prompts <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
}

// ─── Step 5: Cover Image ─────────────────────────────────────────────

function Step5Cover({
  coverData, generatedBookIds, loading, onGeneratePrompt,
}: {
  coverData: CoverPromptResult[] | null;
  generatedBookIds: string[];
  loading: boolean;
  onGeneratePrompt: (bookId: string, generateImage?: boolean) => void;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const copyPrompt = async (text: string, bookId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(bookId);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const processedBookIds = new Set(coverData?.map((c) => c.bookId) || []);
  const remainingBooks = generatedBookIds.filter((id) => !processedBookIds.has(id));

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4 anim-fade-in">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <ImageIcon className="w-6 h-6 text-primary" /> Cover Image
        </h2>
        <p className="text-muted-foreground">Generate AI cover image prompts for your books</p>
      </div>

      {/* Generate buttons for remaining books */}
      {remainingBooks.length > 0 && (
        <Card className="anim-fade-in" style={{ animationDelay: "100ms" }}>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate cover prompts for {remainingBooks.length} remaining book{remainingBooks.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {remainingBooks.map((bookId) => (
                <Button key={bookId} variant="outline" size="sm" onClick={() => onGeneratePrompt(bookId)} disabled={loading}>
                  {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />}
                  Generate for {bookId.slice(0, 8)}...
                </Button>
              ))}
            </div>
            {loading && <AgentLoader messages={["Analyzing book themes...", "Crafting visual descriptions...", "Generating cover prompts...", "Designing style options..."]} />}
          </CardContent>
        </Card>
      )}

      {/* Cover results */}
      {coverData && coverData.map((cover, idx) => (
        <Card key={cover.bookId} className="anim-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{cover.bookTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Prompt */}
            <div className="space-y-1">
              <Label className="text-xs">AI Cover Prompt</Label>
              <div className="relative">
                <Textarea readOnly value={cover.prompt} rows={4} className="text-sm resize-none" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyPrompt(cover.prompt, cover.bookId)}
                >
                  {copiedPrompt === cover.bookId ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPrompt === cover.bookId ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Style options */}
            {cover.styleOptions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Cover Styles</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {cover.styleOptions.map((style, i) => (
                    <button
                      key={i}
                      className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => onGeneratePrompt(cover.bookId)}
                    >
                      <p className="text-sm font-medium">{style.name}</p>
                      <p className="text-xs text-muted-foreground">{style.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate image button */}
            <Button onClick={() => onGeneratePrompt(cover.bookId, true)} disabled={loading} variant="outline" className="w-full">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating cover image...</>
              ) : (
                <><ImageIcon className="w-4 h-4 mr-2" /> Generate Cover Image</>
              )}
            </Button>

            {/* Generated image */}
            {cover.generatedImagePath && (
              <div className="space-y-2 anim-fade-in">
                <div className="rounded-lg border overflow-hidden max-w-xs mx-auto">
                  <img
                    src={`/${cover.generatedImagePath.replace(/^public\//, "")}`}
                    alt={`Cover for ${cover.bookTitle}`}
                    className="w-full"
                  />
                </div>
                <div className="text-center">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/${cover.generatedImagePath.replace(/^public\//, "")}`} download>
                      <Download className="w-3.5 h-3.5 mr-1" /> Download Cover
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {generatedBookIds.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No books generated yet. Go back to Step 2 to generate books first.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
