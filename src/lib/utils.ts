import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely parse a fetch Response as JSON.
 * Prevents "Unexpected token '<'" errors when the server returns HTML
 * (e.g., during dev server restarts, 404 pages, etc.)
 */
export async function safeResponseJson<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const preview = text.slice(0, 100).replace(/<[^>]*>/g, "").trim();
    throw new Error(
      res.status === 404
        ? `API endpoint not found. The server may be restarting.`
        : res.status >= 500
        ? `Server error (${res.status}). Please try again in a moment.`
        : `Unexpected response from server: ${preview || res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}
