// src/utils/materialBalance.ts
//
// Материальный баланс на клиенте: где лежат расчёты, как пересчитать их на
// количество человека и что написать на узлах.
//
// Вопрос всегда один: сколько продукта получится из сырья. Сырьё на полотне
// сверху, продукт снизу. Сервер считает на 1 т сырья; массы пропорциональны,
// поэтому любое количество и единица — пропорция от того же расчёта, без
// нового запроса.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type {
  BalanceAmount,
  BalanceRecord,
  BalanceStatus,
} from "../store/api/material-balance-api";
import { inferTFlow, productTransformationEnds, tFlowOf, type TFlow } from "./edgeFlow";
import { normalizeProductName } from "./normalizeProductName";
import { readableRecord } from "./readableModelText";

export type BalanceUnit = "кг" | "т" | "тыс. т";

export const BALANCE_UNITS: BalanceUnit[] = ["кг", "т", "тыс. т"];

const UNIT_KG: Record<BalanceUnit, number> = {
  кг: 1,
  т: 1000,
  "тыс. т": 1_000_000,
};

/**
 * Количество сырья: столько-то кг, т или тыс. т. Смена единицы меняет смысл
 * числа — «1 т» становится «1 кг», — а не переводит его.
 */
export interface BalanceView {
  amount: number;
  unit: BalanceUnit;
}

export const DEFAULT_VIEW: BalanceView = { amount: 1, unit: "т" };

/**
 * Расчёт в графе. Лежит в данных узла преобразования (materialBalances) и
 * сохраняется с графом — поэтому виден и по ссылке, и после перезагрузки.
 */
export interface MaterialBalanceCalc {
  /** Запись базы сервера: разбор ответа модели и сам ответ. */
  record: BalanceRecord;
  /** Узлы этого графа по обозначениям расчёта: P1 → id, …, T1 → id. */
  nodeIds: Record<string, string>;
  /** Взят из базы готовым, модель в этот раз не спрашивали. */
  fromCache?: boolean;
  /** Когда расчёт лёг в граф (ISO). */
  addedAt: string;
  view: BalanceView;
}

export const STATUS_TEXT: Record<BalanceStatus, string> = {
  calculated: "Рассчитан",
  partial: "Частично рассчитан",
  insufficient: "Недостаточно данных",
  invalid_selection: "Некорректный выбор",
  invalid_basis: "Не задан корректный базис",
  unknown: "Статус не распознан",
};

export const STATUS_TONE: Record<BalanceStatus, "ok" | "warn" | "bad"> = {
  calculated: "ok",
  partial: "warn",
  insufficient: "bad",
  invalid_selection: "bad",
  invalid_basis: "bad",
  unknown: "bad",
};

/** Ключ расчёта в узле — пара «сырьё → продукт». */
export const calcKey = (c: Pick<MaterialBalanceCalc, "nodeIds">) =>
  `${c.nodeIds?.P1 ?? ""}|${c.nodeIds?.P2 ?? ""}`;

/**
 * Расчёты узла преобразования, свежие первыми, — по одному на пару «сырьё →
 * продукт»: у преобразования с двумя входами и тремя выходами их до шести.
 * Новый расчёт той же пары заменяет прежний.
 *
 * Прежние версии копили расчёты одной пары без счёта — лишние, старые, не
 * показываем. Не показываем и расчёты «вверх» (на 1 т продукта) недолгой
 * версии с направлениями: их числа посчитаны на другой базис. Первая же
 * запись в узел их отбрасывает.
 */
