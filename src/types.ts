import { type Node, type Edge, type NodeProps } from "@xyflow/react";
import type { ProductCard } from "./store/types";

/* ====== DATA STRUCTURE FROM SERVER ====== */

// Структура node.data — ПО ФАКТУ (не выдуманная)
export interface CustomNodeData {
  label: string;
  description?: string;

  // ✅ карточка (не трогаем при агрегации источников)
  productCard?: ProductCard;

  // ✅ статусы для UI
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;

  [key: string]: unknown;
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

export interface GPTNode {
  id: string;
  type?: string;
  data: {
    label: string;
    name?: string;
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
