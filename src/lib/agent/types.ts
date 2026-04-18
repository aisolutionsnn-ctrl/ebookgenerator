/**
 * Ebook Agent Module — Shared Types
 *
 * TypeScript types for all 5 agents in the Ebook Agent pipeline.
 */

// ─── Agent 1: Niche Research ──────────────────────────────────────────

export interface NicheCategory {
  id: string;
  name: string;
  description: string;
  subNiches: SubNiche[];
}

export interface SubNiche {
  id: string;
  name: string;
  description: string;
}

export interface NicheResearchResult {
  niche: string;
  subNiche: string;
  customNiche: string | null;
  profitability: number;   // 1-10
  demand: number;          // 1-10
  competition: number;     // 1-10 (lower = less competition = better)
  potential: number;       // 1-10
  suggestedSubNiches: SuggestedSubNiche[];
  searchInsights: string;  // Summary of web search findings
}

export interface SuggestedSubNiche {
  name: string;
  reason: string;
  score: number; // 1-10
}

// ─── Agent 2: Competition Research ────────────────────────────────────

export interface CompetitionResult {
  niche: string;
  subNiche: string;
  competitors: CompetitorBook[];
  averagePrice: string;
  priceRange: { min: number; max: number; currency: string };
  averageLength: string;
  commonFormats: string[];
  marketGaps: string[];
  suggestedAngles: string[];  // Unique angles for our books
}

export interface CompetitorBook {
  title: string;
  price: string;
  rating: number | null;
  platform: string;
  description: string;
  url: string;
}

// ─── Agent 2b: Batch Generation ───────────────────────────────────────

export interface BatchGenerateRequest {
  sessionId: string;
  niche: string;
  subNiche: string;
  customNiche: string | null;
  bookCount: number;
  competitionData: CompetitionResult;
  angles: string[]; // Unique angle for each book
}

export interface BatchGenerateProgress {
  currentBook: number;
  totalBooks: number;
  currentBookStatus: "starting" | "planning" | "writing" | "exporting" | "done" | "failed";
  currentBookTitle: string | null;
  completedBookIds: string[];
}

// ─── Agent 3: Quality Assessment ──────────────────────────────────────

export interface QualityAssessmentResult {
  bookId: string;
  bookTitle: string;
  scores: {
    content: number;       // 1-10
    structure: number;     // 1-10
    originality: number;   // 1-10
    readability: number;   // 1-10
    seoPotential: number;  // 1-10
    valueForBuyer: number; // 1-10
  };
  overallScore: number;    // 1-10 (weighted average)
  passed: boolean;         // >= 6.0
  suggestions: string[];
  strengths: string[];
}

// ─── Agent 4: SEO & Sales Prep ────────────────────────────────────────

export interface SeoSalesResult {
  bookId: string;
  bookTitle: string;
  seoTitle: string;
  seoDescription: string;    // Sales copy for Payhip/Gumroad
  tags: string[];
  keywords: string[];
  pricing: {
    suggested: number;
    minimum: number;
    premium: number;
    currency: string;
    launchPromo: number | null;
  };
  payhipChecklist: string[];
  categorySuggestion: string;
}

// ─── Agent 5: Cover Image ─────────────────────────────────────────────

export interface CoverPromptResult {
  bookId: string;
  bookTitle: string;
  prompt: string;
  styleOptions: CoverStyle[];
  generatedImagePath: string | null;
}

export interface CoverStyle {
  name: string;
  description: string;
  promptModifier: string;
}

// ─── Agent Session ────────────────────────────────────────────────────

export type AgentStep = 1 | 2 | 3 | 4 | 5;

export interface AgentSessionData {
  id: string;
  userId: string | null;
  niche: string;
  subNiche: string;
  customNiche: string | null;
  bookCount: number;
  currentStep: AgentStep;
  status: "active" | "completed" | "failed" | "paused";
  nicheData: NicheResearchResult | null;
  competitionData: CompetitionResult | null;
  evaluationData: QualityAssessmentResult[] | null;
  seoData: SeoSalesResult[] | null;
  coverData: CoverPromptResult[] | null;
  generatedBookIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── API Request/Response Types ───────────────────────────────────────

export interface NicheResearchRequest {
  niche: string;
  subNiche: string;
  customNiche?: string;
}

export interface CompetitionResearchRequest {
  sessionId: string;
  niche: string;
  subNiche: string;
  customNiche?: string;
}

export interface BatchGenerateApiRequest {
  sessionId: string;
  niche: string;
  subNiche: string;
  customNiche?: string;
  bookCount: number;
}

export interface QualityAssessRequest {
  sessionId: string;
  bookIds: string[];
}

export interface SeoOptimizeRequest {
  sessionId: string;
  bookIds: string[];
}

export interface CoverPromptRequest {
  sessionId: string;
  bookId: string;
  style?: string;
  generateImage?: boolean;
}
