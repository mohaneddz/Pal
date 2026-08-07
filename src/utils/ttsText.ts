/**
 * Strip markdown decoration and emoji from text before it reaches a TTS
 * engine. Both Kokoro and cloud voices otherwise read punctuation like
 * `**` or `#` aloud, or choke on characters outside their vocabulary.
 */

// Emoji + pictographic ranges, misc symbols, dingbats, variation selectors,
// and the zero-width joiner used to combine multi-codepoint emoji.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu;

export function sanitizeForSpeech(text: string): string {
  return (
    text
      // Fenced/inline code: drop the markers but keep the content.
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]*)`/g, "$1")
      // Markdown links/images: keep the visible label, drop the URL.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Emphasis/strong/strikethrough markers.
      .replace(/(\*\*\*|\*\*|\*|___|__|_|~~)/g, "")
      // Heading and blockquote markers at line start.
      .replace(/^\s{0,3}(#{1,6}|>)\s+/gm, "")
      // Horizontal rules.
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      .replace(EMOJI_PATTERN, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
