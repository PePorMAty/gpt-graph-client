// src/utils/materialBalance.ts
//
// Материальный баланс на клиенте: где лежат расчёты, как пересчитать их на
// базис человека и что написать на узлах.
//
// Сервер всегда считает на 1 т исходного продукта (P1). Массы
// пропорциональны, поэтому любое количество, единица и даже «сколько сырья
// на 50 т продукта» — пропорция от того же расчёта, без нового запроса.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type {
  BalanceAmount,
  BalanceRecord,
  BalanceStatus,
} from "../store/api/material-balance-api";
import { transformationIO } from "./collapseDuplicateTransformations";
import { normalizeProductName } from "./normalizeProductName";

export type BalanceUnit = "кг" | "т" | "тыс. т";

export const BALANCE_UNITS: BalanceUnit[] = ["кг", "т", "тыс. т"];

const UNIT_KG: Record<BalanceUnit, number> = {
  кг: 1,
  т: 1000,
  "тыс. т": 1_000_000,
};

/**
 * Базис показа: столько-то такого-то продукта расчёта. ref — обозначение
 * продукта в расчёте: P1 — исходный, P2 — целевой.
 */
export interface BalanceView {
  amount: number;
  unit: BalanceUnit;
  ref: string;
}

export const DEFAULT_VIEW: BalanceView = { amount: 1, unit: "т", ref: "P1" };

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

