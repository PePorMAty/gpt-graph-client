import type { CustomEdge, CustomNode } from "../types";

export interface DataI {
  nodes: CustomNode[];
  edges: CustomEdge[];
}

export interface InitialGraphStateI {
  data: DataI;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasMore: boolean;
  leafNodes: string[];
  originalPrompt: string | null;
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
