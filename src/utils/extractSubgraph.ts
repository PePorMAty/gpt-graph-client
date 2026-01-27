import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export function extractSubgraph(
  nodes: CustomNode[],
  edges: Edge[],
  centerId: string,
  depthUp = 0,
  depthDown = 0,
) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const allowed = new Set<string>([centerId]);
  const visited = new Set<string>([centerId]);

  const walkDown = (productId: string, productLevel: number) => {
    if (productLevel >= depthDown) return;

    edges
      .filter((e) => e.source === productId)
      .forEach((e) => {
        const transformationId = e.target;
        const transformation = nodeMap.get(transformationId);
        if (!transformation || transformation.type !== "transformation") return;

        allowed.add(transformationId);

        edges
          .filter((te) => te.source === transformationId)
          .forEach((te) => {
            const nextProduct = nodeMap.get(te.target);
            if (!nextProduct || nextProduct.type !== "product") return;

            const visitKey = `${nextProduct.id}:${productLevel + 1}`;

            // ❗ теперь проверяем с учётом уровня
            if (visited.has(visitKey)) return;

            visited.add(visitKey);
            allowed.add(nextProduct.id);

            walkDown(nextProduct.id, productLevel + 1);
          });
      });
  };

  const walkUp = (productId: string, productLevel: number) => {
    if (productLevel >= depthUp) return;

    edges
      .filter((e) => e.target === productId)
      .forEach((e) => {
        const transformationId = e.source;
        const transformation = nodeMap.get(transformationId);
        if (!transformation || transformation.type !== "transformation") return;

        allowed.add(transformationId);

        edges
          .filter((te) => te.target === transformationId)
          .forEach((te) => {
            const prevProduct = nodeMap.get(te.source);
            if (!prevProduct || prevProduct.type !== "product") return;

            const visitKey = `${prevProduct.id}:${productLevel + 1}`;

            if (visited.has(visitKey)) return;

            visited.add(visitKey);
            allowed.add(prevProduct.id);

            walkUp(prevProduct.id, productLevel + 1);
          });
      });
  };

  walkDown(centerId, 0);
  walkUp(centerId, 0);

  return {
    nodes: nodes.filter((n) => allowed.has(n.id)),
    edges: edges.filter((e) => allowed.has(e.source) && allowed.has(e.target)),
    rootId: centerId,
  };
}