/** Расчёты узла преобразования, свежие первыми. */
export function calcsOf(node: CustomNode | undefined | null): MaterialBalanceCalc[] {
  const list = node?.data?.materialBalances;
  if (!Array.isArray(list)) return [];
  return (list as MaterialBalanceCalc[]).filter(
    (c) => c && c.record && typeof c.record.id === "number",
  );
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

/**
 * Сырьё и продукты преобразования — по смыслу связей, основные первыми.
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
  const io = transformationIO(nodes, edges).get(transformationId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const order = (ids: Set<string> | undefined) =>
    [...(ids ?? [])]
      .map((id) => byId.get(id))
      .filter((n): n is CustomNode => !!n && n.type === "product")
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  return { ins: order(io?.ins), outs: order(io?.outs) };
}

/**
 * Узлы графа по обозначениям расчёта. P1 и P2 — выбранные человеком, T1 —
 * преобразование, остальные — по названию среди его входов и выходов: так
 * расчёт из базы, сделанный на другом графе, ложится и на этот.
 */
export function nodeIdsFor(
  record: Pick<BalanceRecord, "refs">,
  ends: {
    transformationId: string;
    basisId: string;
    targetId: string;
    ins: CustomNode[];
    outs: CustomNode[];
  },
): Record<string, string> {
  const out: Record<string, string> = {
    T1: ends.transformationId,
    P1: ends.basisId,
    P2: ends.targetId,
  };
  const pool = [...ends.ins, ...ends.outs].filter(
    (n) => n.id !== ends.basisId && n.id !== ends.targetId,
  );
  for (const r of record.refs) {
    if (!r.ref.startsWith("P") || out[r.ref]) continue;
    const node = pool.find((n) => sameName(n.data?.label, r.name));
    if (node) out[r.ref] = node.id;
  }
  return out;
}

/**
 * Масса продукта расчёта на 1 т исходного: из «Результатов по продуктам»,
 * иначе из внешних потоков баланса по названию. Исходный продукт — базис,
 * 1000 кг по определению.
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
 * Во сколько раз умножить массы «на 1 т исходного», чтобы базисом стал выбор
 * человека. Масса продукта-базиса неизвестна — пересчитать нельзя.
 */
function factorFor(record: BalanceRecord, view: BalanceView): BalanceAmount | null {
  const base = massPerTonne(record, view.ref);
  if (!base || base.min <= 0 || !(view.amount > 0)) return null;
  const kg = view.amount * UNIT_KG[view.unit];
  return { min: kg / base.max, max: kg / base.min, approx: base.approx };
}

/** Масса продукта расчёта на базис человека, в кг. */
export function shownMass(
  calc: Pick<MaterialBalanceCalc, "record" | "view">,
  ref: string,
): BalanceAmount | null {
  const m = massPerTonne(calc.record, ref);
  const f = factorFor(calc.record, calc.view);
  if (!m || !f) return null;
  // Сам продукт-базис — ровно то, что задано, без «≈».
  if (ref === calc.view.ref) {
    const kg = calc.view.amount * UNIT_KG[calc.view.unit];
    return { min: kg, max: kg, approx: false };
  }
  return { min: m.min * f.min, max: m.max * f.max, approx: m.approx || f.approx };
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

/** Подпись базиса: «1 т Изобутилена» — без склонения, «1 т · Изобутилен». */
export function viewLabel(record: BalanceRecord, view: BalanceView): string {
  const name = record.refs.find((r) => r.ref === view.ref)?.name ?? view.ref;
  return `${NUMBER.format(view.amount)} ${view.unit} · ${name}`;
}

/**
 * Пара по умолчанию для выбранного преобразования: та же, что в его
 * последнем расчёте, иначе основной вход и основной выход (balanceEnds).
 */
export function defaultPair(
  transformationId: string,
  nodes: CustomNode[],
  edges: Edge[],
): { basisId: string | null; targetId: string | null } {
  const node = nodes.find((n) => n.id === transformationId);
  const { ins, outs } = balanceEnds(transformationId, nodes, edges);
  const latest = calcsOf(node)[0];
  const basisId =
    latest && ins.some((n) => n.id === latest.nodeIds.P1)
      ? latest.nodeIds.P1
      : (ins[0]?.id ?? null);
  const targetId =
    latest && outs.some((n) => n.id === latest.nodeIds.P2)
      ? latest.nodeIds.P2
      : (outs[0]?.id ?? null);
  return { basisId, targetId };
}

/** Что режим баланса рисует на полотне. */
export interface BalanceLayer {
  /** Узлы, которые остаются яркими; остальные приглушаются. Пусто — никого. */
  lit: Set<string>;
  /** Подписи масс на продуктах; basis — продукт-базис расчёта. */
  mass: Map<string, { text: string; basis: boolean }>;
  /** Подпись коэффициента на преобразовании расчёта. */
  coefficient: { nodeId: string; text: string } | null;
  /** Сколько расчётов у преобразования — значок ⚖. */
  marks: Map<string, number>;
  /** Расчёт, чьи числа на узлах. */
  shown: { nodeId: string; calc: MaterialBalanceCalc } | null;
}

/**
 * Режим «Материальный баланс» на полотне.
 *
 * Чьи числа показывать — см. shownCalcFor. Один продукт бывает выходом
 * одного расчёта и входом другого с разными числами, поэтому на узлах —
 * всегда один расчёт.
 */
export function balanceLayer(args: {
  nodes: CustomNode[];
  edges: Edge[];
  selection: { transformationId: string; basisId: string | null; targetId: string | null } | null;
  active: { nodeId: string; recordId: number } | null;
}): BalanceLayer {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  const shown = shownCalcFor(args);

  const lit = new Set<string>();
  const mass = new Map<string, { text: string; basis: boolean }>();
  let coefficient: BalanceLayer["coefficient"] = null;

  if (sel) {
    lit.add(sel.transformationId);
    const { ins, outs } = balanceEnds(sel.transformationId, args.nodes, args.edges);
    for (const n of [...ins, ...outs]) lit.add(n.id);
  }
  if (shown) {
    const { calc, nodeId } = shown;
    lit.add(nodeId);
    for (const [ref, id] of Object.entries(calc.nodeIds)) {
      if (!ref.startsWith("P") || byId.get(id)?.type !== "product") continue;
      lit.add(id);
      mass.set(id, {
        text: formatMass(shownMass(calc, ref), calc.view.unit),
        basis: ref === calc.view.ref,
      });
    }
    const text = coefficientLabel(calc.record);
    if (text) coefficient = { nodeId, text };
  }

  const marks = new Map<string, number>();
  for (const n of args.nodes) {
    const k = n.type === "transformation" ? calcsOf(n).length : 0;
    if (k) marks.set(n.id, k);
  }
  return { lit, mass, coefficient, marks, shown };
}

/** Масса «на 1 т исходного» (поток баланса) на базис расчёта, в кг. */
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
 * Смена единицы переводит количество, а не меняет его смысл: 1 т → 1000 кг.
 * Числа на узлах остаются теми же массами, только в другой единице.
 */
export function convertUnit(view: BalanceView, unit: BalanceUnit): BalanceView {
  const amount = Number(((view.amount * UNIT_KG[view.unit]) / UNIT_KG[unit]).toPrecision(12));
  return { ...view, unit, amount };
}

/**
 * Расчёт, чьи числа на узлах и во вкладке.
 *
 * Выбрано преобразование — его расчёт той же пары: открытый во вкладке, если
 * он из этих, иначе свежий (нет такого — только подсветка выбора). Ничего не
 * выбрано — открытый во вкладке, иначе последний расчёт графа.
 */
export function shownCalcFor(args: {
  nodes: CustomNode[];
  selection: { transformationId: string; basisId: string | null; targetId: string | null } | null;
  active: { nodeId: string; recordId: number } | null;
}): { nodeId: string; calc: MaterialBalanceCalc } | null {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  if (sel) {
    const pair = calcsOf(byId.get(sel.transformationId)).filter(
      (c) => c.nodeIds.P1 === sel.basisId && c.nodeIds.P2 === sel.targetId,
    );
    const chosen =
      args.active?.nodeId === sel.transformationId
        ? pair.find((c) => c.record.id === args.active!.recordId)
        : undefined;
    const calc = chosen ?? pair[0];
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
