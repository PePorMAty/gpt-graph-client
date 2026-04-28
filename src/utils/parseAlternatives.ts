// src/utils/parseAlternatives.ts

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