export function calcsOf(node: CustomNode | undefined | null): MaterialBalanceCalc[] {
  const list = node?.data?.materialBalances;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: MaterialBalanceCalc[] = [];
  for (const c of list as MaterialBalanceCalc[]) {
    if (!c?.record || typeof c.record.id !== "number") continue;
    if ((c.record as { direction?: string }).direction === "up") continue;
    const key = calcKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Расчёт пары «сырьё → продукт» преобразования. */
export function calcFor(
  node: CustomNode | undefined | null,
  inputId: string | null | undefined,
  outputId: string | null | undefined,
): MaterialBalanceCalc | undefined {
  return calcsOf(node).find((c) => c.nodeIds.P1 === inputId && c.nodeIds.P2 === outputId);
}

/** Все расчёты графа, свежие первыми. */
export function allCalcs(
  nodes: CustomNode[],
): Array<{ nodeId: string; calc: MaterialBalanceCalc }> {
  return nodes
    .filter((n) => n.type === "transformation")
    .flatMap((n) => calcsOf(n).map((calc) => ({ nodeId: n.id, calc })))
    .sort((a, b) => b.calc.addedAt.localeCompare(a.calc.addedAt));
}

const sameName = (a: unknown, b: unknown) =>
  normalizeProductName(String(a ?? "")) === normalizeProductName(String(b ?? ""));

/** Продукт в одном ряду с преобразованием: зазор гасит дрожание узлов ряда. */
const SAME_ROW = 10;

/**
 * Сырьё и продукты преобразования — как они нарисованы, основные первыми.
 *
 * Связь с пометкой смысла (tFlow) рисуется по смыслу: сырьё входит в верх
 * преобразования, продукт выходит из низа, а стоящий не на своей стороне —
 * в обход. Связь старых графов без пометки рисуется по положению: продукт
 * выше преобразования — у его верха, ниже — у низа. Так и считаем: баланс
 * видит то же, что человек на полотне, и не предложит пару из двух продуктов
 * одного ряда. Раньше смысл старых связей выводился из того, как строили
 * цепочку, и сырьё, висящее под преобразованием рядом с его продуктом,
 * выглядело на полотне продуктом, а в балансе было сырьём. Только для
 * продукта в одном ряду с преобразованием смысл по-прежнему выводится
 * (inferTFlow).
 *
 * Основной — тот, у кого больше связей: продукт цепочки связан и с
 * соседними шагами, а реагент вроде метанола у «Получения МТБЭ» обычно
 * висит на одной связи.
 */
export function balanceEnds(
  transformationId: string,
  nodes: CustomNode[],
  edges: Edge[],
): { ins: CustomNode[]; outs: CustomNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeOf = (id: string) => byId.get(id)?.type;
  const t = byId.get(transformationId);
  const ins = new Set<string>();
  const outs = new Set<string>();
  let inferred: Map<string, TFlow | undefined> | null = null;
  for (const e of edges) {
    const ends = productTransformationEnds(e, typeOf);
    if (!ends || ends.transformation !== transformationId) continue;
    let flow = tFlowOf(e);
    if (!flow) {
      const dy = (byId.get(ends.product)?.position?.y ?? 0) - (t?.position?.y ?? 0);
      if (dy < -SAME_ROW) flow = "in";
      else if (dy > SAME_ROW) flow = "out";
      else {
        inferred ??= new Map(inferTFlow(nodes, edges).map((x) => [x.id, tFlowOf(x)]));
        flow = inferred.get(e.id) ?? (ends.product === e.source ? "in" : "out");
      }
    }
    (flow === "in" ? ins : outs).add(ends.product);
  }
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const order = (ids: Set<string>) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((n): n is CustomNode => !!n && n.type === "product")
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  return { ins: order(ins), outs: order(outs) };
}

/**
 * Узлы графа по обозначениям расчёта. P1 (сырьё) и P2 (продукт) — выбранные
 * человеком, T1 — преобразование, остальные — по названию среди его входов и
 * выходов: так расчёт из базы, сделанный на другом графе, ложится и на этот.
 */
export function nodeIdsFor(
  record: Pick<BalanceRecord, "refs">,
  ends: {
    transformationId: string;
    inputId: string;
    outputId: string;
    ins: CustomNode[];
    outs: CustomNode[];
  },
): Record<string, string> {
  const out: Record<string, string> = {
    T1: ends.transformationId,
    P1: ends.inputId,
    P2: ends.outputId,
  };
  const pool = [...ends.ins, ...ends.outs].filter(
    (n) => n.id !== ends.inputId && n.id !== ends.outputId,
  );
  for (const r of record.refs) {
    if (!r.ref.startsWith("P") || out[r.ref]) continue;
    const node = pool.find((n) => sameName(n.data?.label, r.name));
    if (node) out[r.ref] = node.id;
  }
  return out;
}

/** Сырьё или продукт: роль обозначения в расчёте. */
export function refRole(record: Pick<BalanceRecord, "refs">, ref: string): "сырьё" | "продукт" {
  const role = record.refs.find((r) => r.ref === ref)?.role;
  return role === "target" || role === "output" ? "продукт" : "сырьё";
}

/**
 * Масса продукта расчёта на 1 т сырья: из «Результатов по продуктам», иначе
 * из внешних потоков баланса по названию. Сырьё пары — базис, 1000 кг по
 * определению.
 */
export function massPerTonne(
  record: BalanceRecord,
  ref: string,
): BalanceAmount | null {
  const row = record.products.find((p) => p.ref === ref);
  if (row?.massKg) return row.massKg;
  if (ref === "P1") return { min: 1000, max: 1000, approx: false };
  const flow = record.flows.find((f) => flowRef(record, f.name) === ref);
  return flow?.massKg ?? null;
}

/**
 * Во сколько раз умножить массы «на 1 т сырья», чтобы базисом стало
 * количество человека. Масса сырья неизвестна — пересчитать нельзя.
 */
function factorFor(record: BalanceRecord, view: BalanceView): BalanceAmount | null {
  const base = massPerTonne(record, "P1");
  if (!base || base.min <= 0 || !(view.amount > 0)) return null;
  const kg = view.amount * UNIT_KG[view.unit];
  return { min: kg / base.max, max: kg / base.min, approx: base.approx };
}

/** Масса продукта расчёта на количество человека, в кг. */
export function shownMass(
  calc: Pick<MaterialBalanceCalc, "record" | "view">,
  ref: string,
): BalanceAmount | null {
  const m = massPerTonne(calc.record, ref);
  const f = factorFor(calc.record, calc.view);
  if (!m || !f) return null;
  // Само сырьё пары — ровно то, что задано, без «≈».
  if (ref === "P1") {
    const kg = calc.view.amount * UNIT_KG[calc.view.unit];
    return { min: kg, max: kg, approx: false };
  }
  return { min: m.min * f.min, max: m.max * f.max, approx: m.approx || f.approx };
}

/** Масса «на 1 т сырья» (поток баланса) на количество человека, в кг. */
export function scaleForView(
  calc: Pick<MaterialBalanceCalc, "record" | "view">,
  amount: BalanceAmount | null,
): BalanceAmount | null {
  const f = factorFor(calc.record, calc.view);
  if (!amount || !f) return null;
  return {
    min: amount.min * f.min,
    max: amount.max * f.max,
    approx: amount.approx || f.approx,
  };
}

const NUMBER = new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 3 });

