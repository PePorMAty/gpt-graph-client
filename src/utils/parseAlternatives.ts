// src/utils/parseAlternatives.ts
import { normalizeProductName } from "./normalizeProductName";

/**
 * Список продуктов из строки обобщения «[А, Б]» — как на сервере
 * (routes/step/utils/productList.js): по запятым и точкам с запятой, но не
 * внутри скобок («Смола (эпоксидная, жидкая)») и не между цифрами — «Нейлон
 * 6,6» и «1,2-дихлорэтан» одно название, а не два.
 */
export function splitProductList(raw: string): string[] {
  const s = String(raw || "");
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    const digitComma = ch === "," && /\d/.test(s[i - 1] ?? "") && /\d/.test(s[i + 1] ?? "");
    if ((ch === ";" || (ch === "," && !digitComma)) && depth === 0) {
      items.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map((x) => x.trim()).filter(Boolean);
}

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
    splitProductList(raw.replace(/^\s*\[/, "").replace(/\]\s*$/, ""))
      .map((s) => normalizeProductName(s))
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
 *
 * Отбрасывается и вариант, который ничего не добавляет к уже взятому: его
 * сырьё — то же или часть того, а продукты — часть тех же продуктов. Так
 * модель повторяла основной шаг по другому источнику: «Окисление
 * циклогексана → циклогексанол + циклогексанон» и альтернатива «Окисление до
 * циклогексанона» из того же сырья (граф владельца 2026-11-17). Построенная,
 * она ложилась вторым преобразованием к тем же узлам. Вариант с продуктом,
 * которого у взятых нет, остаётся — даже из того же сырья.
 */
export function dedupeAlternatives(
  parsed: ParsedAlternative[],
): ParsedAlternative[] {
  const seen = new Set<string>();
  const kept: { inputs: string[]; outputs: string[] }[] = [];
  const result: ParsedAlternative[] = [];
  const within = (part: string[], whole: string[]) => part.every((x) => whole.includes(x));
  for (const item of parsed) {
    const key = alternativeKey(item);
    if (key && seen.has(key)) continue;
    const products = extractStepProducts(item.fullDescription || "");
    const repeats =
      products.inputs.length > 0 &&
      products.outputs.length > 0 &&
      kept.some((k) => within(products.inputs, k.inputs) && within(products.outputs, k.outputs));
    if (repeats) continue;
    if (key) seen.add(key);
    if (products.inputs.length && products.outputs.length) kept.push(products);
    result.push(item);
  }
  return result;
}

/**
 * Продукты дальней стороны варианта — найденное шагом: у шага «вниз» «Что
 * производят», у шага «вверх» — «Из чего производят». Названия как в тексте.
 */
function farSideNames(description: string, direction: "up" | "down"): string[] {
  const label = direction === "up" ? "Из чего производят" : "Что производят";
  const m = new RegExp(`\\*\\*${label}:\\*\\*([^\\n]*)`).exec(description || "");
  if (!m) return [];
  return splitProductList(m[1].trim().replace(/^\[/, "").replace(/\]\.?$/, ""));
}

/**
 * Вариант шага ведёт только назад по цепочке: все его продукты дальней
 * стороны уже есть в родословной раскрываемого продукта (lineage — он сам и
 * его предки по построению). Шаг вниз от поликарбоната «Что производят:
 * [Бисфенол А]», а поликарбонат из бисфенола А и получен — это обратная
 * переработка (рециклинг): шаг ляжет связью рециклинга, нового направления
 * цепочки не даст. Возвращает эти продукты; пусто — вариант ведёт вперёд
 * (или формат не тот).
 */
export function variantLoopsBack(
  description: string,
  direction: "up" | "down",
  lineage: string[],
): string[] {
  const names = farSideNames(description, direction);
  if (!names.length) return [];
  const known = new Set(lineage.map(normalizeProductName).filter(Boolean));
  return names.every((n) => known.has(normalizeProductName(n))) ? names : [];
}

/** То же для основного варианта обобщения. */
export function stepLoopsBack(
  text: string,
  direction: "up" | "down",
  lineage: string[],
): string[] {
  if (!text) return [];
  const main = parseAlternatives(text)[0]?.fullDescription ?? text;
  return variantLoopsBack(main, direction, lineage);
}

const EMPTY_LIST_WORDS =
  /^(?:—|–|-|нет|нет данных|не найден[оаы]?|не указан[оаы]?|отсутству\w*)\.?$/i;

/**
 * Обобщение не нашло продуктов шага: у шага «вниз» пусто «Что производят», у
 * шага «вверх» — «Из чего производят». Промпты обобщения так и пишут («[]»),
 * когда в источниках нет нужной связи. Строить по такому тексту нельзя:
 * построение требует непустых списков, и модель придумала бы продукты сама.
 * Смотрим основной вариант. Поля нет вовсе — формат другой, решать не нам.
 */
export function stepFarSideEmpty(
  text: string,
  direction: "up" | "down",
): boolean {
  if (!text) return false;
  const main = parseAlternatives(text)[0]?.fullDescription ?? text;
  const label = direction === "up" ? "Из чего производят" : "Что производят";
  const m = new RegExp(`\\*\\*${label}:\\*\\*([^\\n]*)`).exec(main);
  if (!m) return false;
  const inner = m[1]
    .trim()
    .replace(/^\[/, "")
    .replace(/\]\.?$/, "")
    .trim();
  return inner === "" || EMPTY_LIST_WORDS.test(inner);
}

export type StepSufficiency = "complete" | "partial" | "unresolved";

/**
 * «Достаточность данных» из примечаний обобщения (промпты v4): complete —
 * источники называют весь состав шага, partial — только часть сырья или
 * продуктов, unresolved — шага по источникам нет. У прежних промптов такой
 * строки нет — null. Так же читает сервер (aggregate.js → sufficiencyOf).
 */
export function stepSufficiency(text: string): StepSufficiency | null {
  const m = /Достаточность данных:?\**:?\s*\**\s*(complete|partial|unresolved)/i.exec(text || "");
  return m ? (m[1].toLowerCase() as StepSufficiency) : null;
}
