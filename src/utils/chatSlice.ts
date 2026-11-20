// Срез открытого графа для чата с ИИ (сервер: routes/chat/graphSlice.js,
// PG-MIGRATION.md, этап 4).
//
// Граф живёт в браузере вместе с несохранёнными правками, поэтому чат шлёт
// его сам — коротко: продукты (id и название), преобразования (сырьё →
// продукты по названиям) и контекст выбранного продукта (тот же, что у
// определения кодов). Собирается один раз, в момент отправки сообщения, а не
// на каждое изменение полотна: граф на сотни узлов не перерисовывается из-за
// открытого чата.
//
// Пределы — те же, что режет сервер: лишнее всё равно не дошло бы до модели.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type { TechnologySource } from "../store/types";
import { percentBalance, STATUS_TEXT, statusReason, type MaterialBalanceCalc } from "./materialBalance";
import { productContext, type ProductContext } from "./productContext";

export const CHAT_SLICE_LIMITS = { products: 600, transformations: 400, alternatives: 200, ends: 20, titles: 5, withSources: 80, note: 600, selection: 60 };

/** Найденные источники продукта в одну сторону: сколько и первые названия. */
type FoundSources = { count: number; titles: string[] };

export interface ChatGraphSlice {
  name: string;
  /**
   * sources — что мастер шага уже нашёл (база ИТС и интернет): человек видит
   * это на графе и спрашивает «что за источники нашлись» (20.11), а база
   * сервера знает только ИТС. Старый сервер поле не читает.
   */
  products: { id: string; label: string; sources?: { up?: FoundSources; down?: FoundSources }; empty?: true }[];
  /**
   * balance — последний расчёт материального баланса: статус, на что, почему
   * «частично» — чтобы досчитать его с данными. Старый сервер поле не читает.
   */
  transformations: {
    id: string;
    label: string;
    inputs: string[];
    outputs: string[];
    balance?: {
      status: string;
      basis?: string;
      note?: string;
      /** Массы расчёта в долях массы сырья: по ним сквозной баланс цепочки. */
      inputs?: Record<string, number>;
      outputs?: Record<string, number>;
    };
  }[];
  /**
   * Альтернативы шага отдельно от преобразований: у какого продукта стоят
   * и в какую сторону — вниз (что ещё делают из продукта) или вверх (как
   * ещё его получают). О них спрашивают: «покажи альтернативы». Старый
   * сервер поле не читает.
   */
  alternatives: { id: string; label: string; of: string[]; direction: "up" | "down"; description?: string }[];
  /**
   * Узлы, выделенные на полотне рамкой или с Shift: «заполни карточки для
   * всех выделенных» (20.11). Старый сервер поле не читает.
   */
  selection: { id: string; label: string; kind: "product" | "transformation" }[];
  /**
   * Название выбранного продукта — всегда, даже без контекста: у одинокого
   * узла без описания контекст пуст, а модель должна знать, о чём «этот
   * продукт». Старый сервер поле не читает.
   */
  selectedLabel: string | null;
  selected: ProductContext | null;
  /**
   * Последние изменения графа из его истории (новые сверху): «построй
   * дальше» — от последнего шага. Старый сервер поле не читает.
   */
  recent: { title: string; details?: string }[];
}

const labelOf = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();
/**
 * Альтернатива шага (chainVariant "alt") — вариант, который человек ещё не
 * принял, а не шаг графа: модель приняла бы «Бисфенол А» за преобразование
 * из фенола. Контекст продукта и определение кодов их тоже пропускают.
 */
const onGraph = (n: CustomNode) => n.data?.chainVariant !== "alt";

/** Источники продукта: пул мастера шага, а нет его — сохранённые в узле. */
function foundSources(list: TechnologySource[] | undefined): FoundSources | undefined {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const s of list ?? []) {
    const key = String(s.url || s.title || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const title = String(s.title || s.url || "").trim();
    if (title && titles.length < CHAT_SLICE_LIMITS.titles) titles.push(title);
  }
  return seen.size ? { count: seen.size, titles } : undefined;
}

/**
 * Последний расчёт баланса преобразования — коротко, с долями сырья и
 * продуктов от массы сырья (с правками человека): по ним сервер считает
 * сквозной баланс цепочки («сколько бензола на тонну фенола»). Названия —
 * узлов графа, а не расчёта: сервер сверяет их с преобразованиями среза.
 */
