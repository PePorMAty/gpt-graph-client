// utils/connect-graph-components.ts
import type { CustomNode } from "../types";
import type { Edge } from "@xyflow/react";

export function connectGraphComponents(
  nodes: CustomNode[],
  edges: Edge[]
): Edge[] {
  if (nodes.length === 0) return edges;

  // Строим граф для поиска компонент связности
  const adjacencyList: Record<string, string[]> = {};
  const reverseList: Record<string, string[]> = {};

  nodes.forEach((node) => {
    adjacencyList[node.id] = [];
    reverseList[node.id] = [];
  });

  edges.forEach((edge) => {
    adjacencyList[edge.source].push(edge.target);
    reverseList[edge.target].push(edge.source);
  });

  // Поиск компонент связности в ориентированном графе (сильная связность)
  const visited = new Set<string>();
  const components: Set<string>[] = [];

  // Первый проход (прямой порядок)
  const order: string[] = [];

  function dfs1(node: string) {
    visited.add(node);
    for (const neighbor of adjacencyList[node]) {
      if (!visited.has(neighbor)) {
        dfs1(neighbor);
      }
    }
    order.push(node);
  }

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      dfs1(node.id);
    }
  });

  // Второй проход (обратный порядок)
  visited.clear();

  function dfs2(node: string, component: Set<string>) {
    visited.add(node);
    component.add(node);
    for (const neighbor of reverseList[node]) {
      if (!visited.has(neighbor)) {
        dfs2(neighbor, component);
      }
    }
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    if (!visited.has(node)) {
      const component = new Set<string>();
      dfs2(node, component);
      components.push(component);
    }
  }

  console.log(`Found ${components.length} strongly connected components`);

  // Если есть только одна компонента, возвращаем исходные ребра
  if (components.length <= 1) {
    return edges;
  }

  // Находим корневые узлы (узлы без входящих связей)
  const rootNodes = nodes.filter((node) => {
    // В исходных ребрах нет входящих связей
    return !edges.some((edge) => edge.target === node.id);
  });

  // Если есть несколько корневых узлов, пытаемся их связать
  if (rootNodes.length > 1) {
    const newEdges = [...edges];

    // Создаем искусственный корневой узел или связываем корни между собой
    for (let i = 1; i < rootNodes.length; i++) {
      // Связываем предыдущий корень с текущим
      newEdges.push({
        id: `connect_${rootNodes[i - 1].id}_to_${rootNodes[i].id}`,
        source: rootNodes[i - 1].id,
        target: rootNodes[i].id,
        type: "smoothstep",
      });
    }

    console.log(
      `Added ${rootNodes.length - 1} connecting edges between root nodes`
    );
    return newEdges;
  }

  return edges;
}
