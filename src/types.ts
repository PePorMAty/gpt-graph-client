import { type Node, type Edge, type NodeProps } from "@xyflow/react";

/* ====== DATA STRUCTURE FROM SERVER ====== */

// Структура node.data — ПО ФАКТУ (не выдуманная)
export interface CustomNodeData {
  label: string;
  description?: string;
  [key: string]: unknown; // если GPT добавит что-то — не сломается
}

// Основной тип узла react-flow
// type определяется как (product | transformation)
export type CustomNode = Node<CustomNodeData>;

// Edge от сервера
export interface CustomEdge extends Edge {
  type?: string;
}

/* ====== NODE PROPS FOR CUSTOM COMPONENTS ====== */
export type ProductNodeProps = NodeProps<CustomNode>;
export type TransformationNodeProps = NodeProps<CustomNode>;

/* ====== SERVER API TYPES ====== */

export interface GraphApiResponse {
  success: boolean;
  nodes: CustomNode[];
  edges: CustomEdge[];
  has_more?: boolean;
  leaf_nodes?: string[];
  message?: string;
}

export interface GPTNode {
  id: string;
  type?: string;
  data: {
    label: string;
  };
  position?: { x: number; y: number };
}

export interface GPTEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface GPTGraphResponse {
  success: boolean;
  nodes: GPTNode[];
  edges: GPTEdge[];
  leaf_nodes: string[];
  has_more: boolean;
}
