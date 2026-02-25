import type { Edge } from "@xyflow/react";
import type { CustomEdge, CustomNode } from "../types";

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
  };
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
