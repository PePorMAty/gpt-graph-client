// utils/continue-layout.ts
import type { CustomNode } from "../types";
import type { Edge } from "@xyflow/react";
import { getLayoutedElements } from "./get-layouted-elements";
import { connectGraphComponents } from "./connect-graph-components";

export const getContinueLayoutedElements = (
  existingNodes: CustomNode[],
  newNodes: CustomNode[],
  existingEdges: Edge[],
  newEdges: Edge[]
): { nodes: CustomNode[]; edges: Edge[] } => {
  // Объединяем все узлы и ребра
  const allNodes = [...existingNodes, ...newNodes];
  const allEdges = [...existingEdges, ...newEdges];

  // Удаляем дубликаты узлов по id
  const uniqueNodes = allNodes.reduce((acc, node) => {
    if (!acc.find((n) => n.id === node.id)) {
      acc.push(node);
    }
    return acc;
  }, [] as CustomNode[]);

  // Удаляем дубликаты ребер по id
  const uniqueEdges = allEdges.reduce((acc, edge) => {
    if (!acc.find((e) => e.id === edge.id)) {
      acc.push(edge);
    }
    return acc;
  }, [] as Edge[]);

  // Пытаемся связать несвязанные компоненты графа
  const connectedEdges = connectGraphComponents(uniqueNodes, uniqueEdges);

  // Применяем dagre ко всему графу
  return getLayoutedElements(uniqueNodes, connectedEdges);
};
