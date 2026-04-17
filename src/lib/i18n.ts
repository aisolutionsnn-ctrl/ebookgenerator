/**
 * T16: Internationalization (i18n) Support
 *
 * Provides language-specific instructions for LLM prompts
 * and UI-facing language metadata.
 */

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "sr", name: "Serbian", nativeName: "Српски" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Returns language-specific instruction to append to LLM system prompts.
 * When the language is not English, tells the LLM to write in that language.
 */
export function getLanguageInstruction(langCode: LanguageCode): string {
  if (langCode === "en") return "";

  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
  const langName = lang?.name ?? langCode;

  return `\n\nIMPORTANT LANGUAGE INSTRUCTION: Write ALL content in ${langName} (${lang?.nativeName ?? langCode}). Every sentence, heading, example, and explanation must be in ${langName}. Do NOT use English unless citing a proper noun or technical term that has no ${langName} equivalent.`;
}

/**
 * Get the display name for a language code.
 */
export function getLanguageName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.nativeName ?? lang?.name ?? code;
}

/**
 * Validate if a language code is supported.
 */
export function isValidLanguage(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((l) => l.code === code);
}
