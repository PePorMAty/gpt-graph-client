// src/utils/parseAlternatives.ts

export type ParsedAlternative = {
  /** Заголовок альтернативы (после "## Альтернатива:") */
  title: string;
  /** Название первого шага (после "### Шаг 1.") */
  firstStepName: string;
  /** Полный текст альтернативы (все шаги) */
  fullDescription: string;
};

/**
 * Парсит альтернативы из markdown-текста обобщения.
 * Ищет секции "## Альтернатива:" и извлекает название первого шага и полное описание.
 */
export function parseAlternatives(text: string): ParsedAlternative[] {
  if (!text) return [];

  const alternatives: ParsedAlternative[] = [];

  // Находим все позиции "## Альтернатива:"
  const altRegex = /## Альтернатива:\s*(.+)/g;
  const matches: { title: string; startIndex: number }[] = [];

  let match;
  while ((match = altRegex.exec(text)) !== null) {
    matches.push({
      title: match[1].trim(),
      startIndex: match.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const { title, startIndex } = matches[i];
    const endIndex =
      i + 1 < matches.length ? matches[i + 1].startIndex : text.length;
    const section = text.slice(startIndex, endIndex).trim();

    // Извлекаем имя первого шага: "### Шаг 1. <name>"
    const stepMatch = section.match(/###\s*Шаг\s*1\.\s*(.+)/);
    const firstStepName = stepMatch ? stepMatch[1].trim() : title;

    alternatives.push({
      title,
      firstStepName,
      fullDescription: section,
    });
  }

  return alternatives;
}