"use client";

import { useState, useCallback } from "react";
import {
  BookOpen, Search, Trophy, CheckSquare, TrendingUp, Image as ImageIcon,
  Loader2, ChevronRight, ChevronLeft, Copy, CheckCircle, Sparkles,
  RefreshCw, Download, Star, DollarSign, Tag, FileText, ExternalLink,
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

// ─── Types ────────────────────────────────────────────────────────────

interface EbookAgentViewProps {
  onOpenBook: (id: string) => void;
}

interface AgentState {
  sessionId: string | null;
  currentStep: AgentStep;
  niche: string;
  subNiche: string;
  customNiche: string;
  bookCount: number;
  nicheData: NicheResearchResult | null;
  competitionData: CompetitionResult | null;
  generatedBookIds: string[];
  evaluationData: QualityAssessmentResult[] | null;
  seoData: SeoSalesResult[] | null;
  coverData: CoverPromptResult[] | null;
  loading: boolean;
  error: string | null;
}

const STEPS = [
  { num: 1, label: "Niche Research", icon: Search, desc: "Find profitable sub-niches" },
  { num: 2, label: "Competition & Generate", icon: Trophy, desc: "Analyze competitors, generate books" },
  { num: 3, label: "Quality Assessment", icon: CheckSquare, desc: "Evaluate book quality" },
  { num: 4, label: "SEO & Sales Prep", icon: TrendingUp, desc: "Optimize for sales" },
  { num: 5, label: "Cover Image", icon: ImageIcon, desc: "Generate cover prompts" },
];

// ─── Main Component ──────────────────────────────────────────────────

export function EbookAgentView({ onOpenBook }: EbookAgentViewProps) {
  const [state, setState] = useState<AgentState>({
    sessionId: null,
    currentStep: 1,
    niche: "",
    subNiche: "",
    customNiche: "",
    bookCount: 3,
    nicheData: null,
    competitionData: null,
    generatedBookIds: [],
    evaluationData: null,
    seoData: null,
    coverData: null,
    loading: false,
    error: null,
  });

  const updateState = useCallback((partial: Partial<AgentState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Step 1: Niche Research ────────────────────────────────────────
  const handleNicheResearch = useCallback(async () => {
    const effectiveSubNiche = state.customNiche || state.subNiche;
    if (!state.niche || !effectiveSubNiche) return;

    updateState({ loading: true, error: null });
    try {
      const res = await fetch("/api/agent/niche-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");

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
      const res = await fetch("/api/agent/competition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Competition research failed");

      updateState({
        competitionData: data.result,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.niche, state.subNiche, state.customNiche, updateState]);

  // ── Step 2b: Batch Generate ───────────────────────────────────────
  const handleBatchGenerate = useCallback(async () => {
    if (!state.sessionId) return;
    const effectiveSubNiche = state.customNiche || state.subNiche;

    updateState({ loading: true, error: null });
    try {
      const res = await fetch("/api/agent/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          niche: state.niche,
          subNiche: effectiveSubNiche,
          customNiche: state.customNiche || undefined,
          bookCount: state.bookCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch generation failed");

      updateState({
        generatedBookIds: data.bookIds || [],
        currentStep: 2,
        loading: false,
      });
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  }, [state.sessionId, state.niche, state.subNiche, state.customNiche, state.bookCount, updateState]);

  // ── Step 3: Quality Assessment ────────────────────────────────────
  const handleQualityAssess = useCallback(async () => {
    if (!state.sessionId || state.generatedBookIds.length === 0) return;

    updateState({ loading: true, error: null });
    try {
      const res = await fetch("/api/agent/quality-assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookIds: state.generatedBookIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quality assessment failed");

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
      const res = await fetch("/api/agent/seo-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookIds: state.generatedBookIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SEO optimization failed");

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
      const res = await fetch("/api/agent/cover-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          bookId,
          generateImage: generateImage ?? false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cover prompt failed");

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
    // Can only go to completed steps or current + 1
    if (step <= state.currentStep || step === state.currentStep + 1) {
      updateState({ currentStep: step, error: null });
    }
  };

  const selectedCategory = NICHE_CATEGORIES.find((c) => c.name === state.niche);

  // ─── Render ────────────────────────────────────────────────────────

  return (
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
                  ? "bg-primary/10 border border-primary/30 text-foreground"
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
        {/* Error display */}
        {state.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
            <span className="shrink-0">⚠️</span>
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
            bookCount={state.bookCount}
            generatedBookIds={state.generatedBookIds}
            loading={state.loading}
            onBookCountChange={(v) => updateState({ bookCount: v })}
            onCompetitionResearch={handleCompetitionResearch}
            onBatchGenerate={handleBatchGenerate}
            onProceed={() => updateState({ currentStep: 3 })}
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
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Search className="w-6 h-6 text-primary" /> Niche Research
        </h2>
        <p className="text-muted-foreground">Find a profitable sub-niche for your ebooks</p>
      </div>

      <Card>
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
            <div className="space-y-2">
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
        </CardContent>
      </Card>

      {/* Results */}
      {nicheData && (
        <Card className="border-green-500/30 bg-green-500/5">
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
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{metric.displayLabel || metric.label}</span>
                    <span className="font-medium">{metric.displayValue || metric.value}/10</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${metric.color} transition-all`} style={{ width: `${metric.value * 10}%` }} />
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
                    <div key={i} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
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
  niche, subNiche, competitionData, bookCount, generatedBookIds, loading,
  onBookCountChange, onCompetitionResearch, onBatchGenerate, onProceed,
}: {
  niche: string; subNiche: string; competitionData: CompetitionResult | null;
  bookCount: number; generatedBookIds: string[]; loading: boolean;
  onBookCountChange: (v: number) => void;
  onCompetitionResearch: () => void;
  onBatchGenerate: () => void;
  onProceed: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Trophy className="w-6 h-6 text-primary" /> Competition & Generation
        </h2>
        <p className="text-muted-foreground">
          Analyze competition in <span className="text-primary font-medium">{subNiche}</span>
        </p>
      </div>

      {/* Competition research button */}
      {!competitionData && (
        <Card>
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
          </CardContent>
        </Card>
      )}

      {/* Competition results */}
      {competitionData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" /> Competition Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Market stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <DollarSign className="w-5 h-5 mx-auto text-green-600 mb-1" />
                <p className="text-sm font-medium">{competitionData.averagePrice}</p>
                <p className="text-xs text-muted-foreground">Avg Price</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <FileText className="w-5 h-5 mx-auto text-blue-600 mb-1" />
                <p className="text-sm font-medium">{competitionData.averageLength}</p>
                <p className="text-xs text-muted-foreground">Avg Length</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Star className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
                <p className="text-sm font-medium">{competitionData.competitors.length}</p>
                <p className="text-xs text-muted-foreground">Competitors Found</p>
              </div>
            </div>

            {/* Competitors list */}
            {competitionData.competitors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Top Competitors:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {competitionData.competitors.map((comp, i) => (
                    <div key={i} className="rounded-lg border p-3 flex items-start gap-3">
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

      {/* Batch generate section */}
      {competitionData && generatedBookIds.length === 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Generate Books
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>How many books to generate?</Label>
              <div className="flex items-center gap-2">
                {[1, 3, 5, 10].map((n) => (
                  <Button
                    key={n}
                    variant={bookCount === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => onBookCountChange(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={bookCount}
                  onChange={(e) => onBookCountChange(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-20"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Each book will have a unique angle based on competition analysis
              </p>
            </div>

            <Button onClick={onBatchGenerate} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating book plans...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate {bookCount} Book{bookCount > 1 ? "s" : ""}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generated books */}
      {generatedBookIds.length > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">{generatedBookIds.length} books created!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Books are being generated in the background. You can check their progress in the History tab.
              Continue to evaluate their quality once they&apos;re done.
            </p>
            <div className="space-y-1">
              {generatedBookIds.map((id, i) => (
                <p key={id} className="text-xs text-muted-foreground">Book {i + 1}: {id}</p>
              ))}
            </div>
            <Button onClick={onProceed} className="w-full" size="lg">
              Evaluate Quality <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
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
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <CheckSquare className="w-6 h-6 text-primary" /> Quality Assessment
        </h2>
        <p className="text-muted-foreground">Evaluate the quality of generated books</p>
      </div>

      {!evaluationData && (
        <Card>
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
          </CardContent>
        </Card>
      )}

      {evaluationData && evaluationData.map((evalItem) => (
        <Card key={evalItem.bookId} className={evalItem.passed ? "border-green-500/30" : "border-yellow-500/30"}>
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
              {Object.entries(evalItem.scores).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="font-medium">{value}/10</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${value >= 7 ? "bg-green-500" : value >= 5 ? "bg-yellow-500" : "bg-red-500"}`}
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
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" /> SEO & Sales Prep
        </h2>
        <p className="text-muted-foreground">Optimize your books for Payhip/Gumroad</p>
      </div>

      {!seoData && (
        <Card>
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
          </CardContent>
        </Card>
      )}

      {seoData && seoData.map((seo) => (
        <Card key={seo.bookId}>
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
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <ImageIcon className="w-6 h-6 text-primary" /> Cover Image
        </h2>
        <p className="text-muted-foreground">Generate AI cover image prompts for your books</p>
      </div>

      {/* Generate buttons for remaining books */}
      {remainingBooks.length > 0 && (
        <Card>
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
          </CardContent>
        </Card>
      )}

      {/* Cover results */}
      {coverData && coverData.map((cover) => (
        <Card key={cover.bookId}>
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
              <div className="space-y-2">
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
