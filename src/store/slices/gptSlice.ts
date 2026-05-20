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
  Position,
} from "@xyflow/react";

import {
  normalizeEdges,
  filterConflictingEdges,
  applyHandlesByGeometry,
} from "../../utils/normalize-edges";
import { normalizeNodes } from "../../utils/normalize-nodes";
import {
  buildChainLevel1,
  continueGraph,
  expandChainOneLevel,
  getGraphData,
} from "../api/graph-api";

import type { CustomNode, CustomNodeData } from "../../types";
import type { InitialGraphStateI, StepChainApiStep } from "../types";
import {
  buildStep,
  fetchChainStep,
  fetchStepSources,
} from "../api/step-chain-api";
import { stepToFlow } from "../../utils/stepToFlow";

import { findRootNodeId } from "../../utils/findRootNodeId";
import { getLeafNodes } from "../../utils/getLeafNodes";
import { fetchProductCard } from "../api/product-card-api";
import { parseAlternatives } from "../../utils/parseAlternatives";
import { countStepsFromDescription, getMainTransformationIds } from "../../utils/rawChainLevel";
import { sourcesKey } from "./sourcesSlice";

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
  chainBuild: { status: "idle", error: null, nodeId: null, direction: null },
  chainSessions: {},
  stepChainSessions: {},
  sourcesPool: {},
  acceptedStepAlternatives: {},
  presentationColors: {},
};

