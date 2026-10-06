// src/utils/readableModelText.ts
//
// Ответ модели — человеку: без LaTeX и служебных имён промпта.
//
// Промпт материального баланса просит писать расчёты обычным текстом, но
// модели всё равно пишут «$1000 \text{ кг} \times 0.85 = 850 \text{ кг}$»,
// «$H_2$», «M_{P2}» и «в KNOWN_DATA». Формулы в интерфейсе не отрисовываются,
// и человек видел «text», «times», доллары и подчёркивания. Здесь — перевод в
// обычный текст: ×, ≈, H₂, C₁–C₄, «известные данные». Работает и для
// расчётов, сохранённых раньше.

import type { BalanceRecord } from "../store/api/material-balance-api";

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻",
};

/** Команды-символы TeX. Незнакомая команда остаётся словом без «\». */
const SYMBOLS: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", approx: "≈", simeq: "≈", sim: "~",
  pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  to: "→", rightarrow: "→", longrightarrow: "→", Rightarrow: "⇒",
  leftarrow: "←", leftrightarrow: "↔", rightleftharpoons: "⇌",
  infty: "∞", degree: "°", circ: "°", cdots: "…", ldots: "…", dots: "…",
  quad: " ", qquad: " ", percent: "%",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", kappa: "κ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ",
  sum: "Σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
};

const chars = (s: string) => [...s];

/** Нижний индекс: цифры — Юникодом (H₂, C₁), остальное — в скобках: M(P2). */
function sub(raw: string): string {
  const t = raw.trim();
  if (t && chars(t).every((ch) => SUB[ch])) return chars(t).map((ch) => SUB[ch]).join("");
  return t ? `(${t})` : "";
}

/** Верхний индекс: цифры — Юникодом (м³, 10⁶), остальное — «^(…)». */
function sup(raw: string): string {
  const t = raw.trim();
  if (t && chars(t).every((ch) => SUP[ch])) return chars(t).map((ch) => SUP[ch]).join("");
  return t ? `^(${t})` : "";
}

/** Часть дроби в скобках, если это не одно число или слово. */
const group = (s: string) => {
  const t = s.trim();
  return /[\s+\-−×·*/]/.test(t) ? `(${t})` : t;
};

/** Формула TeX без «$» — обычным текстом. */
function latexToText(src: string): string {
  let t = src;
  // Обёртки текста и шрифта: \text{ кг} → « кг». Вложенные — за проходы.
  for (let i = 0; i < 3; i++) {
    t = t.replace(
      /\\(?:text|textrm|textit|textbf|textnormal|mathrm|mathit|mathbf|mathsf|mathtt|operatorname|mbox|hbox)\s*\{([^{}]*)\}/g,
      "$1",
    );
  }
  for (let i = 0; i < 3; i++) {
    t = t.replace(
      /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_, a: string, b: string) => `${group(a)} / ${group(b)}`,
    );
  }
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  t = t.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°");
  t = t.replace(/_\s*\{([^{}]*)\}/g, (_, x: string) => sub(x));
  t = t.replace(/_\s*([A-Za-zА-Яа-яЁё0-9])/g, (_, x: string) => sub(x));
  t = t.replace(/\^\s*\{([^{}]*)\}/g, (_, x: string) => sup(x));
  t = t.replace(/\^\s*([0-9])/g, (_, x: string) => sup(x));
  t = t.replace(/\\(?:left|right|big|Big|bigg|Bigg)(?![A-Za-z])\s*/g, "");
  t = t.replace(/\\\\/g, " ");
  t = t.replace(/\\[,;:!> ]/g, " ").replace(/~/g, " ");
  t = t.replace(/\\%/g, "%").replace(/\\\{/g, "(").replace(/\\\}/g, ")").replace(/\\\$/g, "$");
  t = t.replace(/\\([A-Za-z]+)/g, (_, name: string) => SYMBOLS[name] ?? name);
  t = t.replace(/[{}]/g, "");
  // Десятичная точка — запятая, как в остальном тексте: 0.85 → 0,85.
  t = t.replace(/(\d)\.(\d)/g, "$1,$2");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Формулы: $$…$$, \[…\], \(…\) и $…$. Одиночные «$» — формула, только если
 * внутри есть TeX (\, _, ^, {): «$500 и $600» — это деньги.
 */
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

/** TeX без «$»: модели пишут и так — «1000 кг \times 0,85». */
const LOOSE = /\\(times|cdot|div|approx|pm|le|leq|ge|geq|ne|neq|to|rightarrow)(?![A-Za-z])/g;

/** Служебные имена промпта и их формы: им., род., дат., твор., предл. */
const SERVICE: Record<string, Record<"nom" | "gen" | "dat" | "ins" | "prep", string>> = {
  KNOWN_DATA: {
    nom: "известные данные",
    gen: "известных данных",
    dat: "известным данным",
    ins: "известными данными",
    prep: "известных данных",
  },
  SELECTED_PRODUCTS: {
    nom: "выбранные продукты",
    gen: "выбранных продуктов",
    dat: "выбранным продуктам",
    ins: "выбранными продуктами",
    prep: "выбранных продуктах",
  },
  GRAPH_CONTEXT: {
    nom: "контекст графа",
    gen: "контекста графа",
    dat: "контексту графа",
    ins: "контекстом графа",
    prep: "контексте графа",
  },
  BASIS: {
    nom: "базис",
    gen: "базиса",
    dat: "базису",
    ins: "базисом",
    prep: "базисе",
  },
  SERVER_SOURCE_CHECKS: {
    nom: "серверная проверка источников",
    gen: "серверной проверки источников",
    dat: "серверной проверке источников",
    ins: "серверной проверкой источников",
    prep: "серверной проверке источников",
  },
};

/** Падеж после предлога: «в KNOWN_DATA» → «в известных данных». */
const CASE_AFTER: Record<string, "gen" | "dat" | "ins" | "prep"> = {
  в: "prep", во: "prep", о: "prep", об: "prep", обо: "prep", на: "prep", при: "prep",
  из: "gen", от: "gen", до: "gen", без: "gen", для: "gen", у: "gen", кроме: "gen",
  после: "gen", вместо: "gen", среди: "gen", около: "gen", "из-за": "gen",
  по: "dat", к: "dat", ко: "dat", согласно: "dat",
  с: "ins", со: "ins", между: "ins", над: "ins", под: "ins", за: "ins", перед: "ins",
};

const SERVICE_RE = new RegExp(
  `(?:(\\p{L}[\\p{L}-]*)(\\s+))?\`?(?<![\\p{L}\\d_])(${Object.keys(SERVICE).join("|")})(?![\\p{L}\\d_])\`?`,
  "gu",
);

/** Начало предложения, строки или пункта списка: туда — с заглавной. */
const SENTENCE_START = /(?:(?:^|\n)[\s>*•-]*|(?:^|\n)\s*\d+[.)]\s*|[.!?…]\s+|\*\*\s*)$/;

