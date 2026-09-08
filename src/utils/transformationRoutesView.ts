// src/utils/transformationRoutesView.ts
//
// Вид обобщённого описания шага во вкладке «Технологические маршруты»
// карточки преобразования.
//
// Обобщение приходит по шаблону step-aggregate (см. prompts/aggregatePrompt.ts)
// и, кроме самого шага, несёт служебные разделы: раскрываемый продукт,
// примечания и родословную. Для построения шага они нужны (их читает
// buildTechDescriptionContext и сервер), поэтому текст в node.data НЕ меняем —
// служебные разделы прячем только на показ.

/** Разделы, которые не показываем в карточке преобразования. */
const HIDDEN_SECTIONS = [
  "раскрываемый продукт",
  "примечания",
  "родословная",
];

/** Заголовки разделов, переименованные для карточки. */
const RENAMED_SECTIONS: Array<{ match: string; title: string }> = [
  { match: "новый производственный шаг", title: "Основной путь" },
  { match: "альтернативы", title: "Альтернативные пути" },
];

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Заголовок для сравнения: без markdown-разметки, регистра и уточнений в скобках. */
function normalizeTitle(title: string): string {
  return title
    .replace(/[*_`#]/g, "")
    .replace(/\([^)]*\)?/g, "")
    .replace(/[:：].*$/, "")
    .trim()
    .toLowerCase();
}

interface Heading {
  line: number;
  level: number;
  title: string;
}

/** Заголовки верхнего уровня и вложенные; строки внутри ``` не считаем. */
function findHeadings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  lines.forEach((raw, i) => {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = HEADING_RE.exec(raw);
    if (m) out.push({ line: i, level: m[1].length, title: m[2] });
  });
  return out;
}

/**
 * Готовит обобщённое описание к показу в карточке преобразования:
 * убирает служебные разделы и переименовывает заголовки маршрутов.
 * Раздел — это заголовок и всё до следующего заголовка того же или более
 * высокого уровня (то есть вместе с вложенными подразделами).
 */
export function toTransformationRoutesView(markdown: string): string {
  const text = markdown ?? "";
  if (!text.trim()) return "";

  const lines = text.split("\n");
  const headings = findHeadings(lines);
  if (headings.length === 0) return text;

  const dropped = new Array<boolean>(lines.length).fill(false);

  headings.forEach((h, idx) => {
    const key = normalizeTitle(h.title);
    if (!HIDDEN_SECTIONS.includes(key)) return;
    // Конец раздела — следующий заголовок того же или более высокого уровня.
    const next = headings
      .slice(idx + 1)
      .find((other) => other.level <= h.level);
    const end = next ? next.line : lines.length;
    for (let i = h.line; i < end; i += 1) dropped[i] = true;
  });

  for (const h of headings) {
    if (dropped[h.line]) continue;
    const key = normalizeTitle(h.title);
    const renamed = RENAMED_SECTIONS.find((r) => r.match === key);
    if (renamed) {
      lines[h.line] = `${"#".repeat(h.level)} ${renamed.title}`;
    }
  }

  return lines
    .filter((_, i) => !dropped[i])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
