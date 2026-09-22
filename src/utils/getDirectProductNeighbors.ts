import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export type DirectProductNeighbor = {
  neighborNodeId: string;
  neighborLabel: string;
  edgeId: string;
  role: "incoming" | "outgoing";
};

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
    if (!other || other.type !== "product") continue;

    seenNeighbors.add(otherId);
    result.push({
      neighborNodeId: otherId,
      neighborLabel: String(other.data?.label ?? ""),
      edgeId: e.id,
      role,
    });
  }

  return result;
}
