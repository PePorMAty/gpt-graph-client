// src/utils/parseAlternatives.ts
import { normalizeProductName } from "./normalizeProductName";

export type ParsedAlternative = {
  title: string;
  firstStepName: string;
  fullDescription: string;
};

/**
 * Парсит варианты шага из markdown-текста обобщения.
 *
 * Серверный шаблон:
 *   ## Шаг                        ← основной вариант
 *   ...
 *   ## Альтернатива: <название>   ← альтернатива 1
 *   ...
 *   ## Альтернатива: <название>   ← альтернатива 2
 *   ...
 *   # Примечания                  ← отсекается
 *
 * Возвращает [основной, альт1, альт2, ...].
 * Если альтернатив нет — возвращает [основной] (длина 1 → радио не показываем).
 */
export function parseAlternatives(text: string): ParsedAlternative[] {
  if (!text) return [];

  const result: ParsedAlternative[] = [];

  const notesIdx = text.search(/^# (?:Примечания|Контроль)/m);
  const body = notesIdx >= 0 ? text.slice(0, notesIdx).trim() : text.trim();

  // "## Шаг" without \b — \b doesn't work with Cyrillic in JS
  const mainMatch = body.match(/^## Шаг(?:\s|$)/m);

  const altRegex = /^## Альтернатива:\s*(.+)/gm;
  const altMatches: { title: string; startIndex: number }[] = [];
  let m;
  while ((m = altRegex.exec(body)) !== null) {
    altMatches.push({ title: m[1].trim(), startIndex: m.index });
  }

  const altSectionIdx = body.search(/^# Альтернативы/m);

  if (mainMatch) {
    const mainStart = mainMatch.index;
    const mainEnd =
      altMatches.length > 0
        ? altMatches[0].startIndex
        : altSectionIdx >= 0
          ? altSectionIdx
          : body.length;
    const section = body.slice(mainStart, mainEnd).trim();

    const formulaMatch = section.match(
      /\*\*Краткая формула шага:\*\*\s*(.+)/,
    );
    const firstStepName = formulaMatch
      ? formulaMatch[1].trim()
      : "Основной вариант";

    result.push({
      title: "Основной вариант",
      firstStepName,
      fullDescription: section,
    });
  } else if (altMatches.length > 0) {
    // Fallback: no "## Шаг" found — take everything before first alternative as main
    const fallbackStart = body.search(/^# Новый производственный шаг/m);
    const mainBodyStart = fallbackStart >= 0 ? fallbackStart : 0;
    const mainBodyEnd =
      altSectionIdx >= 0
        ? Math.min(altSectionIdx, altMatches[0].startIndex)
        : altMatches[0].startIndex;
    const section = body.slice(mainBodyStart, mainBodyEnd).trim();

    if (section) {
      const formulaMatch = section.match(
        /\*\*Краткая формула шага:\*\*\s*(.+)/,
      );
      const firstStepName = formulaMatch
        ? formulaMatch[1].trim()
        : "Основной вариант";

      result.push({
        title: "Основной вариант",
        firstStepName,
        fullDescription: section,
      });
    }
  }

  if (altMatches.length === 0) return result.length > 0 ? result : [];

  for (let i = 0; i < altMatches.length; i++) {
    const { title, startIndex } = altMatches[i];
    const endIndex =
      i + 1 < altMatches.length ? altMatches[i + 1].startIndex : body.length;
    const section = body.slice(startIndex, endIndex).trim();

    const formulaMatch = section.match(
      /\*\*Краткая формула шага:\*\*\s*(.+)/,
    );
    const firstStepName = formulaMatch
      ? formulaMatch[1].trim()
      : title;

    result.push({ title, firstStepName, fullDescription: section });
  }

  return result;
}

/**
 * Парсит из markdown-секции шага списки продуктов «Что производят» (выходы) и
 * «Из чего производят» (входы), нормализуя имена. Списки могут быть в скобках
 * «[A, B]» или без; разделители — запятая/точка с запятой.
 */
export function extractStepProducts(description: string): {
  inputs: string[];
  outputs: string[];
} {
  const parseList = (raw: string): string[] =>
    raw
      .replace(/^\s*\[/, "")
      .replace(/\]\s*$/, "")
      .split(/[;,]/)
      .map((s) => normalizeProductName(s.trim()))
      .filter(Boolean);
  const outM = /\*\*Что производят:\*\*\s*(.+)/.exec(description || "");
  const inM = /\*\*Из чего производят:\*\*\s*(.+)/.exec(description || "");
  return {
    outputs: outM ? parseList(outM[1]) : [],
    inputs: inM ? parseList(inM[1]) : [],
  };
}

/**
 * Канонический ключ «сути» варианта шага для детекта дублей. Основной сигнал —
 * нормализованный набор входов+выходов; если их не удалось распарсить — фолбэк
 * на нормализованную краткую формулу/заголовок. Пустая строка = ключ не
 * определён (такой вариант НЕ схлопываем, чтобы не потерять данные).
 */
export function alternativeKey(item: {
  fullDescription?: string;
  firstStepName?: string;
  title?: string;
}): string {
  const { inputs, outputs } = extractStepProducts(item.fullDescription || "");
  if (inputs.length || outputs.length) {
    return (
      "p:" + [...outputs].sort().join("|") + "<=" + [...inputs].sort().join("|")
    );
  }
  const f = normalizeProductName(item.firstStepName || item.title || "");
  return f ? "f:" + f : "";
}

/**
 * Схлопывает дубли вариантов шага: оставляет первое вхождение каждого
 * уникального ключа (alternativeKey). Основной вариант идёт первым, поэтому
 * альтернатива, совпадающая с ним по сути, тоже отбрасывается. Варианты с
 * неопределённым ключом не трогаем.
 */
export function dedupeAlternatives(
  parsed: ParsedAlternative[],
): ParsedAlternative[] {
  const seen = new Set<string>();
  const result: ParsedAlternative[] = [];
  for (const item of parsed) {
    const key = alternativeKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(item);
  }
  return result;
}
