// components/Flow.tsx
import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ConnectionLineType,
  Controls,
  type Node,
  type OnConnect,
  type OnReconnect,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  updateNodeData,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
  removeEdge,
  removeNode,
  addNode,
  setGraphData,
} from "./store/slices/gptSlice";
import { useAppSelector, useAppDispatch } from "./store/hooks";
import { FlowPanel } from "./components/flow-panel";
import { ProductNode, TransformationNode } from "./components/nodes";

import { AddNodeModal } from "./components/add-node-modal";
import { layoutTree } from "./utils/layoutTree";
import { centerTreeOnRoot } from "./utils/centerTreeOnRoot";
import styles from "./styles/Flow.module.css";
import { SearchToggle } from "./components/search-graph/SearchToggle";
import type { BuildDirection, TechnologySource } from "./store/types";
import { aggregateSources, fetchSources } from "./store/api/sources-api";
import {
  sourcesKey,
  setBuildMode,
  clearStepState,
} from "./store/slices/sourcesSlice";
import { buildChainLevel1, expandNextInQueue } from "./store/api/graph-api";
import { fetchProductCard } from "./store/api/product-card-api";
import {
  fetchStepSourcesV2,
  aggregateStepSources,
  buildStep,
} from "./store/api/step-chain-api";
import {
  initStepChainSession,
  acceptPendingStep,
  rejectPendingStep,
  undoLastStep,
  setStepChainContinueProduct,
} from "./store/slices/gptSlice";
import type { DirectionTabProps } from "./components/flow-panel/types";
import { NodeContextMenu } from "./components/node-context-menu";
import { ConfirmDeleteModal } from "./components/confirm-delete-modal";

const nodeTypes: NodeTypes = {
  product: ProductNode,
  transformation: TransformationNode,
};

