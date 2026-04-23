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

      session.pendingStep = null;
      session.status = "idle";
      session.accumulatedSources = [];

      // Transfer sources pool from old product to new product
      const oldLabel = String(anchor.data?.label ?? "").trim();
      const newNode = state.data.nodes.find(
        (n) => n.id === session.currentProductNodeId,
      );
      const newLabel = String(newNode?.data?.label ?? "").trim();

      if (oldLabel && newLabel && oldLabel !== newLabel) {
        const oldPK = sourcesPoolKey(oldLabel, session.direction);
        const newPK = sourcesPoolKey(newLabel, session.direction);
        const oldPool = state.sourcesPool[oldPK];
        if (oldPool?.sources?.length) {
          const cur = state.sourcesPool[newPK];
          const byUrl = new Map(
            (cur?.sources ?? []).map((s) => [s.url, s]),
          );
          for (const s of oldPool.sources) {
            if (!byUrl.has(s.url)) byUrl.set(s.url, s);
          }
          state.sourcesPool[newPK] = {
            sources: Array.from(byUrl.values()),
            product: cur?.product || newLabel,
            lastFetchedAt: new Date().toISOString(),
          };
        }
      }
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
      const { productName, direction, sources } = action.payload;
      const key = sourcesPoolKey(productName, direction);
      const existing = state.sourcesPool[key];
      const existingByUrl = new Map(
        (existing?.sources ?? []).map((s) => [s.url, s]),
      );
      for (const s of sources) {
        if (!existingByUrl.has(s.url)) existingByUrl.set(s.url, s);
      }
      state.sourcesPool[key] = {
        sources: Array.from(existingByUrl.values()),
        product: existing?.product || productName,
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
        state.data.edges.push(
          ...filterConflictingEdges(filteredEdges, state.data.edges),
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
          const spacingX = 300;

          alternatives.forEach((alt, idx) => {
            const altNodeId = `chain::${nodeId}::${direction}::alt::${idx}`;

            // Чередуем лево/право: 0→лево, 1→право, 2→дальше лево, ...
            const side =
              idx % 2 === 0
                ? -(Math.floor(idx / 2) + 1)
                : Math.floor(idx / 2) + 1;
            const x = rx + side * spacingX;
            const y = ry + sign * stepY;

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
              sourceHandle: dir === "up" ? "bottom" : "top-source",
              targetHandle: dir === "up" ? "top" : "bottom-target",
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
  setProducerForPid,
  popQueueHead,
  initStepChainSession,
  acceptPendingStep,
  rejectPendingStep,
  undoLastStep,
  setStepChainContinueProduct,
  addSourcesToPool,
  clearSourcesPool,
} = gptSlice.actions;
export default gptSlice.reducer;
