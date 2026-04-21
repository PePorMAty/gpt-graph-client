import { type Node, type Edge, type NodeProps } from "@xyflow/react";
import type {
  BuildDirection,
  ProductCard,
  TechnologySource,
} from "./store/types";

/* ====== DATA STRUCTURE FROM SERVER ====== */

// Структура node.data
export interface CustomNodeData {
  label: string;
  description?: string;

  // --- product card ---
  productCard?: ProductCard;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCardKind?: string;

  // --- chain ---
  chainPid?: string;
  chainRootNodeId?: string;
  chainBuiltRoot?: boolean;
  chainVariant?: "main" | "alt";
  chainTrId?: string;
  chainLevelOfPid?: string;

  // --- sources (legacy single-direction, kept for migration) ---
  sources?: TechnologySource[];
  sourcesAggregated?: boolean;
  sources_meta?: { product: string; maxItems: number; fetchedAt: string };

  // --- per-direction sources ---
  sourcesDown?: TechnologySource[];
  sourcesUp?: TechnologySource[];
  sourcesAggregatedDown?: boolean;
  sourcesAggregatedUp?: boolean;
  downDescription?: string;
  upDescription?: string;

  // --- direction (legacy, kept for migration) ---
  buildDirection?: BuildDirection;

  // --- chain direction (which direction this node's chain uses) ---
  chainDirection?: BuildDirection;

  // --- step-by-step chain ---
  stepChainSessionKey?: string;
  stepChainStepNumber?: number;

  // required by @xyflow/react Node<T extends Record<string, unknown>>
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
