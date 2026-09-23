import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export type DirectProductNeighbor = {
  neighborNodeId: string;
  neighborLabel: string;
  /** Рёбра, которые заменит найденное преобразование: одно у прямой связи,
   *  два у связи через заглушку. */
  edgeIds: string[];
  /** Узел-заглушка между продуктами, если связь идёт через него. */
  viaStubId?: string;
  role: "incoming" | "outgoing";
};

/**
 * Узел-заглушка — преобразование, заведённое связыванием продуктов, а не
 * найденное.
 *
 * Технологии в нём нет, есть только название («Преобразование к новому
 * продукту (X)»), поэтому для поиска преобразования такая пара продуктов
 * считается ещё не связанной технологией. Узнаём по префиксу id, а не по
 * пустому описанию: преобразование, заведённое человеком вручную, тоже
 * поначалу без описания, но подменять его найденным никто не просил.
 */
export const STUB_TRANSFORMATION_PREFIX = "tr-stub::";

const isStub = (node: CustomNode | undefined) =>
  !!node && node.type === "transformation" && node.id.startsWith(STUB_TRANSFORMATION_PREFIX);

/**
 * Связаны ли уже эти два узла — напрямую или через один промежуточный.
 *
 * Нужна обеим сторонам связывания в режиме «только продукты»: редьюсеру —
 * чтобы не заводить вторую заглушку рядом с настоящей технологией, и
 * полотну — чтобы не рассказывать про созданную заглушку там, где её не
 * создали. Разошедшись, эти двое как раз и соврали бы: уведомление
 * появлялось на связи, которую граф отверг.
 *
 * Направление не различаем: на полотне «только продукты» путь через
 * преобразование выглядит такой же одной стрелкой, в какую сторону его ни
 * веди, и вторая стрелка поверх неё — мусор.
 */
export function areNodesLinked(edges: Edge[], a: string, b: string): boolean {
  const direct = edges.some(
    (e) =>
      (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
  if (direct) return true;

  const outs = (id: string) =>
    edges.filter((e) => e.source === id).map((e) => e.target);
  return (
    outs(a).some((mid) => outs(mid).includes(b)) ||
    outs(b).some((mid) => outs(mid).includes(a))
  );
}

export function getDirectProductNeighbors(
  nodeId: string,
  nodes: CustomNode[],
  edges: Edge[],
): DirectProductNeighbor[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== "product") return [];

  const result: DirectProductNeighbor[] = [];
  const seenNeighbors = new Set<string>();

  for (const e of edges) {
    if (e.source === e.target) continue;

    let otherId: string | null = null;
    let role: "incoming" | "outgoing" | null = null;

    if (e.source === nodeId) {
      otherId = e.target;
      role = "outgoing";
    } else if (e.target === nodeId) {
      otherId = e.source;
      role = "incoming";
    }

    if (!otherId || !role) continue;
    if (seenNeighbors.has(otherId)) continue;

    const other = nodes.find((n) => n.id === otherId);
    if (!other) continue;

    if (other.type === "product") {
      seenNeighbors.add(otherId);
      result.push({
        neighborNodeId: otherId,
        neighborLabel: String(other.data?.label ?? ""),
        edgeIds: [e.id],
        role,
      });
      continue;
    }

    // Связь через заглушку — это связь без технологии: заглушку завели
    // связыванием продуктов, и заполнить её нечем, кроме как этим самым
    // поиском преобразования. Без этой ветки заглушка оставалась тупиком:
    // кнопка «Получить преобразование» у такой пары не показывалась.
    if (!isStub(other)) continue;

    const beyond = edges.filter((x) =>
      role === "outgoing" ? x.source === otherId : x.target === otherId,
    );
    for (const far of beyond) {
      const farId = role === "outgoing" ? far.target : far.source;
      if (farId === nodeId || seenNeighbors.has(farId)) continue;
      const farNode = nodes.find((n) => n.id === farId);
      if (!farNode || farNode.type !== "product") continue;

      seenNeighbors.add(farId);
      result.push({
        neighborNodeId: farId,
        neighborLabel: String(farNode.data?.label ?? ""),
        edgeIds: [e.id, far.id],
        viaStubId: otherId,
        role,
      });
    }
  }

  return result;
}
