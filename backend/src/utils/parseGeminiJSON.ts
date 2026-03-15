/**
 * Parse JSON from Gemini AI responses that may contain LaTeX.
 * Handles: code block stripping, LaTeX backslash escaping, array extraction.
 */
export function parseGeminiJSON(text: string): any {
  const cleaned = text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  // Try to match a JSON object or array
  const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
  if (!jsonMatch) return null;

  // Attempt 1: direct parse
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {}

  // Attempt 2: fix LaTeX escapes inside JSON strings
  const raw = jsonMatch[0];
  let result = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && (i === 0 || raw[i - 1] !== "\\")) {
      inString = !inString;
      result += ch;
    } else if (inString && ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (/[a-zA-Z]/.test(next)) {
        // Count how many letters follow the backslash
        let cmdLen = 0;
        for (let j = i + 1; j < raw.length && /[a-zA-Z]/.test(raw[j]); j++)
          cmdLen++;
        if (cmdLen >= 2) {
          // Multi-letter: LaTeX command (\frac, \sqrt, \cdot) → double-escape
          result += "\\\\";
        } else if ("bfnrt".includes(next)) {
          // Single valid JSON escape letter → keep as-is
          result += ch;
        } else {
          result += "\\\\";
        }
      } else if ('"\\\/'.includes(next) || next === "u") {
        result += ch;
      } else {
        result += "\\\\";
      }
    } else {
      result += ch;
    }
  }

  try {
    return JSON.parse(result);
  } catch {
    // Attempt 3: regex fallback
    const fixed = jsonMatch[0].replace(/\\([^"\\/bfnrtu])/g, "\\\\$1");
    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}
