// Кусок цепочки из графа библиотеки — на открытый граф (чат с ИИ, «возьми
// из библиотеки», PG-MIGRATION.md 4.9).
//
// От продукта графа библиотеки — шаги вверх (как его получают) или вниз
// (что из него делают) на depth уровней. Продукты, которые на открытом графе
// уже есть (то же название), не дублируются — к ним просто подводятся
// связи; преобразование, которое уже стоит с тем же названием и теми же
// продуктами, второй раз не встаёт. Новое встаёт так же, как лежало в
// библиотеке, — относительно продукта-якоря.
//
// Без запросов к модели: граф в библиотеке уже построен.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { normalizeProductName } from "./normalizeProductName";

export interface ImportResult {
  nodes: CustomNode[];
  edges: Edge[];
  /** Новые узлы (id на открытом графе). */
  addedIds: string[];
  transformations: string[];
  newProducts: string[];
  /** Продукты, которые уже были на графе, — к ним подвели связи. */
  reusedProducts: string[];
}

const labelOf = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();
const isAlt = (n: CustomNode | undefined) => n?.data?.chainVariant === "alt";

/**
 * @param graph   открытый граф
 * @param library граф библиотеки
 * @param anchorId      продукт открытого графа, к которому вставляем
 * @param libraryNodeId тот же продукт в графе библиотеки
 */
export function importChain(
  graph: { nodes: CustomNode[]; edges: Edge[] },
  library: { nodes: CustomNode[]; edges: Edge[] },
  { anchorId, libraryNodeId, direction, depth, newId }: {
    anchorId: string;
    libraryNodeId: string;
    direction: "up" | "down";
    depth: number;
    newId: () => string;
  },
): ImportResult | null {
  const anchor = graph.nodes.find((n) => n.id === anchorId);
  const libById = new Map(library.nodes.map((n) => [n.id, n]));
  const libAnchor = libById.get(libraryNodeId);
  if (!anchor || !libAnchor) return null;

  // Что взять: от якоря по шагам в нужную сторону.
  const take = new Set<string>([libraryNodeId]);
  let frontier = [libraryNodeId];
  for (let level = 0; level < depth && frontier.length; level++) {
    const next: string[] = [];
    for (const p of frontier) {
      const steps =
        direction === "up"
          ? library.edges.filter((e) => e.target === p).map((e) => e.source)
          : library.edges.filter((e) => e.source === p).map((e) => e.target);
      for (const t of steps) {
        const tn = libById.get(t);
        if (tn?.type !== "transformation" || isAlt(tn) || take.has(t)) continue;
        take.add(t);
        // Всё сырьё и все продукты шага: шаг без второго сырья — неправда.
        for (const e of library.edges) {
          const other = e.source === t ? e.target : e.target === t ? e.source : null;
          if (!other || take.has(other) || libById.get(other)?.type !== "product") continue;
          take.add(other);
          const isNext = direction === "up" ? e.target === t : e.source === t;
          if (isNext) next.push(other);
        }
      }
    }
    frontier = next;
  }

  // Продукты — к тем, что уже есть на графе (по названию).
  const existing = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.type === "product" && !isAlt(n)) existing.set(normalizeProductName(labelOf(n)), n.id);
  }
  const idFor = new Map<string, string>([[libraryNodeId, anchorId]]);
  const reused: string[] = [];
  for (const id of take) {
    const n = libById.get(id);
    if (!n || n.type !== "product" || idFor.has(id)) continue;
    const have = existing.get(normalizeProductName(labelOf(n)));
    if (have) {
      idFor.set(id, have);
      reused.push(labelOf(n));
    }
  }

  // Преобразование, которое уже стоит (то же название и те же продукты), —
  // не дублируем.
  const ends = (edges: Edge[], t: string, map: (id: string) => string | undefined) =>
    edges
      .filter((e) => e.source === t || e.target === t)
      .map((e) => map(e.source === t ? e.target : e.source))
      .filter(Boolean)
      .sort()
      .join("|");
  const sig = new Set(
    graph.nodes
      .filter((n) => n.type === "transformation")
      .map((n) => `${labelOf(n).toLowerCase()}#${ends(graph.edges, n.id, (x) => x)}`),
  );

  const dx = anchor.position.x - libAnchor.position.x;
  const dy = anchor.position.y - libAnchor.position.y;
  const added: CustomNode[] = [];
  const transformations: string[] = [];
  const newProducts: string[] = [];
  // Сначала продукты: у преобразования подпись — по id продуктов открытого графа.
  for (const id of take) {
    const n = libById.get(id);
    if (!n || n.type !== "product" || idFor.has(id)) continue;
    const nid = newId();
    idFor.set(id, nid);
    added.push(copyNode(n, nid, dx, dy));
    newProducts.push(labelOf(n));
  }
  for (const id of take) {
    const n = libById.get(id);
    if (!n || n.type !== "transformation") continue;
    const s = `${labelOf(n).toLowerCase()}#${ends(library.edges.filter((e) => take.has(e.source) && take.has(e.target)), id, (x) => idFor.get(x))}`;
    if (sig.has(s)) continue;
    const nid = newId();
    idFor.set(id, nid);
    added.push(copyNode(n, nid, dx, dy));
    transformations.push(labelOf(n));
  }

  const have = new Set(graph.edges.map((e) => `${e.source}>${e.target}`));
  const newEdges: Edge[] = [];
  for (const e of library.edges) {
    if (!take.has(e.source) || !take.has(e.target)) continue;
    const source = idFor.get(e.source);
    const target = idFor.get(e.target);
    if (!source || !target) continue;
    // Связь — только у нового преобразования: к прежнему ничего не добавляем.
    const t = libById.get(e.source)?.type === "transformation" ? e.source : e.target;
    if (!added.some((n) => n.id === idFor.get(t))) continue;
    if (have.has(`${source}>${target}`)) continue;
    have.add(`${source}>${target}`);
    newEdges.push({ ...e, id: newId(), source, target, selected: false });
  }

  return {
    nodes: [...graph.nodes, ...added],
    edges: [...graph.edges, ...newEdges],
    addedIds: added.map((n) => n.id),
    transformations,
    newProducts,
    reusedProducts: reused,
  };
}

/**
 * Узел библиотеки — новым узлом открытого графа: данные те же (описание,
 * источники), кроме расчётов баланса — их обозначения указывают на узлы
 * графа библиотеки; на месте их можно посчитать заново.
 */
function copyNode(n: CustomNode, id: string, dx: number, dy: number): CustomNode {
  const data = { ...(n.data ?? {}) } as CustomNode["data"] & Record<string, unknown>;
  delete data.materialBalances;
  return {
    ...n,
    id,
    position: { x: n.position.x + dx, y: n.position.y + dy },
    selected: false,
    data,
  } as CustomNode;
}