function lastBalance(
  n: CustomNode,
  labelOfId: (id: string) => string,
): ChatGraphSlice["transformations"][number]["balance"] | undefined {
  const calc = (n.data?.materialBalances as MaterialBalanceCalc[] | undefined)?.[0];
  if (!calc?.record) return undefined;
  const r = calc.record;
  const note = statusReason(r)?.replace(/\s+/g, " ").trim().slice(0, CHAT_SLICE_LIMITS.note);
  let inputs: Record<string, number> | undefined;
  let outputs: Record<string, number> | undefined;
  try {
    const pb = percentBalance(r, undefined, calc.shares, calc.sharesBasis);
    const shares = (rows: typeof pb.raw) => {
      const out: Record<string, number> = {};
      for (const row of rows) {
        if (!row.share) continue;
        const mid = (row.share.min + row.share.max) / 2;
        const name = (row.ref && labelOfId(calc.nodeIds[row.ref] ?? "")) || row.name;
        if (name && mid > 0) out[name] = Math.round(mid * 10000) / 10000;
      }
      return Object.keys(out).length ? out : undefined;
    };
    inputs = shares(pb.raw);
    outputs = shares(pb.products);
  } catch {
    // Старый расчёт без таблиц — без масс; статус всё равно нужен.
  }
  return {
    status: STATUS_TEXT[r.status] ?? r.statusLabel ?? r.status,
    ...(r.basis ? { basis: r.basis } : {}),
    ...(note ? { note } : {}),
    ...(inputs && outputs ? { inputs, outputs } : {}),
  };
}

export function buildChatSlice(
  nodes: CustomNode[],
  edges: Edge[],
  {
    name = "",
    selectedNodeId = null,
    recent = [],
    sourcesOf,
  }: {
    name?: string;
    selectedNodeId?: string | null;
    recent?: { title: string; details?: string }[];
    /** Найденное мастером шага для продукта (пул источников). */
    sourcesOf?: (label: string, direction: "up" | "down") => TechnologySource[] | undefined;
  } = {},
): ChatGraphSlice {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let withSources = 0;
  const products = nodes
    .filter((n) => n.type === "product" && onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.products)
    .map((n) => {
      const label = labelOf(n);
      const pick = (dir: "up" | "down", field: "sourcesUp" | "sourcesDown") => {
        const pool = sourcesOf?.(label, dir);
        return foundSources(pool?.length ? pool : (n.data?.[field] as TechnologySource[] | undefined));
      };
      const up = withSources < CHAT_SLICE_LIMITS.withSources ? pick("up", "sourcesUp") : undefined;
      const down = withSources < CHAT_SLICE_LIMITS.withSources ? pick("down", "sourcesDown") : undefined;
      // Без описания — для проверки графа («что не заполнено»).
      const empty = !String(n.data?.description ?? "").trim() ? ({ empty: true } as const) : {};
      if (!up && !down) return { id: n.id, label, ...empty };
      withSources++;
      return { id: n.id, label, sources: { ...(up ? { up } : {}), ...(down ? { down } : {}) }, ...empty };
    });
  const productLabel = (id: string) => {
    const n = byId.get(id);
    return n?.type === "product" ? labelOf(n) : "";
  };
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].slice(0, CHAT_SLICE_LIMITS.ends);
  const balanceOf = (n: CustomNode) => {
    const balance = lastBalance(n, (id) => labelOf(byId.get(id)));
    return balance ? { balance } : {};
  };
  const transformations = nodes
    .filter((n) => n.type === "transformation" && onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.transformations)
    .map((n) => ({
      id: n.id,
      label: labelOf(n),
      inputs: uniq(edges.filter((e) => e.target === n.id).map((e) => productLabel(e.source))),
      outputs: uniq(edges.filter((e) => e.source === n.id).map((e) => productLabel(e.target))),
      ...balanceOf(n),
    }));
  // Вариант вниз стоит после продукта (продукт → вариант), вверх — перед ним.
  const alternatives = nodes
    .filter((n) => n.type === "transformation" && !onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.alternatives)
    .map((n) => {
      const from = uniq(edges.filter((e) => e.target === n.id).map((e) => productLabel(e.source)));
      const to = uniq(edges.filter((e) => e.source === n.id).map((e) => productLabel(e.target)));
      const description = String(n.data?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      return {
        id: n.id,
        label: labelOf(n),
        of: from.length ? from : to,
        direction: from.length ? ("down" as const) : ("up" as const),
        ...(description ? { description } : {}),
      };
    });
  const sel = selectedNodeId ? byId.get(selectedNodeId) : undefined;
  return {
    name,
    products,
    transformations,
    alternatives,
    selection: nodes
      .filter((n) => n.selected && onGraph(n) && labelOf(n) && (n.type === "product" || n.type === "transformation"))
      .slice(0, CHAT_SLICE_LIMITS.selection)
      .map((n) => ({ id: n.id, label: labelOf(n), kind: n.type === "transformation" ? ("transformation" as const) : ("product" as const) })),
    selectedLabel: sel?.type === "product" ? labelOf(sel) || null : null,
    selected: sel?.type === "product" ? productContext(sel.id, nodes, edges) : null,
    recent: recent.slice(0, 10),
  };
}