export const sourcesPoolKey = (
  productName: string,
  direction: "up" | "down",
) =>
  `${productName
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim()
    .replace(/\s+/g, " ")}::${direction}`;

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

      for (const [sKey, session] of Object.entries(
        state.stepChainSessions,
      )) {
        if (!session) continue;
        if (session.currentProductNodeId === nodeId) {
          session.currentProductNodeId = session.rootNodeId;
          session.pendingStep = null;
          session.status = "idle";
          session.steps = session.steps.filter(
            (s) =>
              !s.newProductNodeIds.includes(nodeId) &&
              s.transformationNodeId !== nodeId,
          );
        }
        if (session.rootNodeId === nodeId) {
          delete state.stepChainSessions[sKey];
        }
      }
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
      const { source, target } = action.payload;
      if (!source || !target) return;
      if (source === target) return;

      const exists = state.data.edges.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source),
      );
      if (exists) return;

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
      const { nodes, edges } = action.payload;
      state.data = {
        nodes,
        edges: applyHandlesByGeometry(nodes, edges),
      };
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
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
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
        /** Реестр презентация → цвет. Если передан — сбрасывает текущий. */
        presentationColors?: Record<string, string>;
      }>,
    ) => {
      const normNodes = normalizeNodes(action.payload.nodes);
      const normEdges = normalizeEdges(action.payload.edges);
      state.data = {
        nodes: normNodes,
        edges: applyHandlesByGeometry(normNodes, normEdges),
      };

      state.leafNodes = action.payload.leafNodes;
      state.hasMore = action.payload.hasMore;
      state.originalPrompt = action.payload.originalPrompt;
      state.presentationColors = action.payload.presentationColors ?? {};

      state.source = "loaded";

      state.rootId =
        state.data.nodes.length > 0
          ? findRootNodeId(state.data.nodes, state.data.edges)
          : null;

      state.isError = false;
      state.error = null;
    },
    mergeGraphFromFile: (
      state,
      action: PayloadAction<{
        nodes: CustomNode[];
        edges: Edge[];
        presentationColors: Record<string, string>;
      }>,
    ) => {
      const normNodes = normalizeNodes(action.payload.nodes);
      const normEdges = normalizeEdges(action.payload.edges);
      state.data = {
        nodes: normNodes,
        edges: applyHandlesByGeometry(normNodes, normEdges),
      };
      state.presentationColors = action.payload.presentationColors;
      // Маркируем как новый граф, чтобы Flow re-layout-нул слитую структуру
      // (loaded-режим уважает существующие позиции, нам это не подходит).
      state.source = "new";
      state.rootId =
        state.data.nodes.length > 0
          ? findRootNodeId(state.data.nodes, state.data.edges)
          : state.rootId;
      state.isError = false;
      state.error = null;
    },
    setProducerForPid: (
      state,
      action: PayloadAction<{
        rootNodeId: string;
        pid: string;
        transformationId: string | null;
      }>,
    ) => {
      const { rootNodeId, pid, transformationId } = action.payload;
      const session = state.chainSessions[rootNodeId];
      if (!session) return;

      const built = session.expandedProducerByPid?.[pid] || [];
      if (transformationId && built.includes(transformationId)) return;

      if (!transformationId) {
        delete session.producerByPid[pid];
      } else {
        session.producerByPid[pid] = transformationId;
      }
    },
    popQueueHead: (state, action: PayloadAction<string>) => {
      const session = state.chainSessions[action.payload];
      if (!session) return;
      session.queue = session.queue.slice(1);
    },

    // ── Step-by-step chain reducers ──

    initStepChainSession: (
      state,
      action: PayloadAction<{
        sessionKey: string;
        direction: "up" | "down";
        rootNodeId: string;
        currentProductNodeId: string;
      }>,
    ) => {
      const { sessionKey, direction, rootNodeId, currentProductNodeId } =
        action.payload;
      state.stepChainSessions[sessionKey] = {
        direction,
        rootNodeId,
        currentProductNodeId,
        steps: [],
        status: "idle",
        pendingStep: null,
        error: null,
        insufficientProducts: [],
        accumulatedSources: [],
      };
    },

    acceptPendingStep: (
      state,
      action: PayloadAction<{
        sessionKey: string;
        selectedContinueProductNodeId?: string;
        filteredStep?: StepChainApiStep;
      }>,
    ) => {
      const { sessionKey, selectedContinueProductNodeId, filteredStep } =
        action.payload;
      const session = state.stepChainSessions[sessionKey];
      if (!session || !session.pendingStep) return;
      if (filteredStep) {
        session.pendingStep = filteredStep;
      }

      const anchor = state.data.nodes.find(
        (n) => n.id === session.currentProductNodeId,
      );
      if (!anchor) return;

      const stepNumber = session.steps.length + 1;

      const { nodes, edges, stepRecord } = stepToFlow(session.pendingStep, {
        sessionKey,
        rootNodeId: session.rootNodeId,
        direction: session.direction,
        anchorNodeId: session.currentProductNodeId,
        anchorX: anchor.position.x,
        anchorY: anchor.position.y,
        stepNumber,
        existingNodes: state.data.nodes,
      });

      // Add nodes (dedup by id)
      const existingNodeIds = new Set(state.data.nodes.map((n) => n.id));
      state.data.nodes.push(...nodes.filter((n) => !existingNodeIds.has(n.id)));

      // Add edges (dedup by id)
      const existingEdgeIds = new Set(state.data.edges.map((e) => e.id));
      state.data.edges.push(...edges.filter((e) => !existingEdgeIds.has(e.id)));

      session.steps.push(stepRecord);

      // Update current product node for next step
      if (selectedContinueProductNodeId) {
        session.currentProductNodeId = selectedContinueProductNodeId;
      } else {
        session.currentProductNodeId =
          stepRecord.newProductNodeIds[0] ??
          stepRecord.mergedProductNodeIds[0] ??
          session.currentProductNodeId;
      }

      // Унаследование источников от родителя в новые потомки:
      // - копируем pool родителя только в те новые product-ноды, которых НЕТ
      //   в insufficientProducts (для них модель явно сказала, что текущих
      //   источников недостаточно — нужно искать заново);
      // - не трогаем pool потомка, если у него уже есть собственный pool;
      // - переиск источников у конкретного продукта (addSourcesToPool)
      //   затирает старый pool ТОЛЬКО у этого продукта, не у братьев/детей.
      const anchorLabel =
        anchor.data?.label || (anchor as { label?: string }).label || "";
      if (anchorLabel) {
        const anchorPoolKey = sourcesPoolKey(anchorLabel, session.direction);
        const anchorPool = state.sourcesPool[anchorPoolKey];
        if (anchorPool && anchorPool.sources.length > 0) {
          const insufficient = new Set(
            (session.insufficientProducts ?? []).map((p: string) =>
              p.toLowerCase().replace(/ё/g, "е").trim(),
            ),
          );
          const allNewNodeIds = [
            ...stepRecord.newProductNodeIds,
            ...stepRecord.mergedProductNodeIds,
          ];
          for (const nid of allNewNodeIds) {
            const newNode = state.data.nodes.find((n) => n.id === nid);
            const newLabel =
              newNode?.data?.label ||
              (newNode as unknown as { label?: string })?.label ||
              "";
            if (!newLabel) continue;
            const normalized = newLabel
              .toLowerCase()
              .replace(/ё/g, "е")
              .trim();
            if (insufficient.has(normalized)) continue;
            const newKey = sourcesPoolKey(newLabel, session.direction);
            if (!state.sourcesPool[newKey]) {
              state.sourcesPool[newKey] = {
                sources: [...anchorPool.sources],
                product: newLabel,
                lastFetchedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

      // Alt-ноды у anchor НЕ трогаем: пользователь мог принять основной шаг,
      // оставив альтернативы как опции для последующего построения.
      // Удаляются alt-ноды только при accept конкретной альтернативы — это
      // делает caller отдельно (см. baseResult.onAcceptStep в Flow.tsx).

      session.pendingStep = null;
      session.status = "idle";
      session.accumulatedSources = [];
    },

    rejectPendingStep: (state, action: PayloadAction<string>) => {
      const session = state.stepChainSessions[action.payload];
      if (!session) return;
      session.pendingStep = null;
      session.status = "idle";
    },

    undoLastStep: (state, action: PayloadAction<string>) => {
      const session = state.stepChainSessions[action.payload];
      if (!session || !session.steps.length) return;

      const lastStep = session.steps.pop()!;

      // Remove nodes created by this step
      const removeNodeIds = new Set(lastStep.newProductNodeIds);
      removeNodeIds.add(lastStep.transformationNodeId);
      state.data.nodes = state.data.nodes.filter(
        (n) => !removeNodeIds.has(n.id),
      );

      // Remove edges created by this step
      const removeEdgeIds = new Set(lastStep.addedEdgeIds);
      state.data.edges = state.data.edges.filter(
        (e) => !removeEdgeIds.has(e.id),
      );

      session.currentProductNodeId = lastStep.fromProductNodeId;
      session.status = "idle";
      session.pendingStep = null;
    },

    setStepChainContinueProduct: (
      state,
      action: PayloadAction<{ sessionKey: string; productNodeId: string }>,
    ) => {
      const session =
        state.stepChainSessions[action.payload.sessionKey];
      if (!session) return;
      session.currentProductNodeId = action.payload.productNodeId;
    },

    addSourcesToPool: (
      state,
      action: PayloadAction<{
        productName: string;
        direction: "up" | "down";
        sources: import("../../store/types").TechnologySource[];
      }>,
    ) => {
      // Замена, а не merge: каждый успешный поиск источников полностью затирает
      // pool именно этого (productName, direction). Pool братьев / предков /
      // потомков не трогается — у них другие ключи.
      const { productName, direction, sources } = action.payload;
      const key = sourcesPoolKey(productName, direction);
      state.sourcesPool[key] = {
        sources: [...sources],
        product: state.sourcesPool[key]?.product || productName,
        lastFetchedAt: new Date().toISOString(),
      };
    },

    clearSourcesPool: (
      state,
      action: PayloadAction<{
        productName: string;
        direction: "up" | "down";
      }>,
    ) => {
      const key = sourcesPoolKey(
        action.payload.productName,
        action.payload.direction,
      );
      delete state.sourcesPool[key];
    },

    createStepAlternativeNodes: (
      state,
      action: PayloadAction<{
        nodeId: string;
        direction: "up" | "down";
        alternatives: { title: string; firstStepName: string; fullDescription: string }[];
      }>,
    ) => {
      const { nodeId, direction, alternatives } = action.payload;
      const prefix = `step::${nodeId}::${direction}::alt::`;
      const edgePrefix = `step::${nodeId}::${direction}::alt-edge::`;
      const acceptedKey = `${nodeId}::${direction}`;
      const acceptedSet = new Set(
        state.acceptedStepAlternatives[acceptedKey] ?? [],
      );

      // Сохраняем позиции уже существующих alt-нод (пользователь мог их перетащить).
      // При пересоздании по тому же altNodeId переиспользуем сохранённые координаты.
      const existingPositions = new Map();
      for (const n of state.data.nodes) {
        if (n.id.startsWith(prefix) && n.position) {
          existingPositions.set(n.id, { x: n.position.x, y: n.position.y });
        }
      }

      state.data.nodes = state.data.nodes.filter((n) => !n.id.startsWith(prefix));
      state.data.edges = state.data.edges.filter((e) => !e.id.startsWith(edgePrefix));

      const root = state.data.nodes.find((n) => n.id === nodeId);
      if (!root || alternatives.length === 0) return;

      const rx = root.position?.x ?? 0;
      const ry = root.position?.y ?? 0;
      const sign = direction === "down" ? 1 : -1;
      const stepY = 180;
      const stepY2 = 220;
      const spacingX = 300;

      alternatives.forEach((alt, idx) => {
        // Пропускаем альтернативы, которые пользователь уже построил —
        // они «материализовались» в реальный шаг, дублировать не нужно.
        if (acceptedSet.has(idx)) return;
        const altNodeId = `${prefix}${idx}`;
        const side =
          idx % 2 === 0
            ? -(Math.floor(idx / 2) + 1)
            : Math.floor(idx / 2) + 1;
        const defaultX = rx + side * spacingX;
        const defaultY = ry + sign * (stepY + stepY2);
        const saved = existingPositions.get(altNodeId);
        const position = saved ?? { x: defaultX, y: defaultY };

        state.data.nodes.push({
          id: altNodeId,
          type: "transformation",
          position,
          data: {
            label: alt.title,
            description: alt.fullDescription,
            chainVariant: "alt",
            chainRootNodeId: nodeId,
            stepAltDirection: direction,
          },
        });

        state.data.edges.push({
          id: `${edgePrefix}${idx}`,
          source: nodeId,
          target: altNodeId,
          sourceHandle: direction === "down" ? "bottom" : "top-source",
          targetHandle: direction === "down" ? "top" : "bottom-target",
          type: "straight",
          className: "edge--alt",
        });
      });
    },

    removeStepAlternativeNodes: (
      state,
      action: PayloadAction<{
        nodeId: string;
        direction: "up" | "down";
      }>,
    ) => {
      const { nodeId, direction } = action.payload;
      const prefix = `step::${nodeId}::${direction}::alt::`;
      const edgePrefix = `step::${nodeId}::${direction}::alt-edge::`;
      state.data.nodes = state.data.nodes.filter((n) => !n.id.startsWith(prefix));
      state.data.edges = state.data.edges.filter((e) => !e.id.startsWith(edgePrefix));
      // Полная зачистка альтернатив этого продукта → accepted-список тоже не нужен.
      delete state.acceptedStepAlternatives[`${nodeId}::${direction}`];
    },

    acceptStepAlternative: (
      state,
      action: PayloadAction<{
        rootNodeId: string;
        direction: "up" | "down";
        idx: number;
      }>,
    ) => {
      const { rootNodeId, direction, idx } = action.payload;
      const key = `${rootNodeId}::${direction}`;
      const arr = state.acceptedStepAlternatives[key] ?? [];
      if (!arr.includes(idx)) arr.push(idx);
      state.acceptedStepAlternatives[key] = arr;

      const altNodeId = `step::${rootNodeId}::${direction}::alt::${idx}`;
      const altEdgeId = `step::${rootNodeId}::${direction}::alt-edge::${idx}`;
      state.data.nodes = state.data.nodes.filter((n) => n.id !== altNodeId);
      state.data.edges = state.data.edges.filter((e) => e.id !== altEdgeId);
    },

    clearAcceptedStepAlternatives: (
      state,
      action: PayloadAction<{ nodeId: string; direction: "up" | "down" }>,
    ) => {
      const { nodeId, direction } = action.payload;
      delete state.acceptedStepAlternatives[`${nodeId}::${direction}`];
    },

    insertTransformationBetween: (
      state,
      action: PayloadAction<{
        edgeId: string;
        fromNodeId: string;
        toNodeId: string;
        transformation: { name: string; description?: string };
      }>,
    ) => {
      const { edgeId, fromNodeId, toNodeId, transformation } = action.payload;

      const fromNode = state.data.nodes.find((n) => n.id === fromNodeId);
      const toNode = state.data.nodes.find((n) => n.id === toNodeId);
      if (!fromNode || !toNode) return;

      const trId = `tr-between::${crypto.randomUUID()}`;
      const midX = (fromNode.position.x + toNode.position.x) / 2;
      const midY = (fromNode.position.y + toNode.position.y) / 2;

      state.data.edges = state.data.edges.filter((e) => e.id !== edgeId);

      state.data.nodes.push({
        id: trId,
        type: "transformation",
        position: { x: midX, y: midY },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          label: transformation.name,
          description: transformation.description ?? "",
        },
      });

      const inEdgeId = `${trId}::in::${fromNodeId}`;
      const outEdgeId = `${trId}::out::${toNodeId}`;

      const newEdges: Edge[] = [
        {
          id: inEdgeId,
          source: fromNodeId,
          target: trId,
          sourceHandle: "bottom",
          targetHandle: "top",
          type: "straight",
        },
        {
          id: outEdgeId,
          source: trId,
          target: toNodeId,
          sourceHandle: "bottom",
          targetHandle: "top",
          type: "straight",
        },
      ];

      const existingIds = new Set(state.data.edges.map((e) => e.id));
      state.data.edges.push(
        ...normalizeEdges(newEdges.filter((e) => !existingIds.has(e.id))),
      );
    },

    insertTransformationsForNeighbors: (
      state,
      action: PayloadAction<{
        groups: Array<{
          name: string;
          description?: string;
          sources?: string[];
          inputNodeIds: string[];
          outputNodeIds: string[];
          removeEdgeIds: string[];
        }>;
      }>,
    ) => {
      const { groups } = action.payload;
      if (!groups.length) return;

      const edgesToRemove = new Set<string>();
      for (const g of groups) {
        for (const eid of g.removeEdgeIds) edgesToRemove.add(eid);
      }
      if (edgesToRemove.size) {
        state.data.edges = state.data.edges.filter(
          (e) => !edgesToRemove.has(e.id),
        );
      }

      const newNodes: CustomNode[] = [];
      const newEdges: Edge[] = [];

      groups.forEach((g, groupIdx) => {
        const inputs = g.inputNodeIds
          .map((id) => state.data.nodes.find((n) => n.id === id))
          .filter((n): n is CustomNode => !!n);
        const outputs = g.outputNodeIds
          .map((id) => state.data.nodes.find((n) => n.id === id))
          .filter((n): n is CustomNode => !!n);
        if (!inputs.length || !outputs.length) return;

        const all = [...inputs, ...outputs];
        const avgX = all.reduce((s, n) => s + n.position.x, 0) / all.length;
        const avgY = all.reduce((s, n) => s + n.position.y, 0) / all.length;

        const trId = `tr-between::${crypto.randomUUID()}`;

        newNodes.push({
          id: trId,
          type: "transformation",
          position: { x: avgX, y: avgY + groupIdx * 24 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          data: {
            label: g.name,
            description: g.description ?? "",
            ...(g.sources && g.sources.length
              ? { transformationSources: g.sources }
              : {}),
          },
        });

        for (const inp of inputs) {
          newEdges.push({
            id: `${trId}::in::${inp.id}`,
            source: inp.id,
            target: trId,
            sourceHandle: "bottom",
            targetHandle: "top",
            type: "straight",
          });
        }
        for (const out of outputs) {
          newEdges.push({
            id: `${trId}::out::${out.id}`,
            source: trId,
            target: out.id,
            sourceHandle: "bottom",
            targetHandle: "top",
            type: "straight",
          });
        }
      });

      state.data.nodes.push(...newNodes);
      const existingIds = new Set(state.data.edges.map((e) => e.id));
      state.data.edges.push(
        ...normalizeEdges(newEdges.filter((e) => !existingIds.has(e.id))),
      );
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

        const normNodes = normalizeNodes(data.nodes);
        const normEdges = normalizeEdges(data.edges) || [];
        state.data = {
          nodes: normNodes,
          edges: applyHandlesByGeometry(normNodes, normEdges),
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
        state.data.edges.push(
          ...filterConflictingEdges(filteredEdges, state.data.edges),
        );

        // пересчитываем handles по геометрии для всех edges (новые ноды
        // могут изменить относительные позиции у существующих связей)
        state.data.edges = applyHandlesByGeometry(
          state.data.nodes,
          state.data.edges,
        );

        // 🔥 ВАЖНО: пересчитываем ВСЕ leaf-ноды
        state.leafNodes = getLeafNodes(state.data.nodes, state.data.edges);
        state.isLoading = false;
        state.source = "continued";
      })
      .addCase(continueGraph.rejected, (state) => {
        state.isLoading = false;
        state.isError = true;
      })
      .addCase(buildChainLevel1.pending, (state, action) => {
        state.chainBuild.status = "loading";
        state.chainBuild.error = null;
        state.chainBuild.nodeId = action.meta.arg.nodeId;
        state.chainBuild.direction = action.meta.arg.direction;
      })
      .addCase(buildChainLevel1.fulfilled, (state, action) => {
        const { nodeId, raw, techText, direction } = action.payload;
        const sKey = sourcesKey(nodeId, direction);

        const root = state.data.nodes.find((n) => n.id === nodeId);

        // помечаем выбранный узел как root новой цепочки
        if (root) {
          root.data.chainPid = "Продукт1";
          root.data.chainRootNodeId = nodeId;
          root.data.chainBuiltRoot = true;
          root.data.chainDirection = direction;
        }

        // стартуем новую chain-сессию с составным ключом
        const steps = countStepsFromDescription(techText);
        state.chainSessions[sKey] = {
          rawChain: raw.chain,
          mainTrIds: getMainTransformationIds(raw.chain, steps),
          direction,
          totalSteps: steps,
          rootX: root?.position?.x ?? 0,
          chainStatus: "idle",
          chainError: null,
          pidToNodeId: { Продукт1: nodeId },
          expandedPids: [],
          producerByPid: {},
          expandedProducerByPid: {},
          queue: [{ pid: "Продукт1" }],
        };

        // --- Альтернативы: парсим из techText и создаём ноды ---
        const altPrefix = `chain::${nodeId}::${direction}::alt::`;
        state.data.nodes = state.data.nodes.filter(
          (n) => !n.id.startsWith(altPrefix),
        );
        state.data.edges = state.data.edges.filter(
          (e) => !e.id.startsWith(`chain::${nodeId}::${direction}::alt-edge::`),
        );

        const alternatives = parseAlternatives(techText);
        if (root && alternatives.length > 0) {
          const rx = root.position?.x ?? 0;
          const ry = root.position?.y ?? 0;
          const dir = direction;
          const sign = dir === "down" ? 1 : -1;
          const stepY = 180;
          const stepY2 = 220;
          const spacingX = 300;

          alternatives.forEach((alt, idx) => {
            const altNodeId = `chain::${nodeId}::${direction}::alt::${idx}`;

            // Чередуем лево/право: 0→лево, 1→право, 2→дальше лево, ...
            const side =
              idx % 2 === 0
                ? -(Math.floor(idx / 2) + 1)
                : Math.floor(idx / 2) + 1;
            const x = rx + side * spacingX;
            const y = ry + sign * (stepY + stepY2);

            state.data.nodes.push({
              id: altNodeId,
              type: "transformation",
              position: { x, y },
              data: {
                label: alt.title,
                description: alt.fullDescription,
                chainVariant: "alt",
                chainRootNodeId: nodeId,
              },
            });

            state.data.edges.push({
              id: `chain::${nodeId}::${direction}::alt-edge::${idx}`,
              source: nodeId,
              target: altNodeId,
              sourceHandle: dir === "down" ? "bottom" : "top-source",
              targetHandle: dir === "down" ? "top" : "bottom-target",
              type: "straight",
              className: "edge--alt",
            });
          });
        }

        state.chainBuild.status = "succeeded";
        state.chainBuild.error = null;
        state.chainBuild.nodeId = null;
        state.chainBuild.direction = null;
      })
      .addCase(expandChainOneLevel.pending, (state, action) => {
        const targetNodeId = action.meta.arg.targetNodeId;
        const anchor = state.data.nodes.find((n) => n.id === targetNodeId);
        const rootNodeId =
          (anchor?.data?.chainRootNodeId as string) || targetNodeId;
        const chainDir = (anchor?.data?.chainDirection as "up" | "down") ?? "down";
        const sKey = sourcesKey(rootNodeId, chainDir);
        const session = state.chainSessions[sKey];
        if (session) session.chainStatus = "loading";
      })
      .addCase(expandChainOneLevel.fulfilled, (state, action) => {
        const {
          rootNodeId: sessionKey,
          targetNodeId,
          nodes,
          edges,
          pidToNodeIdNext,
          nextPids,
          usedTrId,
        } = action.payload;

        const targetNode = state.data.nodes.find((n) => n.id === targetNodeId);
        const targetPid = targetNode?.data?.chainPid || null;

        if (!targetPid) return;

        // --- 1) удаляем только уровень этого pid ---
        /*  const lvlPrefix = `chain::${rootNodeId}::lvl::${targetPid}::${usedTrId}`;
        state.data.nodes = state.data.nodes.filter(
          (n) => !n.id.startsWith(lvlPrefix),
        ); */
        // --- 1) удаляем старые edges этого преобразования ---
        const trFlowId = `chain::${sessionKey}::tr::${usedTrId}`;

        state.data.edges = state.data.edges.filter(
          (e) => !e.id.includes(trFlowId),
        );

        // --- 2) добавляем новое (dedupe) ---
        const newNodes = normalizeNodes(nodes);
        const newEdges = normalizeEdges(edges);

        const existingNodeIds = new Set(state.data.nodes.map((n) => n.id));
        state.data.nodes.push(
          ...newNodes.filter((n) => !existingNodeIds.has(n.id)),
        );

        const existingEdgeIds = new Set(state.data.edges.map((e) => e.id));
        const dedupedEdges = newEdges.filter((e) => !existingEdgeIds.has(e.id));
        state.data.edges.push(
          ...filterConflictingEdges(dedupedEdges, state.data.edges),
        );

        // --- 3) обновляем сессию ---
        const session = state.chainSessions[sessionKey];
        if (!session) return;

        session.pidToNodeId = pidToNodeIdNext;

        // --- 4) помечаем pid раскрытым ---
        if (!session.expandedPids.includes(targetPid)) {
          session.expandedPids.push(targetPid);
        }

        // --- 5) очередь: убираем текущий pid + добавляем nextPids ---
        session.queue = session.queue.filter((x) => x.pid !== targetPid);

        for (const pid of nextPids) {
          const alreadyExpanded = session.expandedPids.includes(pid);
          const alreadyQueued = session.queue.some((x) => x.pid === pid);
          if (!alreadyExpanded && !alreadyQueued) {
            session.queue.push({ pid });
          }
        }

        state.leafNodes = getLeafNodes(state.data.nodes, state.data.edges);
        const arr = session.expandedProducerByPid[targetPid] || [];
        if (!arr.includes(usedTrId)) arr.push(usedTrId);
        session.expandedProducerByPid[targetPid] = arr;
        session.chainStatus = "succeeded";
        session.chainError = null;
      })
      .addCase(expandChainOneLevel.rejected, (state, action) => {
        // "already expanded" можно не считать ошибкой
        const msg = (action.payload as string) || "expandChainOneLevel failed";
        if (msg === "already expanded") return;

        const targetNodeId = action.meta.arg.targetNodeId;
        const anchor = state.data.nodes.find((n) => n.id === targetNodeId);
        const rootNodeId =
          (anchor?.data?.chainRootNodeId as string) || targetNodeId;
        const chainDir = (anchor?.data?.chainDirection as "up" | "down") ?? "down";
        const sKey = sourcesKey(rootNodeId, chainDir);
        const session = state.chainSessions[sKey];
        if (session) {
          session.chainStatus = "failed";
          session.chainError = msg;
        }
      });
    builder
      .addCase(fetchProductCard.pending, (state, action) => {
        const nodeId = action.meta.arg.nodeId;
        const node = state.data.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.data.productCardStatus = "loading";
          node.data.productCardError = null;
        }
      })
      .addCase(fetchProductCard.fulfilled, (state, action) => {
        const { nodeId, data } = action.payload;
        const node = state.data.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.data.productCard = data.productCard;
          node.data.productCardKind = data.card_kind;
          node.data.productCardStatus = "succeeded";
          node.data.productCardError = null;
        }
      })
      .addCase(fetchProductCard.rejected, (state, action) => {
        const nodeId = action.meta.arg.nodeId;
        const node = state.data.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.data.productCardStatus = "failed";
          node.data.productCardError =
            (action.payload as string) || "product-card failed";
        }
      });
    // ── Step-by-step chain ──
    builder
      .addCase(fetchChainStep.pending, (state, action) => {
        const session =
          state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "loading";
          session.error = null;
        }
      })
      .addCase(fetchChainStep.fulfilled, (state, action) => {
        const { sessionKey, response } = action.payload;
        const session = state.stepChainSessions[sessionKey];
        if (!session) return;

        if (response.sourcesStatus === "insufficient") {
          session.status = "needs-sources";
          session.insufficientProducts =
            response.insufficientProducts ?? [];
          session.pendingStep = response.step;
          return;
        }

        session.pendingStep = response.step;
        session.status = "preview";
        session.error = null;
      })
      .addCase(fetchChainStep.rejected, (state, action) => {
        const session =
          state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "failed";
          session.error =
            (action.payload as string) || "step chain request failed";
        }
      });
    // ── Step sources fetch ──
    builder
      .addCase(fetchStepSources.pending, (state, action) => {
        const session =
          state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "fetching-sources";
          session.error = null;
        }
      })
      .addCase(fetchStepSources.fulfilled, (state, action) => {
        const { sessionKey, sources } = action.payload;
        const session = state.stepChainSessions[sessionKey];
        if (!session) return;
        session.accumulatedSources.push(...sources);
        session.status = "idle";
      })
      .addCase(fetchStepSources.rejected, (state, action) => {
        const session =
          state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "needs-sources";
          session.error =
            (action.payload as string) || "sources fetch failed";
        }
      });
    // ── Step build (new /step/build route) ──
    builder
      .addCase(buildStep.pending, (state, action) => {
        const session = state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "loading";
          session.error = null;
        }
      })
      .addCase(buildStep.fulfilled, (state, action) => {
        const { sessionKey, step, sourcesStatus, insufficientProducts } =
          action.payload;
        const session = state.stepChainSessions[sessionKey];
        if (!session) return;

        session.pendingStep = step;

        if (sourcesStatus === "insufficient") {
          session.status = "needs-sources";
          session.insufficientProducts = insufficientProducts;
          return;
        }

        session.status = "preview";
        session.error = null;
        session.insufficientProducts = [];
      })
      .addCase(buildStep.rejected, (state, action) => {
        const session = state.stepChainSessions[action.meta.arg.sessionKey];
        if (session) {
          session.status = "failed";
          session.error =
            (action.payload as string) || "step/build request failed";
        }
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
  mergeGraphFromFile,
  setProducerForPid,
  popQueueHead,
  initStepChainSession,
  acceptPendingStep,
  rejectPendingStep,
  undoLastStep,
  setStepChainContinueProduct,
  addSourcesToPool,
  clearSourcesPool,
  createStepAlternativeNodes,
  removeStepAlternativeNodes,
  acceptStepAlternative,
  clearAcceptedStepAlternatives,
  insertTransformationBetween,
  insertTransformationsForNeighbors,
} = gptSlice.actions;
export default gptSlice.reducer;