export const Flow = () => {
  const dispatch = useAppDispatch();
  const { data, isLoading, error, rootId, source, chainBuild } = useAppSelector(
    (store) => store.graph,
  );
  const sourcesByNodeId = useAppSelector((s) => s.sources.byNodeId);

  const { fitView, screenToFlowPosition } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const hasFittedView = useRef(false);

  // --- keep a live ref so timeouts always see the latest nodes ---
  const nodesRef = useRef(data.nodes);
  nodesRef.current = data.nodes;

  // stable key that changes only when the SET of node IDs changes
  const nodeIdsKey = useMemo(
    () => data.nodes.map((n) => n.id).sort().join("|"),
    [data.nodes],
  );

  // When new nodes appear, wait for React Flow to measure them in the DOM,
  // then force-update all handle positions so edges connect correctly.
  useEffect(() => {
    if (!nodesRef.current.length) return;

    const timer = setTimeout(() => {
      updateNodeInternals(nodesRef.current.map((n) => n.id));
    }, 100);

    return () => clearTimeout(timer);
  }, [nodeIdsKey, updateNodeInternals]);
  const [isApplyingLayout, setIsApplyingLayout] = useState(false);

  const applyLayout = useCallback(async () => {
    if (!data.nodes.length || !rootId) return;

    setIsApplyingLayout(true);

    const { nodes, edges } = await layoutTree(data.nodes, data.edges, rootId);

    const centeredNodes = centerTreeOnRoot(nodes, rootId);

    dispatch(setGraphData({ nodes: centeredNodes, edges }));

    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 500 });
      hasFittedView.current = true;
      setIsApplyingLayout(false);
    });
  }, [data.nodes, data.edges, dispatch, fitView]);

  useEffect(() => {
    if (!data.nodes.length) return;
    if (!rootId) return;

    if (source === "new" || source === "loaded") {
      applyLayout();
    }
  }, [source, rootId]);

  const edgeReconnectSuccessful = useRef<boolean>(true);

  // Состояния для панели
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [tempNodeLabel, setTempNodeLabel] = useState<string>("");
  const [tempNodeDescription, setTempNodeDescription] = useState<string>("");
  const [initialLabel, setInitialLabel] = useState<string>("");
  const [initialDescription, setInitialDescription] = useState<string>("");
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Context menu & panel mode
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [panelMode, setPanelMode] = useState<
    { type: "card" } | { type: "build"; direction: BuildDirection }
  >({ type: "card" });
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(
    null,
  );

  // Step-by-step chain
  const stepChainSessions = useAppSelector(
    (s) => s.graph.stepChainSessions,
  );
  const stepSessionKey = (nodeId: string, dir: BuildDirection) =>
    `step::${nodeId}::${dir}`;

  // Flow.tsx
  const flowNodes = useMemo(
    () =>
      data.nodes.map((n) => {
        const isAlt = n.data?.chainVariant === "alt";

        const cls = [
          n.id === highlightedId ? "node--highlight" : "",
          isAlt ? "node--alt" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return { ...n, className: cls };
      }),
    [data.nodes, highlightedId],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setHighlightedId(id);

      setTimeout(() => setHighlightedId(null), 3000);
    };

    window.addEventListener("highlight-node", handler);
    return () => window.removeEventListener("highlight-node", handler);
  }, []);

  // Находим выбранный узел
  const selectedNode = data.nodes?.find(
    (node: Node) => node.id === selectedNodeId,
  );

  // При открытии панели устанавливаем текущее значение
  useEffect(() => {
    if (selectedNodeId && selectedNode && isPanelOpen) {
      const nodeData = selectedNode.data;
      const label = nodeData?.label || "";
      const description = nodeData?.description || "";
      setTempNodeLabel(label);
      setTempNodeDescription(description);
      setInitialLabel(label);
      setInitialDescription(description);

      // ── Автомиграция старых данных ──
      // Если есть старые sources + buildDirection, но нет per-direction данных
      const oldSources = nodeData?.sources as TechnologySource[] | undefined;
      const oldDir = nodeData?.buildDirection as BuildDirection | undefined;
      const hasNewDown = !!(nodeData?.sourcesDown as TechnologySource[] | undefined)?.length;
      const hasNewUp = !!(nodeData?.sourcesUp as TechnologySource[] | undefined)?.length;

      if (
        oldSources?.length &&
        oldDir &&
        !hasNewDown &&
        !hasNewUp
      ) {
        const dirField = oldDir === "up" ? "sourcesUp" : "sourcesDown";
        const aggField = oldDir === "up" ? "sourcesAggregatedUp" : "sourcesAggregatedDown";
        const descField = oldDir === "up" ? "upDescription" : "downDescription";

        dispatch(
          updateNodeData({
            nodeId: selectedNodeId,
            data: {
              [dirField]: oldSources,
              [aggField]: !!nodeData?.sourcesAggregated,
              // если description был перезаписан агрегацией, используем его
              [descField]: nodeData?.sourcesAggregated ? description : undefined,
            },
          }),
        );
      }
    }
  }, [selectedNodeId, isPanelOpen, selectedNode]);

  // Обработчик клика по узлу
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id);
    setPanelMode({ type: "card" });
    setIsPanelOpen(true);
    setContextMenu(null);
  }, []);

  // Обработчик правого клика по узлу
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Клик по пустому пространству — закрыть контекстное меню
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Из контекстного меню → открыть панель в build mode
  const handleContextBuild = useCallback(
    (direction: BuildDirection) => {
      const nodeId = contextMenu?.nodeId;
      if (!nodeId) return;
      setSelectedNodeId(nodeId);
      setPanelMode({ type: "build", direction });
      setIsPanelOpen(true);
      setContextMenu(null);
    },
    [contextMenu],
  );

  // Из контекстного меню → показать модалку подтверждения удаления
  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    setDeleteConfirmNodeId(contextMenu.nodeId);
    setContextMenu(null);
  }, [contextMenu]);

  // Подтверждение удаления
  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmNodeId) return;
    dispatch(removeNode(deleteConfirmNodeId));
    setDeleteConfirmNodeId(null);

    if (deleteConfirmNodeId === selectedNodeId) {
      setIsPanelOpen(false);
      setTimeout(() => {
        setSelectedNodeId(null);
        setTempNodeLabel("");
        setTempNodeDescription("");
        setInitialLabel("");
        setInitialDescription("");
      }, 300);
    }
  }, [deleteConfirmNodeId, selectedNodeId, dispatch]);

  // Закрытие панели с сохранением изменений
  const closePanel = useCallback(() => {
    if (selectedNodeId) {
      const updatedData: { label?: string; description?: string } = {};

      if (tempNodeLabel !== initialLabel) {
        updatedData.label = tempNodeLabel;
      }

      if (tempNodeDescription !== initialDescription) {
        updatedData.description = tempNodeDescription;
      }

      if (Object.keys(updatedData).length > 0) {
        dispatch(
          updateNodeData({
            nodeId: selectedNodeId,
            data: updatedData,
          }),
        );
      }
    }

    setIsPanelOpen(false);
    setPanelMode({ type: "card" });
    setTimeout(() => {
      setSelectedNodeId(null);
      setTempNodeLabel("");
      setTempNodeDescription("");
      setInitialLabel("");
      setInitialDescription("");
    }, 300);
  }, [
    selectedNodeId,
    tempNodeLabel,
    tempNodeDescription,
    initialLabel,
    initialDescription,
    dispatch,
  ]);

  // Обработчик изменения имени узла
  const handleNodeNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTempNodeLabel(event.target.value);
    },
    [],
  );

  // Обработчик изменения описания узла
  const handleNodeDescriptionChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTempNodeDescription(event.target.value);
    },
    [],
  );

  // Обработчики изменений узлов и ребер
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      dispatch(onNodesChange(changes));
    },
    [dispatch],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      dispatch(onEdgesChange(changes));
    },
    [dispatch],
  );

  const handleConnect: OnConnect = useCallback(
    (params) => {
      dispatch(onConnect(params));
    },
    [dispatch],
  );

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const handleReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      edgeReconnectSuccessful.current = true;
      dispatch(onReconnect({ oldEdge, newConnection }));
    },
    [dispatch],
  );

  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        dispatch(removeEdge(edge.id));
      }
      edgeReconnectSuccessful.current = true;
    },
    [dispatch],
  );

  const handleAddNode = (selectedType: "product" | "transformation") => {
    const screenCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };

    const flowPosition = screenToFlowPosition(screenCenter);

    dispatch(
      addNode({
        type: selectedType,
        position: flowPosition,
      }),
    );

    setIsTypeSelectorOpen(false);
  };

  // ─── Per-direction handlers (factories) ───
  const handleFindSources = useCallback(
    (direction: BuildDirection) =>
      async (opts?: { customSystemPrompt?: string; maxItems?: number }) => {
        if (!selectedNodeId || !selectedNode) return;
        const productName = String(selectedNode.data?.label || "").trim();
        if (!productName) return;

        await dispatch(
          fetchSources({
            nodeId: selectedNodeId,
            productName,
            maxItems: opts?.maxItems ?? 5,
            direction,
            customSystemPrompt: opts?.customSystemPrompt,
          }),
        ).unwrap();
      },
    [dispatch, selectedNodeId, selectedNode],
  );

  const handleAggregateSources = useCallback(
    (direction: BuildDirection) => async (customSystemPrompt?: string, customUserPrompt?: string) => {
      if (!selectedNodeId || !selectedNode) return;
      const productName = String(selectedNode.data?.label || "").trim();
      if (!productName) return;

      // sources from node.data per-direction
      const dirSources =
        direction === "up"
          ? (selectedNode.data?.sourcesUp as TechnologySource[])
          : (selectedNode.data?.sourcesDown as TechnologySource[]);

      // fallback to sourcesSlice
      const sliceKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sliceKey];
      const payloadSources: TechnologySource[] =
        dirSources ?? sliceState?.sources ?? [];

      if (!payloadSources.length) return;

      await dispatch(
        aggregateSources({
          nodeId: selectedNodeId,
          productName,
          sources: payloadSources,
          direction,
          customSystemPrompt,
          customUserPrompt,
        }),
      ).unwrap();
    },
    [dispatch, selectedNodeId, selectedNode, sourcesByNodeId],
  );

  // ─── Chain sessions (multi-session, per-direction) ───
  const chainSessions = useAppSelector((s) => s.graph.chainSessions);

  const handleInitChain = useCallback(
    (direction: BuildDirection) => async (customSystemPrompt?: string) => {
      if (!selectedNodeId || !selectedNode) return;

      const descField = direction === "up" ? "upDescription" : "downDescription";
      const techText = String(
        selectedNode.data?.[descField] ||
        selectedNode.data?.description ||
        "",
      ).trim();

      await dispatch(
        buildChainLevel1({
          nodeId: selectedNodeId,
          productName: String(selectedNode.data?.label || "").trim(),
          techText,
          direction,
          customSystemPrompt,
        }),
      ).unwrap();
    },
    [dispatch, selectedNodeId, selectedNode],
  );

  const handleExpandNext = useCallback(
    (direction: BuildDirection) => async () => {
      if (!selectedNodeId) return;
      const sKey = sourcesKey(selectedNodeId, direction);
      await dispatch(
        expandNextInQueue({ sessionKey: sKey, realRootNodeId: selectedNodeId }),
      ).unwrap();
    },
    [dispatch, selectedNodeId],
  );

  // ─── Step-by-step chain handlers (new /step/* flow) ───

  const ensureStepSession = useCallback(
    (direction: BuildDirection) => {
      if (!selectedNodeId) return null;
      const sKey = stepSessionKey(selectedNodeId, direction);
      if (!stepChainSessions[sKey]) {
        dispatch(
          initStepChainSession({
            sessionKey: sKey,
            direction,
            rootNodeId: selectedNodeId,
            currentProductNodeId: selectedNodeId,
          }),
        );
      }
      return sKey;
    },
    [dispatch, selectedNodeId, stepChainSessions],
  );

  const handleAcceptStep = useCallback(
    (direction: BuildDirection) =>
      (selectedContinueProductNodeId?: string) => {
        if (!selectedNodeId) return;
        const sKey = stepSessionKey(selectedNodeId, direction);
        dispatch(
          acceptPendingStep({
            sessionKey: sKey,
            selectedContinueProductNodeId,
          }),
        );
        // Сбрасываем step-state, чтобы начать следующий цикл
        dispatch(clearStepState({ nodeId: selectedNodeId, direction }));
      },
    [dispatch, selectedNodeId],
  );

  const handleFetchStepSourcesV2 = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      ensureStepSession(direction);
      const sKey = stepSessionKey(selectedNodeId, direction);
      const session = stepChainSessions[sKey];
      const currentProductNode =
        (session &&
          data.nodes.find((n) => n.id === session.currentProductNodeId)) ||
        selectedNode;
      const productName = String(
        currentProductNode?.data?.label || selectedNode?.data?.label || "",
      ).trim();
      if (!productName) return;

      dispatch(
        fetchStepSourcesV2({
          nodeId: selectedNodeId,
          productName,
          direction,
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      stepChainSessions,
      data.nodes,
      ensureStepSession,
    ],
  );

  const handleAggregateStepSources = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      const sKey = stepSessionKey(selectedNodeId, direction);
      const session = stepChainSessions[sKey];
      const currentProductNode =
        (session &&
          data.nodes.find((n) => n.id === session.currentProductNodeId)) ||
        selectedNode;
      const productName = String(
        currentProductNode?.data?.label || selectedNode?.data?.label || "",
      ).trim();
      if (!productName) return;

      const sliceKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sliceKey];
      const stepSources = sliceState?.stepSources ?? [];
      if (!stepSources.length) return;

      const descField =
        direction === "up" ? "upDescription" : "downDescription";
      const existingChain = String(
        selectedNode?.data?.[descField] ||
          selectedNode?.data?.description ||
          "",
      ).trim();

      dispatch(
        aggregateStepSources({
          nodeId: selectedNodeId,
          productName,
          direction,
          sources: stepSources,
          existingChain,
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      stepChainSessions,
      data.nodes,
      sourcesByNodeId,
    ],
  );

  const handleBuildStep = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      ensureStepSession(direction);
      const sKey = stepSessionKey(selectedNodeId, direction);
      const session = stepChainSessions[sKey];
      const currentProductNode =
        (session &&
          data.nodes.find((n) => n.id === session.currentProductNodeId)) ||
        selectedNode;
      const productName = String(
        currentProductNode?.data?.label || selectedNode?.data?.label || "",
      ).trim();
      if (!productName) return;

      const sliceKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sliceKey];
      const aggregated = sliceState?.stepAggregatedText;
      if (!aggregated || aggregated === "needs-sources") return;

      const mergedSources = [
        ...(sliceState?.stepSources ?? []),
        ...(session?.accumulatedSources ?? []),
      ];

      dispatch(
        buildStep({
          sessionKey: sKey,
          nodeId: selectedNodeId,
          productName,
          direction,
          techText: aggregated,
          existingSources: mergedSources.length ? mergedSources : undefined,
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      stepChainSessions,
      data.nodes,
      sourcesByNodeId,
      ensureStepSession,
    ],
  );

  const handleClearStepState = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      dispatch(clearStepState({ nodeId: selectedNodeId, direction }));
    },
    [dispatch, selectedNodeId],
  );

  // ─── Build DirectionTabProps for each direction ───
  const buildDirectionTab = useCallback(
    (direction: BuildDirection): DirectionTabProps => {
      if (!selectedNodeId || !selectedNode) {
        return {
          direction,
          sources: [],
        };
      }

      const sKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sKey];
      const session = chainSessions[sKey];

      // sources from node.data per-direction
      const nodeSources =
        direction === "up"
          ? (selectedNode.data?.sourcesUp as TechnologySource[])
          : (selectedNode.data?.sourcesDown as TechnologySource[]);

      const effectiveSources: TechnologySource[] =
        nodeSources ?? sliceState?.sources ?? [];

      const hasSources = effectiveSources.length > 0;

      const aggField = direction === "up" ? "sourcesAggregatedUp" : "sourcesAggregatedDown";
      const descField = direction === "up" ? "upDescription" : "downDescription";
      const hasAggregated =
        Boolean(selectedNode.data?.[aggField]) ||
        sliceState?.aggregateStatus === "succeeded";

      const chainReady = !!session?.rawChain;
      const chainUiEnabled = !!chainReady;
      const isActiveChainRoot =
        chainUiEnabled && selectedNodeId === selectedNodeId; // root is always the selected node for this session

      const queueLen = chainReady
        ? Math.max(
            0,
            (session.totalSteps ?? 0) - (session.expandedPids?.length ?? 0),
          )
        : 0;
      const queuePid: string | null = chainReady
        ? (session.queue?.[0]?.pid ?? null)
        : null;

      const canInitChainHere =
        hasSources && hasAggregated && (!chainReady || !isActiveChainRoot);

      const chainLoadingForNode =
        (chainBuild?.status === "loading" &&
          chainBuild?.nodeId === selectedNodeId &&
          chainBuild?.direction === direction) ||
        session?.chainStatus === "loading";

      const chainErrorForNode =
        (chainBuild?.status === "failed" &&
          chainBuild?.nodeId === selectedNodeId &&
          chainBuild?.direction === direction
          ? chainBuild?.error
          : null) ||
        (session?.chainStatus === "failed" ? session?.chainError : null);

      const initChainLabel =
        chainReady && !isActiveChainRoot
          ? "Продолжить граф: цепочка от этого продукта"
          : "Получить цепочку (chain)";

      // step-by-step chain
      const sKeyStep = stepSessionKey(selectedNodeId, direction);
      const stepSession = stepChainSessions[sKeyStep];

      const lastStep =
        stepSession?.steps.length
          ? stepSession.steps[stepSession.steps.length - 1]
          : null;

      const branchOptions =
        lastStep &&
        [...lastStep.newProductNodeIds, ...lastStep.mergedProductNodeIds]
          .length > 1
          ? [
              ...lastStep.newProductNodeIds,
              ...lastStep.mergedProductNodeIds,
            ].map((id) => ({
              nodeId: id,
              label:
                data.nodes.find((n) => n.id === id)?.data?.label || id,
            }))
          : undefined;

      return {
        direction,
        onFindSources: handleFindSources(direction),
        sourcesLoading: sliceState?.status === "loading",
        sourcesError: sliceState?.error ?? null,
        sources: effectiveSources,

        onAggregateSources: handleAggregateSources(direction),
        aggregateLoading: sliceState?.aggregateStatus === "loading",
        aggregateError: sliceState?.aggregateError ?? null,
        hasAggregated,
        aggregatedDescription:
          (selectedNode.data?.[descField] as string) ??
          sliceState?.aggregatedDescription ??
          null,
        onChangeAggregatedDescription: (e) => {
          if (!selectedNodeId) return;
          dispatch(
            updateNodeData({
              nodeId: selectedNodeId,
              data: { [descField]: e.target.value },
            }),
          );
        },

        productName: String(selectedNode.data?.label || "").trim(),

        chainLoading: chainLoadingForNode,
        chainError: chainErrorForNode,
        chainReady,
        chainUiEnabled,
        isActiveChainRoot,
        canInitChainHere,
        initChainLabel,
        onInitChain: handleInitChain(direction),

        queueLen,
        chainPid: queuePid,
        onExpandNext: handleExpandNext(direction),

        // --- build mode (Redux-backed, per-(nodeId, direction)) ---
        buildMode: sliceState?.buildMode ?? null,
        onChangeBuildMode: (mode) =>
          dispatch(
            setBuildMode({ nodeId: selectedNodeId, direction, mode }),
          ),

        // --- step-by-step chain (session-level state) ---
        stepChainStatus: stepSession?.status ?? "idle",
        stepChainError: stepSession?.error ?? null,
        stepChainStepCount: stepSession?.steps.length ?? 0,

        stepChainCurrentProductLabel: stepSession
          ? (data.nodes.find(
              (n) => n.id === stepSession.currentProductNodeId,
            )?.data?.label ?? "")
          : String(selectedNode.data?.label || ""),
        stepChainInsufficientProducts:
          stepSession?.insufficientProducts ?? [],

        onAcceptStep: handleAcceptStep(direction),
        onRejectStep: () => dispatch(rejectPendingStep(sKeyStep)),
        onRetryStep: handleBuildStep(direction),
        onUndoStep: () => dispatch(undoLastStep(sKeyStep)),

        pendingStep: stepSession?.pendingStep ?? null,

        stepChainBranchOptions: branchOptions,
        onSelectBranch: (nodeId: string) =>
          dispatch(
            setStepChainContinueProduct({
              sessionKey: sKeyStep,
              productNodeId: nodeId,
            }),
          ),

        // --- step v2 flow (per-(nodeId, direction) in sourcesSlice) ---
        stepSources: sliceState?.stepSources ?? [],
        stepSourcesStatus: sliceState?.stepSourcesStatus ?? "idle",
        stepSourcesError: sliceState?.stepSourcesError ?? null,

        stepAggregatedText: sliceState?.stepAggregatedText ?? null,
        stepAggregateStatus: sliceState?.stepAggregateStatus ?? "idle",
        stepAggregateError: sliceState?.stepAggregateError ?? null,
        stepInsufficientProducts: sliceState?.stepInsufficientProducts ?? [],

        stepBuildResult: sliceState?.stepBuildResult ?? null,
        stepBuildStatus: sliceState?.stepBuildStatus ?? "idle",
        stepBuildError: sliceState?.stepBuildError ?? null,

        onFetchStepSources: handleFetchStepSourcesV2(direction),
        onAggregateStepSources: handleAggregateStepSources(direction),
        onBuildStep: handleBuildStep(direction),
        onClearStepState: handleClearStepState(direction),
      };
    },
    [
      selectedNodeId,
      selectedNode,
      sourcesByNodeId,
      chainSessions,
      chainBuild,
      handleFindSources,
      handleAggregateSources,
      handleInitChain,
      handleExpandNext,
      stepChainSessions,
      handleAcceptStep,
      handleFetchStepSourcesV2,
      handleAggregateStepSources,
      handleBuildStep,
      handleClearStepState,
      data.nodes,
      dispatch,
    ],
  );

  const downTab = useMemo(
    () => buildDirectionTab("down"),
    [buildDirectionTab],
  );
  const upTab = useMemo(
    () => buildDirectionTab("up"),
    [buildDirectionTab],
  );

  const handleBuildProductCard = useCallback(
    async (options?: {
      customSystemPrompt?: string;
      selectedFields?: string[];
      useWebSearch?: boolean;
    }) => {
      if (!selectedNodeId) return;
      await dispatch(
        fetchProductCard({
          nodeId: selectedNodeId,
          customSystemPrompt: options?.customSystemPrompt,
          selectedFields: options?.selectedFields,
          useWebSearch: options?.useWebSearch,
        }),
      ).unwrap();
    },
    [dispatch, selectedNodeId],
  );

  return (
    <div className={styles.container}>
      <SearchToggle />
      <button
        className={styles.addNodeButton}
        onClick={() => setIsTypeSelectorOpen(true)}
      >
        + Узел
      </button>
      <AddNodeModal
        isOpen={isTypeSelectorOpen}
        onClose={() => setIsTypeSelectorOpen(false)}
        onSelect={handleAddNode}
      />
      {/* Индикатор загрузки */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
          <p>Создание графа...</p>
        </div>
      )}

      {/* Индикатор применения layout */}
      {isApplyingLayout && (
        <div className={styles.layoutOverlay}>
          <div className={styles.layoutSpinner}></div>
          <p>Применение layout...</p>
        </div>
      )}

      {/* Индикатор ошибки */}
      {error && (
        <div className={styles.errorOverlay}>
          <p className={styles.errorText}>Ошибка: {error}</p>
        </div>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={data.edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        connectionLineType={ConnectionLineType.Straight}
        snapToGrid
        onReconnect={handleReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        proOptions={{ hideAttribution: true }}
        nodeTypes={nodeTypes}
        edgesFocusable={false}
        nodesFocusable={false}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "straight",
          sourceHandle: "bottom",
          targetHandle: "top",
        }}
      >
        <Controls position="bottom-left" style={{ bottom: "25%" }} />
        <Background />
      </ReactFlow>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isProduct={
            data.nodes.find((n) => n.id === contextMenu.nodeId)?.type ===
            "product"
          }
          onBuildUp={() => handleContextBuild("up")}
          onBuildDown={() => handleContextBuild("down")}
          onDelete={handleContextDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
      <FlowPanel
        onClose={closePanel}
        isOpen={isPanelOpen}
        value={tempNodeLabel}
        onChangeValue={handleNodeNameChange}
        descriptionValue={tempNodeDescription}
        onChangeDescription={handleNodeDescriptionChange}
        nodeType={selectedNode?.type}
        onBuildProductCard={handleBuildProductCard}
        productCardStatus={selectedNode?.data?.productCardStatus}
        productCardError={selectedNode?.data?.productCardError}
        productCard={selectedNode?.data?.productCard}
        downTab={downTab}
        upTab={upTab}
        mode={panelMode.type}
        buildDirection={
          panelMode.type === "build" ? panelMode.direction : undefined
        }
      />
      {deleteConfirmNodeId && (
        <ConfirmDeleteModal
          nodeName={
            data.nodes.find((n) => n.id === deleteConfirmNodeId)?.data?.label ||
            ""
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmNodeId(null)}
        />
      )}
    </div>
  );
};
