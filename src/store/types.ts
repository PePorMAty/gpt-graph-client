import type { Edge } from "@xyflow/react";
import type { CustomEdge, CustomNode } from "../types";
import type { TechChain } from "../utils/chainToFlow";

export interface DataI {
  nodes: CustomNode[];
  edges: CustomEdge[];
}

export interface InitialGraphStateI {
  data: DataI;
  rootId: string | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasMore: boolean;
  leafNodes: string[];
  originalPrompt: string | null;
  source: "new" | "loaded" | "continued" | null;
  chainBuild: {
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
    nodeId: string | null;
    direction: import("../types").BuildDirection | null;
  };
  chainSessions: Record<string, ChainSessionData>;
}

export interface ChainSessionData {
  rawChain: TechChain | null;
  mainTrIds: string[];
  direction?: “up” | “down”;
  totalSteps: number;
  rootX: number;
  chainStatus: “idle” | “loading” | “succeeded” | “failed”;
  chainError: string | null;
  pidToNodeId: Record<string, string>;
  expandedPids: string[];
  producerByPid: Record<string, string>;
  expandedProducerByPid: Record<string, string[]>;
  queue: Array<{ pid: string }>;
}

export interface GraphApiResponse {
  success: boolean;
  nodes: CustomNode[];
  edges: CustomEdge[];
  has_more?: boolean;
  leaf_nodes?: string[];
  message?: string;
}

export interface CreateGraphResult {
  data: GraphApiResponse;
  message: string;
}
export interface CreateGraphArgs {
  promptValue: string;
  promptLayout: string;
}

export interface SavedGraphMeta {
  id: string;
  name: string;
  createdAt: string;
  leafCount: number;
}

export interface SaveGraphPayload {
  name?: string;
  prompt: string;
  nodes: CustomNode[];
  edges: Edge[];
  leaf_nodes: string[];
  has_more: boolean;
}

export interface SavedGraphFile {
  meta: {
    name: string;
    prompt: string;
    createdAt: string;
  };
  graph: {
    nodes: CustomNode[];
    edges: Edge[];
  };
  state: {
    leaf_nodes: string[];
    has_more: boolean;
  };
}

// ===== SOURCES (GPT /gpt/sources) =====

export type BuildDirection = "up" | "down";

export type TechnologySource = {
  title: string;
  url: string;
  access_hint: string;
  technology_description: string;
  inputs_outputs_hint: string[];
  evidence_snippets: string[];
};

export type SourcesSearchResponse = {
  success: boolean;
  product: string;
  maxItems: number;
  blocks_preview: string[];
  sources: TechnologySource[];
};
/* 
export type ProductCard = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

export type ProductCardResponse = {
  success: boolean;
  product: string;
  productCard: ProductCard;
  took_ms?: number;
};
 */
// store/types.ts (или где у тебя ProductCardResponse)

export type FillCardKind = "product" | "transformation";

// transformation card (как у тебя раньше)
export type TransformationCard = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

// product card (пример — подстрой под свою схему на сервере)
/* export type ProductCard = {
  product_name: string;
  product_type: string;
  purity: string;
  main_impurities: string;
  allowed_impurities: string;
  conversion_yield: string;
  typical_scale: string;
  storage: string;
  carbon_footprint: string;
  producers: string;
  applications: string;
  price: string;
};

export type ProductCardResponse = {
  success: boolean;
  product?: string | null;
  card_kind: FillCardKind;
  productCard: TransformationCard | ProductCard;
  took_ms?: number;
}; */
// store/types.ts

export type ProductCardProduct = {
  product_name: string;
  product_type: string;
  purity: string;
  main_impurities: string;
  allowed_impurities: string;
  conversion_yield: string;
  typical_scale: string;
  storage: string;
  carbon_footprint: string;
  producers: string;
  applications: string;
  price: string;
};

export type ProductCardTechnology = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

export type ProductCard = ProductCardProduct | ProductCardTechnology;

export type ProductCardResponse = {
  success: boolean;
  product: string | null;
  productCard: ProductCard;
  card_kind?: string;
  took_ms?: number;
};
