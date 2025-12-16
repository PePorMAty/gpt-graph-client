import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const LEVEL_GAP = 160;
const NODE_GAP = 80;

export async function layoutTree(
  nodes: CustomNode[],
  edges: Edge[],
  rootId?: string
) {
  if (!nodes.length) {
    return { nodes, edges };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  edges.forEach((e) => {
    if (!childrenMap.has(e.source)) {
      childrenMap.set(e.source, []);
    }
    childrenMap.get(e.source)!.push(e.target);
    parentMap.set(e.target, e.source);
  });

  const root =
    rootId ?? nodes.find((n) => !parentMap.has(n.id))?.id ?? nodes[0].id;

  const levels: string[][] = [];
  const queue: { id: string; level: number }[] = [{ id: root, level: 0 }];

  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (!levels[level]) levels[level] = [];
    levels[level].push(id);

    (childrenMap.get(id) || []).forEach((childId) =>
      queue.push({ id: childId, level: level + 1 })
    );
  }

  const positions = new Map<string, { x: number; y: number }>();

  levels.forEach((levelNodes, levelIndex) => {
    const totalWidth =
      levelNodes.length * NODE_WIDTH + (levelNodes.length - 1) * NODE_GAP;

    let x = -totalWidth / 2 + NODE_WIDTH / 2;

    const y = levelIndex * (NODE_HEIGHT + LEVEL_GAP);

    levelNodes.forEach((id) => {
      positions.set(id, { x, y });
      x += NODE_WIDTH + NODE_GAP;
    });
  });

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
