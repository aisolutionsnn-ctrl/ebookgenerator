/**
 * Next.js Instrumentation — Global Error Handlers
 *
 * Prevents unhandled rejections and uncaught exceptions from crashing
 * the dev server during long-running API calls (LLM, web search, etc.)
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      console.error("[Global] Unhandled Promise Rejection:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("[Global] Uncaught Exception:", error);
      // Don't exit — keep the server alive
    });

    setInterval(() => {
      // Keep event loop alive
    }, 1000 * 60 * 60 * 24);
  }
}
