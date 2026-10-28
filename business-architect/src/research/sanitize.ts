/**
 * Web content is untrusted DATA. This module normalises it and neutralises
 * instruction-like text (prompt-injection attempts) before it can reach any
 * agent context. The ContextAssembler additionally wraps it in
 * <untrusted_source> tags with an explicit rule that it carries no authority.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above|system)\s+\w+/i,
  /(ignore|oublie)\s+(toutes?\s+)?(les\s+)?(instructions|r[èe]gles)\s+(pr[ée]c[ée]dentes|ci-dessus|syst[èe]me)/i,
  /\byou\s+are\s+now\b/i,
  /\btu\s+es\s+(maintenant|d[ée]sormais)\b/i,
  /\b(system|developer)\s*prompt\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bnouvelles?\s+instructions?\s*:/i,
  /(reveal|print|send|exfiltrate|leak|r[ée]v[èe]le|envoie)\b[^.]{0,60}\b(api[\s_-]?key|secret|password|token|credentials?|cl[ée]s?\s+api|mot de passe)/i,
  /<\s*\/?\s*(system|instructions?|untrusted_source)\b[^>]*>/i,
  /\bgrant\s+(me\s+)?(admin|approval|permission)/i,
  /\b(approve|approuve)\s+(all|toutes?)\b/i,
];

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const NEUTRALISED_MARKER = "[instruction neutralisée]";

export type Sanitized = { text: string; injectionFlag: boolean; matches: string[] };

export function sanitizeUntrusted(raw: string, maxLen = 600): Sanitized {
  let text = stripHtml(raw ?? "");
  const matches: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    text = text.replace(g, (m) => {
      matches.push(m.slice(0, 80));
      return NEUTRALISED_MARKER;
    });
  }
  if (text.length > maxLen) text = text.slice(0, maxLen - 1) + "…";
  // A marker left by an upstream pass (e.g. inside a provider) keeps the flag set.
  return { text, injectionFlag: matches.length > 0 || text.includes(NEUTRALISED_MARKER), matches };
}

export function safeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}
