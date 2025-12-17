import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const LEVEL_GAP = 160;
const NODE_GAP = 80;
const TREE_GAP = 240; // расстояние между независимыми деревьями

export type LayoutTreeResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

export async function layoutTree(
  nodes: CustomNode[],
  edges: Edge[]
): Promise<LayoutTreeResult> {
  if (!nodes.length) {
    return { nodes, edges };
  }

  /** source -> children[] */
  const childrenMap = new Map<string, string[]>();
  /** target -> parent */
  const parentMap = new Map<string, string>();

  edges.forEach((e) => {
    if (!childrenMap.has(e.source)) {
      childrenMap.set(e.source, []);
    }
    childrenMap.get(e.source)!.push(e.target);
    parentMap.set(e.target, e.source);
  });

  /** 1️⃣ Все корни (forest) */
  const roots = nodes.filter((n) => !parentMap.has(n.id)).map((n) => n.id);

  const positions = new Map<string, { x: number; y: number }>();

  let currentTreeOffsetX = 0;

  /** 2️⃣ Строим layout для каждого дерева отдельно */
  roots.forEach((rootId) => {
    const levels: string[][] = [];
    const queue: { id: string; level: number }[] = [{ id: rootId, level: 0 }];

    while (queue.length) {
      const { id, level } = queue.shift()!;

      if (!levels[level]) levels[level] = [];
      levels[level].push(id);

      (childrenMap.get(id) || []).forEach((childId) => {
        queue.push({ id: childId, level: level + 1 });
      });
    }

    /** ширина самого широкого уровня */
    const treeWidth = Math.max(
      ...levels.map(
        (level) => level.length * NODE_WIDTH + (level.length - 1) * NODE_GAP
      )
    );

    /** 3️⃣ Расставляем ноды по уровням */
    levels.forEach((levelNodes, levelIndex) => {
      const levelWidth =
        levelNodes.length * NODE_WIDTH + (levelNodes.length - 1) * NODE_GAP;

      let x =
        currentTreeOffsetX + (treeWidth - levelWidth) / 2 + NODE_WIDTH / 2;

      const y = levelIndex * (NODE_HEIGHT + LEVEL_GAP);

      levelNodes.forEach((id) => {
        positions.set(id, { x, y });
        x += NODE_WIDTH + NODE_GAP;
      });
    });

    /** 4️⃣ Сдвигаем следующий tree вправо */
    currentTreeOffsetX += treeWidth + TREE_GAP;
  });

  /** 5️⃣ Применяем позиции */
  const layoutedNodes: CustomNode[] = nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return {
    nodes: layoutedNodes,
    edges,
  };
}
