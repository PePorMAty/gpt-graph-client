import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
} from "@xyflow/react";

import { normalizeEdges } from "../../utils/normalize-edges";
import { normalizeNodes } from "../../utils/normalize-nodes";
import { continueGraph, getGraphData } from "../api/graph-api";

import type { CustomEdge, CustomNode, CustomNodeData } from "../../types";
import type { InitialGraphStateI } from "../types";
import { layoutSubtree } from "../../utils/layoutSubtree";
import type { ParseResult } from "../../utils/parseProductGraphJson";
import {
  assignColorsForPresentations,
  colorForNode,
} from "../../utils/sourceColorRegistry";
import { mergeProductGraph } from "../../utils/mergeProductGraph";

const initialState: InitialGraphStateI = {
  data: {
    nodes: [],
    edges: [],
  },
  rootId: null,
  isLoading: false,
  isError: false,
  error: null,
  hasMore: false,
  leafNodes: [],
  originalPrompt: null,
  sourceRegistry: {},
  layoutVersion: 0,
};

function buildNodeFromParsed(
  parsedId: string,
  parsedType: "product" | "transformation",
  label: string,
  sources: string[],
  registry: Record<string, string>
): CustomNode {
  return {
    id: parsedId,
    type: parsedType,
    position: { x: 0, y: 0 },
    data: {
      label,
      sources,
      color:
        parsedType === "product" ? colorForNode(sources, registry) : undefined,
    },
    draggable: true,
  };
}

