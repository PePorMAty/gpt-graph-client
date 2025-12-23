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

import type { CustomNode, CustomNodeData } from "../../types";
import type { InitialGraphStateI } from "../types";

import { getLeafNodes } from "../../utils/getLeafNodes";

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
};

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
    loadGraphFromFile: (
      state,
      action: PayloadAction<{
        nodes: CustomNode[];
        edges: Edge[];
        leafNodes: string[];
        hasMore: boolean;
        originalPrompt: string | null;
      }>
    ) => {
      state.data = {
        nodes: normalizeNodes(action.payload.nodes),
        edges: normalizeEdges(action.payload.edges),
      };

      state.leafNodes = action.payload.leafNodes;
      state.hasMore = action.payload.hasMore;
      state.originalPrompt = action.payload.originalPrompt;

      // ⚠️ rootId аккуратно
      if (!state.rootId && action.payload.nodes.length > 0) {
        state.rootId = action.payload.nodes[0].id;
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
        const { nodes, edges } = action.payload;

        const newNodes = normalizeNodes(nodes);
        const newEdges = normalizeEdges(edges);

        const existingNodeIds = new Set(state.data.nodes.map((n) => n.id));
        const filteredNodes = newNodes.filter(
          (n) => !existingNodeIds.has(n.id)
        );

        const existingEdgeIds = new Set(state.data.edges.map((e) => e.id));
        const filteredEdges = newEdges.filter(
          (e) => !existingEdgeIds.has(e.id)
        );

        state.data.nodes.push(...filteredNodes);
        state.data.edges.push(...filteredEdges);

        // 🔥 ВАЖНО: пересчитываем ВСЕ leaf-ноды
        state.leafNodes = getLeafNodes(state.data.nodes, state.data.edges);

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
  loadGraphFromFile,
} = gptSlice.actions;
export default gptSlice.reducer;