/** «820 кг», «≈1,54 т», «150–200 кг», «нет данных». */
export function formatMass(amount: BalanceAmount | null, unit: BalanceUnit): string {
  if (!amount) return "нет данных";
  const k = UNIT_KG[unit];
  const lo = NUMBER.format(amount.min / k);
  const hi = NUMBER.format(amount.max / k);
  const value = lo === hi ? lo : `${lo}–${hi}`;
  return `${amount.approx ? "≈" : ""}${value} ${unit}`;
}

const AMOUNT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });

/** Количество человека: «1 т», «2,5 тыс. т». */
export const formatView = (view: BalanceView) => `${AMOUNT.format(view.amount)} ${view.unit}`;

/** Короткое имя показателя для узла: «выход», «расход», «конверсия». */
function shortIndicator(indicator: string): string {
  const s = indicator.toLowerCase();
  if (s.includes("выход")) return "выход";
  if (s.includes("расход")) return "расход";
  if (s.includes("конверс")) return "конверсия";
  if (s.includes("селектив")) return "селективность";
  if (s.includes("извлечен")) return "извлечение";
  if (s.includes("потер")) return "потери";
  return s.split(/\s+/)[0] ?? s;
}

/**
 * Подпись на узле преобразования: главный коэффициент стадии — выход, иначе
 * расход, иначе первый найденный. Без значения подписи нет.
 */
export function coefficientLabel(record: BalanceRecord): string | null {
  const rows = record.coefficients.filter((c) => c.value);
  const pick =
    rows.find((c) => /выход/i.test(c.indicator)) ??
    rows.find((c) => /расход/i.test(c.indicator)) ??
    rows[0];
  if (!pick) return null;
  // На узле место только на число: «% от массы сырья», «% (м/м)» — это «%»,
  // а длинные единицы — во вкладке.
  let unit = pick.unit.trim();
  if (/%/.test(pick.valueText)) unit = "";
  else if (unit.startsWith("%")) unit = "%";
  else if (unit.length > 10) unit = "";
  const suffix = !unit ? "" : unit === "%" ? "%" : ` ${unit}`;
  return `${shortIndicator(pick.indicator)} ${pick.valueText}${suffix}`;
}

