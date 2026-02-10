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
  nodeTech: null | NodeTechType;
}

type NodeTechType = {
  nodeId: string;
  response: NodeTechResponse;
};

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

//step-graph
export interface TechSource {
  title: string;
  url: string;
  access_hint: string;
  technology_description: string;
  inputs_outputs_hint?: string[];
  evidence_snippets?: string[];
}

export interface AggregatedTechnology {
  Исходный_продукт: string;
  Входные_продукты: string[];
  Сводная_технология: { Шаги: string[] };
  Альтернативы: TechAlternative[];
  Примечания?: string[];
}

export interface TechGraphPatch {
  graph: {
    nodes: CustomNode[];
    edges: CustomEdge[];
  };
  state: {
    leaf_nodes: string[];
    has_more: boolean;
  };
}

export interface NodeTechResponse {
  success: boolean;
  product: string;
  blocks_preview: string[];
  sources: TechSource[];
  aggregated_technology: AggregatedTechnology;
  graph_patch: TechGraphPatch;
}

export interface TechSource {
  title: string;
  url: string;
  access_hint: string;
  technology_description: string;
  inputs_outputs_hint?: string[];
  evidence_snippets?: string[];
}

export interface TechVariant {
  Отличие: string;
  Детали: string[];
}

export interface TechAlternative {
  Название: string;
  Шаги: string[];
  Варианты: TechVariant[];
}

export interface AggregatedTechnology {
  Исходный_продукт: string;
  Входные_продукты: string[];
  Сводная_технология: { Шаги: string[] };
  Альтернативы: TechAlternative[];
  Примечания?: string[];
}

export interface GraphPatch {
  graph: {
    nodes: CustomNode[]; // можно ужесточить до GPTNode[]
    edges: CustomEdge[]; // можно ужесточить до GPTEdge[]
  };
  state: {
    leaf_nodes: string[];
    has_more: boolean;
  };
}

export interface NodeTechResponse {
  success: boolean;
  product: string;
  blocks_preview: string[];
  sources: TechSource[];
  aggregated_technology: AggregatedTechnology;
  graph_patch: GraphPatch;
}

export interface NodeTechStored {
  fetchedAt: string; // чтобы понимать свежесть
  product: string;
  sources: TechSource[];
  aggregated: AggregatedTechnology;
}

export interface CustomNodeData {
  label: string;
  description?: string;

  // urls (как у тебя уже было)
  sources?: string[];

  // ✅ сюда будем сохранять основной + альтернативные пути
  tech?: NodeTechStored;

  [key: string]: unknown;
}
export type SelectedTechPath =
  | { kind: "summary" }
  | { kind: "alternative"; index: number; name: string };

export interface NodeTechStored {
  fetchedAt: string;
  product: string;
  sources: TechSource[];
  aggregated: AggregatedTechnology;
  selectedPath: SelectedTechPath;
}
