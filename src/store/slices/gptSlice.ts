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
import type { InitialGraphStateI, SelectedTechPath } from "../types";

import { findRootNodeId } from "../../utils/findRootNodeId";
import { getLeafNodes } from "../../utils/getLeafNodes";
import { fetchNodeTech } from "../api/node-tech-api";
import { formatTechDescription } from "../../utils/nodeTech/formatTechDescription";
import { buildVariantGraphFromResponse } from "../../utils/nodeTech/pickVariantFromPatch";
import { applyPatchAtNode } from "../../utils/nodeTech/applyPatchAtNode";

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
  source: null,
  nodeTech: null,
};

const gptSlice = createSlice({
  name: "graph",
  initialState,
  reducers: {
    updateNodeData: (
      state,
      action: PayloadAction<{ nodeId: string; data: Partial<CustomNodeData> }>,
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
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      );
    },
    onNodesChange: (state, action: PayloadAction<NodeChange[]>) => {
      state.data.nodes = applyNodeChanges(
        action.payload,
        state.data.nodes,
      ) as CustomNode[];
    },
    onEdgesChange: (state, action: PayloadAction<EdgeChange[]>) => {
      state.data.edges = applyEdgeChanges(action.payload, state.data.edges);
    },
    onConnect: (state, action: PayloadAction<Connection>) => {
      state.data.edges = normalizeEdges(
        addEdge({ ...action.payload, type: "straight" }, state.data.edges),
      );
    },
    onReconnect: (
      state,
      action: PayloadAction<{ oldEdge: Edge; newConnection: Connection }>,
    ) => {
      const { oldEdge, newConnection } = action.payload;

      let updatedEdges = reconnectEdge(
        oldEdge,
        newConnection,
        state.data.edges,
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
        (edge) => edge.id !== action.payload,
      );
    },
    // Экшен для обновления всего графа (например, после применения layout)
    setGraphData: (
      state,
      action: PayloadAction<{ nodes: CustomNode[]; edges: Edge[] }>,
    ) => {
      state.data = action.payload;
    },
    addNode: (
      state,
      action: PayloadAction<{
        type: "product" | "transformation";
        label?: string;
        position: { x: number; y: number }; // ← добавили позицию (обязательна)
      }>,
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
      }>,
    ) => {
      state.data = {
        nodes: normalizeNodes(action.payload.nodes),
        edges: normalizeEdges(action.payload.edges),
      };

      state.leafNodes = action.payload.leafNodes;
      state.hasMore = action.payload.hasMore;
      state.originalPrompt = action.payload.originalPrompt;

      state.source = "loaded";

      // ⚠️ rootId аккуратно
      if (!state.rootId && action.payload.nodes.length > 0) {
        state.rootId = findRootNodeId(state.data.nodes, state.data.edges);
      }

      state.isError = false;
      state.error = null;
    },
    setNodeTech(
      state,
      action: PayloadAction<{ nodeId: string; response: any }>,
    ) {
      state.nodeTech = action.payload;
    },
    clearNodeTech(state) {
      state.nodeTech = null;
    },
    applyTechVariant(
      state,
      action: PayloadAction<{ variant: "main" | string }>,
    ) {
      if (!state.nodeTech) return;

      const { nodeId, response } = state.nodeTech;

      const variantGraph = buildVariantGraphFromResponse(
        response,
        action.payload.variant,
      );

      const merged = applyPatchAtNode(
        { nodes: state.data.nodes, edges: state.data.edges },
        nodeId,
        { nodes: variantGraph.nodes as any, edges: variantGraph.edges },
      );

      state.data.nodes = merged.nodes;
      state.data.edges = merged.edges;

      state.leafNodes = getLeafNodes(state.data.nodes, state.data.edges);
      state.hasMore = false;
      state.source = "new"; // чтобы сработал layout
      state.rootId = nodeId; // центруем на выбранной ноде

      state.nodeTech = null; // закрываем модалку
    },
    setNodeTechSelectedPath: (
      state,
      action: PayloadAction<{ nodeId: string; selectedPath: SelectedTechPath }>,
    ) => {
      const { nodeId, selectedPath } = action.payload;
      const node = state.data.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (!node.data.tech) return; // если tech ещё нет — нечего выбирать
      node.data.tech.selectedPath = selectedPath;
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
        state.source = "new";
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
          (n) => !existingNodeIds.has(n.id),
        );

        const existingEdgeIds = new Set(state.data.edges.map((e) => e.id));
        const filteredEdges = newEdges.filter(
          (e) => !existingEdgeIds.has(e.id),
        );

        state.data.nodes.push(...filteredNodes);
        state.data.edges.push(...filteredEdges);

        // 🔥 ВАЖНО: пересчитываем ВСЕ leaf-ноды
        state.leafNodes = getLeafNodes(state.data.nodes, state.data.edges);
        state.isLoading = false;
        state.source = "continued";
      })
      .addCase(continueGraph.rejected, (state) => {
        state.isLoading = false;
        state.isError = true;
      });
    builder
      .addCase(fetchNodeTech.pending, (state) => {
        state.isLoading = true;
        state.isError = false;
        state.error = null;
      })
      .addCase(fetchNodeTech.fulfilled, (state, action) => {
        state.isLoading = false;

        /* const { nodeId, data } = action.payload;

        // 1) сразу кладём описание в выбранную ноду
        const node = state.data.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.data = {
            ...node.data,
            description: formatTechDescription(data.blocks_preview),
            sources: data.sources.map((s) => s.url), // доп. поле
          };
          node.data.sources = Array.isArray(data.sources)
            ? data.sources.map((s) => s.url).filter(Boolean)
            : [];

          // ✅ сохраняем ВСЮ агрегированную структуру (сводный путь + альтернативы)
          node.data.tech = {
            fetchedAt: new Date().toISOString(),
            product: data.product,
            sources: data.sources,
            aggregated: data.aggregated_technology,
          };
        } */
        ///
        const { nodeId, data } = action.payload;

        const node = state.data.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        // urls источников как раньше
        node.data.sources = Array.isArray(data.sources)
          ? data.sources.map((s) => s.url).filter(Boolean)
          : [];

        const prevSelected = node.data.tech?.selectedPath;

        // дефолт — основной путь
        let selectedPath: SelectedTechPath = { kind: "summary" };

        // если ранее была выбрана альтернатива — попробуем сохранить выбор по названию
        if (prevSelected?.kind === "alternative") {
          const alts = data.aggregated_technology?.Альтернативы ?? [];
          const idx = alts.findIndex(
            (a: any) => a?.Название === prevSelected.name,
          );
          if (idx >= 0) {
            selectedPath = {
              kind: "alternative",
              index: idx,
              name: prevSelected.name,
            };
          }
        }

        node.data.tech = {
          fetchedAt: new Date().toISOString(),
          product: data.product,
          sources: data.sources,
          aggregated: data.aggregated_technology,
          selectedPath,
        };
        ///

        // 2) сохраним ответ, чтобы UI показал выбор вариантов
        state.nodeTech = { nodeId, response: data };
      })
      .addCase(fetchNodeTech.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.error = (action.payload as string) || "Ошибка node-tech";
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
  setNodeTech,
  clearNodeTech,
  applyTechVariant,
  setNodeTechSelectedPath,
} = gptSlice.actions;
export default gptSlice.reducer;