export interface BalanceSelection {
  transformationId: string;
  /** Сырьё пары — P1 расчёта. */
  inputId: string | null;
  /** Продукт пары — P2 расчёта. */
  outputId: string | null;
}

type Pair = { inputId: string | null | undefined; outputId: string | null | undefined };

/**
 * Пара «сырьё → продукт» для преобразования: prefer (выбранная раньше), если
 * она у него ещё есть; иначе пара свежего расчёта; иначе основной вход и
 * основной выход (balanceEnds).
 */
export function pairFor(
  transformationId: string,
  nodes: CustomNode[],
  edges: Edge[],
  prefer?: Pair,
): BalanceSelection {
  const node = nodes.find((n) => n.id === transformationId);
  const { ins, outs } = balanceEnds(transformationId, nodes, edges);
  const isIn = (id: string | null | undefined) => !!id && ins.some((n) => n.id === id);
  const isOut = (id: string | null | undefined) => !!id && outs.some((n) => n.id === id);
  const valid = (p: Pair | undefined) => !!p && isIn(p.inputId) && isOut(p.outputId);
  const calc = calcsOf(node).find((c) => valid({ inputId: c.nodeIds.P1, outputId: c.nodeIds.P2 }));
  const pair: Pair | undefined = valid(prefer)
    ? prefer
    : calc
      ? { inputId: calc.nodeIds.P1, outputId: calc.nodeIds.P2 }
      : undefined;
  return {
    transformationId,
    inputId: pair?.inputId ?? (isIn(prefer?.inputId) ? prefer!.inputId! : (ins[0]?.id ?? null)),
    outputId: pair?.outputId ?? (isOut(prefer?.outputId) ? prefer!.outputId! : (outs[0]?.id ?? null)),
  };
}

/** Тон подписи на узле: базис — тёмная, масса — синяя, роль без массы — светлая. */
export type BalancePillTone = "basis" | "mass" | "role";

/** Что режим баланса рисует на полотне. */
export interface BalanceLayer {
  /** Узлы, которые остаются яркими; остальные приглушаются. Пусто — никого. */
  lit: Set<string>;
  /** Подписи на продуктах: «сырьё · 1 т», «продукт · ≈0,82 т». */
  mass: Map<string, { text: string; tone: BalancePillTone }>;
  /** Подпись коэффициента на преобразовании расчёта. */
  coefficient: { nodeId: string; text: string } | null;
  /** Сколько пар посчитано у преобразования — значок ⚖. */
  marks: Map<string, number>;
  /** Расчёт, чьи числа на узлах. */
  shown: { nodeId: string; calc: MaterialBalanceCalc } | null;
}

/**
 * Расчёт, чьи числа на узлах и во вкладке.
 *
 * Выбрано преобразование — расчёт выбранной пары (нет такого — только
 * подсветка выбора). Ничего не выбрано — открытый во вкладке, иначе
 * последний расчёт графа.
 */
export function shownCalcFor(args: {
  nodes: CustomNode[];
  selection: BalanceSelection | null;
  active: { nodeId: string; recordId: number } | null;
}): { nodeId: string; calc: MaterialBalanceCalc } | null {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  if (sel) {
    const calc = calcFor(byId.get(sel.transformationId), sel.inputId, sel.outputId);
    return calc ? { nodeId: sel.transformationId, calc } : null;
  }
  if (args.active) {
    const calc = calcsOf(byId.get(args.active.nodeId)).find(
      (c) => c.record.id === args.active!.recordId,
    );
    if (calc) return { nodeId: args.active.nodeId, calc };
  }
  return allCalcs(args.nodes)[0] ?? null;
}

/**
 * Режим «Материальный баланс» на полотне.
 *
 * Чьи числа показывать — см. shownCalcFor. Один продукт бывает выходом
 * одного расчёта и входом другого с разными числами, поэтому на узлах —
 * всегда один расчёт. На каждой подписи — роль: сырьё или продукт. У
 * выбранного преобразования роль подписана на всех его входах и выходах —
 * так видно, что с чем можно считать. Пока выбранная пара не посчитана, у её
 * сырья — количество из формы, у продукта — «?».
 */