const gptSlice = createSlice({
  name: "graph",
  initialState,
  reducers: {
    updateNodeData: (
      state,
      action: PayloadAction<{ nodeId: string; data: Partial<CustomNodeData> }>
    ) => {
      const { nodeId, data } = action.payload;
      const node = state.data.nodes.find((node) => node.id === nodeId);
      if (node) {
        node.data = { ...node.data, ...data };
      }
    },
    removeNode: (state, action: PayloadAction<string>) => {
      const nodeId = action.payload;
      state.data.nodes = state.data.nodes.filter((node) => node.id !== nodeId);
      state.data.edges = state.data.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      );
    },
    onNodesChange: (state, action: PayloadAction<NodeChange[]>) => {
      state.data.nodes = applyNodeChanges(
        action.payload,
        state.data.nodes
      ) as CustomNode[];
    },
    onEdgesChange: (state, action: PayloadAction<EdgeChange[]>) => {
      state.data.edges = applyEdgeChanges(action.payload, state.data.edges);
    },
    onConnect: (state, action: PayloadAction<Connection>) => {
      state.data.edges = normalizeEdges(
        addEdge({ ...action.payload, type: "straight" }, state.data.edges)
      );
    },
    onReconnect: (
      state,
      action: PayloadAction<{ oldEdge: Edge; newConnection: Connection }>
    ) => {
      const { oldEdge, newConnection } = action.payload;

      let updatedEdges = reconnectEdge(
        oldEdge,
        newConnection,
        state.data.edges
      );

      // Добавляем smoothstep всем новым рёбрам
      updatedEdges = updatedEdges.map((e) => ({
        ...e,
        type: "straight",
      }));

      state.data.edges = normalizeEdges(updatedEdges);
    },
    removeEdge: (state, action: PayloadAction<string>) => {
      state.data.edges = state.data.edges.filter(
        (edge) => edge.id !== action.payload
      );
    },
    // Экшен для обновления всего графа (например, после применения layout)
    setGraphData: (
      state,
      action: PayloadAction<{ nodes: CustomNode[]; edges: Edge[] }>
    ) => {
      state.data = action.payload;
    },
    addNode: (
      state,
      action: PayloadAction<{
        type: "product" | "transformation";
        label?: string;
        position: { x: number; y: number }; // ← добавили позицию (обязательна)
      }>
    ) => {
      const id = crypto.randomUUID();
      const { type, position, label } = action.payload;

      const newNode: CustomNode = {
        id,
        type,
        position: position, // ← используем переданную позицию
        data: {
          label:
            label ||
            (type === "product" ? "Новый продукт" : "Новое преобразование"),
          description: "",
        },
      };

      state.data.nodes.push(newNode);
    },
    replaceGraphFromJson: (state, action: PayloadAction<ParseResult>) => {
      const parsed = action.payload;
      const nextVersion = state.layoutVersion + 1;
      const namespace = `u${nextVersion}__`;

      const registry = assignColorsForPresentations({}, parsed.presentations);

      const nodes: CustomNode[] = parsed.nodes.map((n) =>
        buildNodeFromParsed(
          namespace + n.id,
          n.type,
          n.label,
          n.sources,
          registry
        )
      );

      const rawEdges: CustomEdge[] = parsed.edges.map((e) => ({
        id: namespace + e.id,
        source: namespace + e.source,
        target: namespace + e.target,
        type: "straight",
      }));

      state.data = {
        nodes,
        edges: normalizeEdges(rawEdges),
      };
      state.sourceRegistry = registry;
      state.rootId = nodes[0]?.id ?? null;
      state.layoutVersion = nextVersion;
      state.leafNodes = [];
      state.originalPrompt = parsed.presentationTitle;
      state.hasMore = false;
      state.isError = false;
      state.error = null;
    },
    mergeGraphFromJson: (state, action: PayloadAction<ParseResult>) => {
      const parsed = action.payload;
      const nextVersion = state.layoutVersion + 1;
      const namespace = `u${nextVersion}__`;

      const registry = assignColorsForPresentations(
        state.sourceRegistry,
        parsed.presentations
      );

      const namespacedParsed: ParseResult = {
        ...parsed,
        nodes: parsed.nodes.map((n) => ({ ...n, id: namespace + n.id })),
        edges: parsed.edges.map((e) => ({
          ...e,
          id: namespace + e.id,
          source: namespace + e.source,
          target: namespace + e.target,
        })),
      };

      const merged = mergeProductGraph({
        existingNodes: state.data.nodes,
        existingEdges: state.data.edges,
        parsed: namespacedParsed,
        registry,
      });

      // Пересчитать цвет всех product-узлов — у уже существующих могло
      // появиться >1 источника, цвет должен стать общим.
      const recolored: CustomNode[] = merged.nodes.map((n) => {
        if (n.type !== "product") return n;
        const sources = Array.isArray(n.data.sources)
          ? (n.data.sources as string[])
          : [];
        return {
          ...n,
          data: { ...n.data, color: colorForNode(sources, registry) },
        };
      });

      state.data = {
        nodes: recolored,
        edges: normalizeEdges(merged.edges),
      };
      state.sourceRegistry = registry;
      state.layoutVersion = nextVersion;
      if (!state.rootId && recolored.length > 0) {
        state.rootId = recolored[0].id;
      }
      state.isError = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getGraphData.pending, (state) => {
        state.isLoading = true;
        state.isError = false;
        state.error = null;
      })
      .addCase(getGraphData.fulfilled, (state, action) => {
        if (!action.payload) {
          state.isLoading = false;
          state.isError = true;
          state.error = "Пустой ответ от сервера";
          return;
        }

        const { data } = action.payload;

        if (!data || !data.nodes) {
          state.isLoading = false;
          state.isError = true;
          state.error = "Некорректные данные от сервера";
          return;
        }

        state.data = {
          nodes: normalizeNodes(data.nodes),
          edges: normalizeEdges(data.edges) || [],
        };

        if (!state.rootId && action.payload.data.nodes.length > 0) {
          state.rootId = action.payload.data.nodes[0].id;
        }

        state.isLoading = false;
        state.hasMore = data.has_more || false;
        state.leafNodes = data.leaf_nodes || [];
        state.originalPrompt = action.meta.arg.promptValue;
      })
      .addCase(getGraphData.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.error = (action.payload as string) || "Неизвестная ошибка";
      });
    builder
      .addCase(continueGraph.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(continueGraph.fulfilled, (state, action) => {
        const { nodes, edges, leaf_nodes } = action.payload;

        const newNodes = normalizeNodes(nodes);
        const newEdges = normalizeEdges(edges);

        const allNodes = [...state.data.nodes, ...newNodes];
        const allEdges = [...state.data.edges, ...newEdges];

        leaf_nodes.forEach((leafId) => {
          const leafNode = state.data.nodes.find((n) => n.id === leafId);
          if (!leafNode) return;

          const subtreeNodes = newNodes.filter((n) =>
            allEdges.some((e) => e.source === leafId && e.target === n.id)
          );

          const layouted = layoutSubtree(
            subtreeNodes,
            allEdges,
            leafId,
            leafNode.position
          );

          layouted.forEach((ln) => {
            const idx = allNodes.findIndex((n) => n.id === ln.id);
            if (idx !== -1) allNodes[idx] = ln;
          });
        });

        state.data.nodes = allNodes;
        state.data.edges = allEdges;
        state.leafNodes = leaf_nodes;
        state.isLoading = false;
      })
      .addCase(continueGraph.rejected, (state) => {
        state.isLoading = false;
        state.isError = true;
      });
  },
});

export const {
  updateNodeData,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
  removeEdge,
  removeNode,
  setGraphData,
  addNode,
  replaceGraphFromJson,
  mergeGraphFromJson,
} = gptSlice.actions;
export default gptSlice.reducer;
