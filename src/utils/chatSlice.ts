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
import { productContext, type ProductContext } from "./productContext";

export const CHAT_SLICE_LIMITS = { products: 600, transformations: 400, alternatives: 200, ends: 20 };

export interface ChatGraphSlice {
  name: string;
  products: { id: string; label: string }[];
  transformations: { id: string; label: string; inputs: string[]; outputs: string[] }[];
  /**
   * Альтернативы шага отдельно от преобразований: у какого продукта стоят
   * и в какую сторону — вниз (что ещё делают из продукта) или вверх (как
   * ещё его получают). О них спрашивают: «покажи альтернативы». Старый
   * сервер поле не читает.
   */
  alternatives: { id: string; label: string; of: string[]; direction: "up" | "down" }[];
  /**
   * Название выбранного продукта — всегда, даже без контекста: у одинокого
   * узла без описания контекст пуст, а модель должна знать, о чём «этот
   * продукт». Старый сервер поле не читает.
   */
  selectedLabel: string | null;
  selected: ProductContext | null;
}

const labelOf = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();
/**
 * Альтернатива шага (chainVariant "alt") — вариант, который человек ещё не
 * принял, а не шаг графа: модель приняла бы «Бисфенол А» за преобразование
 * из фенола. Контекст продукта и определение кодов их тоже пропускают.
 */
const onGraph = (n: CustomNode) => n.data?.chainVariant !== "alt";

export function buildChatSlice(
  nodes: CustomNode[],
  edges: Edge[],
  { name = "", selectedNodeId = null }: { name?: string; selectedNodeId?: string | null } = {},
): ChatGraphSlice {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const products = nodes
    .filter((n) => n.type === "product" && onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.products)
    .map((n) => ({ id: n.id, label: labelOf(n) }));
  const productLabel = (id: string) => {
    const n = byId.get(id);
    return n?.type === "product" ? labelOf(n) : "";
  };
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].slice(0, CHAT_SLICE_LIMITS.ends);
  const transformations = nodes
    .filter((n) => n.type === "transformation" && onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.transformations)
    .map((n) => ({
      id: n.id,
      label: labelOf(n),
      inputs: uniq(edges.filter((e) => e.target === n.id).map((e) => productLabel(e.source))),
      outputs: uniq(edges.filter((e) => e.source === n.id).map((e) => productLabel(e.target))),
    }));
  // Вариант вниз стоит после продукта (продукт → вариант), вверх — перед ним.
  const alternatives = nodes
    .filter((n) => n.type === "transformation" && !onGraph(n) && labelOf(n))
    .slice(0, CHAT_SLICE_LIMITS.alternatives)
    .map((n) => {
      const from = uniq(edges.filter((e) => e.target === n.id).map((e) => productLabel(e.source)));
      const to = uniq(edges.filter((e) => e.source === n.id).map((e) => productLabel(e.target)));
      return { id: n.id, label: labelOf(n), of: from.length ? from : to, direction: from.length ? ("down" as const) : ("up" as const) };
    });
  const sel = selectedNodeId ? byId.get(selectedNodeId) : undefined;
  return {
    name,
    products,
    transformations,
    alternatives,
    selectedLabel: sel?.type === "product" ? labelOf(sel) || null : null,
    selected: sel?.type === "product" ? productContext(sel.id, nodes, edges) : null,
  };
}
