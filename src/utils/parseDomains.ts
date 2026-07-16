// src/utils/parseDomains.ts
//
// Разбор пользовательского ввода «домены через запятую» для ограничения
// web_search (задача 3.3). Зеркалит серверный sanitizeAllowedDomains:
// срез протокола/пути/порта/логина, lowercase, дедуп, максимум 20 доменов.

export const MAX_SEARCH_DOMAINS = 20;

export function parseDomainsInput(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of text.split(/[,\s]+/)) {
    let s = part.trim().toLowerCase();
    if (!s) continue;
    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = new URL(s).hostname;
    } catch {
      // не URL — дорежем вручную ниже
    }
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    s = s.split(/[/?#]/)[0];
    s = s.split("@").pop() ?? "";
    s = s.split(":")[0];
    s = s.replace(/^\.+|\.+$/g, "");
    if (!s.includes(".") || !/^[a-z0-9.-]+$/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_SEARCH_DOMAINS) break;
  }

  return out;
}