export function balanceLayer(args: {
  nodes: CustomNode[];
  edges: Edge[];
  selection: BalanceSelection | null;
  active: { nodeId: string; recordId: number } | null;
  /** Количество из формы запроса — для подписи сырья до расчёта. */
  draft: BalanceView;
}): BalanceLayer {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  const shown = shownCalcFor(args);

  const lit = new Set<string>();
  const mass = new Map<string, { text: string; tone: BalancePillTone }>();
  let coefficient: BalanceLayer["coefficient"] = null;

  if (sel) {
    lit.add(sel.transformationId);
    const { ins, outs } = balanceEnds(sel.transformationId, args.nodes, args.edges);
    for (const n of ins) {
      lit.add(n.id);
      mass.set(n.id, { text: "сырьё", tone: "role" });
    }
    for (const n of outs) {
      lit.add(n.id);
      mass.set(n.id, { text: "продукт", tone: "role" });
    }
    if (!shown) {
      if (sel.inputId) {
        mass.set(sel.inputId, { text: `сырьё · ${formatView(args.draft)}`, tone: "basis" });
      }
      if (sel.outputId) mass.set(sel.outputId, { text: "продукт · ?", tone: "mass" });
    }
  }
  if (shown) {
    const { calc, nodeId } = shown;
    lit.add(nodeId);
    for (const [ref, id] of Object.entries(calc.nodeIds)) {
      if (!ref.startsWith("P") || byId.get(id)?.type !== "product") continue;
      lit.add(id);
      const m = shownMass(calc, ref);
      // Прочие входы и выходы, по которым модель цифр не дала, — только
      // роль; «нет данных» — у самой пары, там это важно.
      if (!m && ref !== "P1" && ref !== "P2") {
        mass.set(id, { text: refRole(calc.record, ref), tone: "role" });
        continue;
      }
      mass.set(id, {
        text: `${refRole(calc.record, ref)} · ${formatMass(m, calc.view.unit)}`,
        tone: ref === "P1" ? "basis" : "mass",
      });
    }
    const text = coefficientLabel(readableRecord(calc.record));
    if (text) coefficient = { nodeId, text };
  }

  const marks = new Map<string, number>();
  for (const n of args.nodes) {
    const k = n.type === "transformation" ? calcsOf(n).length : 0;
    if (k) marks.set(n.id, k);
  }
  return { lit, mass, coefficient, marks, shown };
}

/** Название без пояснений в скобках: «Нафта (нефтяная фракция…)» → «нафта». */
const coreName = (s: unknown) =>
  normalizeProductName(String(s ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim());

/**
 * Внешний поток баланса — это продукт расчёта (P…) или что-то сверх них.
 *
 * Модели пишут потоки по-своему: «Нафта (P1)» с обозначением, «Нафта» без
 * длинного пояснения из графа, «метанол» строчными. Без этого исходный
 * продукт попадал в потоки второй строкой — «дополнительным входом».
 */
export function flowRef(record: BalanceRecord, flowName: string): string | null {
  const explicit = String(flowName).match(/(?<![\p{L}\d])[PpРр]\s*-?\s*(\d{1,3})(?![\d\p{L}])/u);
  if (explicit && record.refs.some((r) => r.ref === `P${explicit[1]}`)) {
    return `P${explicit[1]}`;
  }
  const want = coreName(flowName);
  return (
    record.refs.find(
      (r) =>
        r.ref.startsWith("P") &&
        (sameName(r.name, flowName) || (want !== "" && coreName(r.name) === want)),
    )?.ref ?? null
  );
}

/**
 * Почему расчёт не полный — словами модели: её вывод о балансе, иначе
 * первое примечание. У полного расчёта — ничего.
 */
export function statusReason(record: BalanceRecord): string | null {
  if (record.status === "calculated") return null;
  const conclusion = record.totals?.conclusion?.trim();
  if (conclusion) return conclusion;
  const note = (record.sections?.notes ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .find(Boolean);
  return note || null;
}

/** «05.10, 14:32» — когда посчитан расчёт. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
