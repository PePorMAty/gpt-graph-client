import dagre from "dagre";
import { Position } from "@xyflow/react";
import type { CustomEdge, CustomNode } from "../types";

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const nodeWidth = 300;
const nodeHeight = 140;

export function getLayoutedElements(
  nodes: CustomNode[],
  edges: CustomEdge[],
  direction: "TB" | "LR" = "TB"
) {
  const isHorizontal = direction === "LR";

  const filteredEdges = edges.filter((edge) => {
    return !edges.some(
      (inv) => inv.source === edge.target && inv.target === edge.source
    );
  });

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 150,
    edgesep: 60,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  filteredEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: CustomNode[] = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      draggable: true,
    };
  });

  const layoutedEdges: CustomEdge[] = edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