function serviceNames(text: string): string {
  return text.replace(
    SERVICE_RE,
    (m, word: string | undefined, space: string | undefined, name: string, offset: number) => {
      // Внутри адреса — не трогать: «…/BASIS.pdf» должен открываться.
      const before = text.slice(0, offset + (word ? word.length + (space?.length ?? 0) : 0));
      if (/:\/\/\S*$/.test(before)) return m;
      const forms = SERVICE[name];
      const kase = word ? CASE_AFTER[word.toLowerCase()] : undefined;
      const phrase = forms[kase ?? "nom"];
      if (word) return `${word}${space}${phrase}`;
      return SENTENCE_START.test(text.slice(0, offset))
        ? phrase[0].toUpperCase() + phrase.slice(1)
        : phrase;
    },
  );
}

/** Текст ответа модели — читаемым: формулы обычным текстом, без служебных имён. */
export function readableText(text: string): string {
  if (!text) return text;
  let out = text.replace(
    MATH,
    (m, dbl?: string, br?: string, par?: string, single?: string) => {
      if (single !== undefined && !/[\\_^{}]/.test(single)) return m;
      return latexToText(dbl ?? br ?? par ?? single ?? "");
    },
  );
  out = out
    .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g, "$1")
    .replace(LOOSE, (_, name: string) => SYMBOLS[name] ?? name);
  return serviceNames(out);
}

const readable = (s: string | null | undefined) => (s ? readableText(s) : s);

const cache = new WeakMap<BalanceRecord, BalanceRecord>();

/**
 * Запись расчёта с читаемыми текстами — для показа. Числа и обозначения не
 * трогает; ответ модели целиком (answer) остаётся как пришёл.
 */
export function readableRecord(record: BalanceRecord): BalanceRecord {
  const hit = cache.get(record);
  if (hit) return hit;
  const r = (s: string) => readableText(s);
  const out: BalanceRecord = {
    ...record,
    statusLabel: r(record.statusLabel),
    chain: readable(record.chain) ?? null,
    basisText: readable(record.basisText) ?? null,
    nature: readable(record.nature) ?? null,
    products: record.products.map((p) => ({
      ...p,
      name: r(p.name),
      massText: r(p.massText),
      label: r(p.label),
      basis: r(p.basis),
    })),
    coefficients: record.coefficients.map((c) => ({
      ...c,
      indicator: r(c.indicator),
      valueText: r(c.valueText),
      unit: r(c.unit),
      source: r(c.source),
    })),
    flows: record.flows.map((f) => ({
      ...f,
      name: r(f.name),
      massText: r(f.massText),
      basis: r(f.basis),
    })),
    totals: {
      input: readable(record.totals.input) ?? null,
      output: readable(record.totals.output) ?? null,
      accumulation: readable(record.totals.accumulation) ?? null,
      residual: readable(record.totals.residual) ?? null,
      conclusion: readable(record.totals.conclusion) ?? null,
    },
    sources: record.sources.map((s) => ({
      ...s,
      title: r(s.title),
      org: r(s.org),
      type: r(s.type),
      usedFor: r(s.usedFor),
      block: r(s.block),
    })),
    sections: {
      transitions: r(record.sections.transitions),
      balance: r(record.sections.balance),
      notes: r(record.sections.notes),
    },
  };
  cache.set(record, out);
  return out;
}

/** Есть ли в текстах ответа обозначения P1, P2, T1 — тогда нужна расшифровка. */
export function mentionsRefs(record: BalanceRecord): boolean {
  const re = /(?<![\p{L}\d])[PpРрTtТт]\d{1,2}(?![\p{L}\d])/u;
  return [
    record.sections.transitions,
    record.sections.balance,
    record.sections.notes,
    ...record.sources.map((s) => s.block),
  ].some((t) => re.test(t ?? ""));
}
