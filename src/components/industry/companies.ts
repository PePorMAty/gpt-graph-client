import type { IndustryProducer } from "../../store/api/industry-api";

/**
 * Компания-производитель в отборе «Компания».
 *
 * Одна компания стоит в реестре под разными написаниями: у «Титана» есть
 * записи и от «АО «Группа компаний "ТИТАН"»», и от «АО «ГК "ТИТАН"»». Это одно
 * юрлицо — ИНН у записей общий, — и в отборе ему место одной строкой.
 */
export interface CompanyOption {
  /** ИНН, а если его нет — полное название. */
  key: string;
  /** Сокращённое название — самое частое из написаний. */
  label: string;
  full: string | null;
  inn: string | null;
  region: string | null;
  /** Сколько продуктов графа компания выпускает. */
  products: number;
  /** Слова для поиска: названия, ИНН и раскрытые сокращения. */
  words: string[];
}

/** Ключ компании: по ИНН, чтобы написания названия не дробили её на две. */
export function companyKey(p: Pick<IndustryProducer, "inn" | "producer" | "producerFull">): string {
  return p.inn || (p.producerFull ?? p.producer).trim().toLowerCase();
}

/** Слова названия: без кавычек и знаков, «ё» как «е». */
export function nameWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^0-9a-zа-я]+/)
    .filter(Boolean);
}

/**
 * Написания, под которыми компанию ищут, но которых нет в названии.
 *
 * Про заказчика говорят «ГК Титан», а в реестре он «Группа компаний "ТИТАН"»:
 * без этой пары «гк титан» не находил ничего, а просто «титан» находил
 * заодно и «Крымский титан».
 */
function aliasWords(words: string[]): string[] {
  const out: string[] = [];
  const text = ` ${words.join(" ")} `;
  if (text.includes(" группа компаний ")) out.push("гк");
  if (text.includes(" гк ")) out.push("группа", "компаний");
  return out;
}

/** Подходит ли компания под запрос: каждое слово запроса — начало слова названия. */
export function companyMatches(option: CompanyOption, query: string): boolean {
  const q = nameWords(query);
  // Начало слова, а не вхождение: иначе «гк» находил бы «мяГКие».
  return q.every((w) => option.words.some((word) => word.startsWith(w)));
}

/** Компании по записям реестра, чаще всего встречающиеся в графе — первыми. */
export function collectCompanies(
  rows: Array<IndustryProducer & { source: string }>,
): CompanyOption[] {
  const byKey = new Map<
    string,
    {
      /** Написание → сколько раз встретилось и полное название при нём. */
      labels: Map<string, { n: number; full: string | null }>;
      inn: string | null;
      region: string | null;
      products: Set<string>;
      words: Set<string>;
    }
  >();

  for (const r of rows) {
    const key = companyKey(r);
    let c = byKey.get(key);
    if (!c) {
      c = {
        labels: new Map(),
        inn: r.inn || null,
        region: r.region,
        products: new Set(),
        words: new Set(),
      };
      byKey.set(key, c);
    }
    const seen = c.labels.get(r.producer);
    c.labels.set(r.producer, {
      n: (seen?.n ?? 0) + 1,
      full: seen?.full ?? r.producerFull ?? null,
    });
    c.products.add(r.source);
    c.region ??= r.region;
    // Сокращения раскрываем по каждому написанию отдельно: «группа» и
    // «компаний» должны стоять рядом в одном названии, а не где-то в двух.
    for (const name of [r.producer, r.producerFull ?? "", r.inn ?? ""]) {
      const words = nameWords(name);
      for (const w of [...words, ...aliasWords(words)]) c.words.add(w);
    }
  }

  const out: CompanyOption[] = [];
  for (const [key, c] of byKey) {
    // Самое частое написание: какое из них сервер отдал представителем
    // записи, зависит от продукта.
    const [label, { full }] = [...c.labels].sort((a, b) => b[1].n - a[1].n)[0];
    out.push({
      key,
      label,
      full,
      inn: c.inn,
      region: c.region,
      products: c.products.size,
      words: [...c.words],
    });
  }
  return out.sort(
    (a, b) => b.products - a.products || a.label.localeCompare(b.label, "ru"),
  );
}
