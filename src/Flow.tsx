// components/Flow.tsx
import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ConnectionLineType,
  Controls,
  ControlButton,
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
  createStepAlternativeNodes,
  removeStepAlternativeNodes,
  acceptStepAlternative,
  insertTransformationsForNeighbors,
} from "./store/slices/gptSlice";
import { useAppSelector, useAppDispatch } from "./store/hooks";
import { FlowPanel } from "./components/flow-panel";
import { ProductNode, TransformationNode } from "./components/nodes";

import { AddNodeModal } from "./components/add-node-modal";
import { ShareGraphModal } from "./components/share-graph-modal";
import { GraphLegend } from "./components/graph-legend";
import { layoutTree } from "./utils/layoutTree";
import { centerTreeOnRoot } from "./utils/centerTreeOnRoot";
import { findChainNodeIds } from "./utils/findChainNodeIds";
import styles from "./styles/Flow.module.css";
import { SearchGraphPanel } from "./components/search-graph/SearchGraphPanel";
import type { BuildDirection, TechnologySource } from "./store/types";
import { aggregateSources, fetchSources } from "./store/api/sources-api";
import {
  sourcesKey,
  setBuildMode,
  clearStepState,
  resetStepBuild,
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
import { parseAlternatives } from "./utils/parseAlternatives";
import { NodeContextMenu } from "./components/node-context-menu";
import { ConfirmDeleteModal } from "./components/confirm-delete-modal";
import { SelectNeighborModal } from "./components/select-neighbor-modal";
import {
  getDirectProductNeighbors,
  type DirectProductNeighbor,
} from "./utils/getDirectProductNeighbors";
import { fetchTransformationsForNeighbors } from "./store/api/transformation-between-api";
import type { ChainLink } from "./store/types";
import type { ChainProductNode } from "./utils/chainToFlow";
import { getDefaultTransformationsBetweenPrompt } from "./prompts/transformationsBetweenPrompt";

const nodeTypes: NodeTypes = {
  product: ProductNode,
  transformation: TransformationNode,
};

interface FlowProps {
  /** Режим просмотра графа по шар-ссылке: только полотно, без редактирования и «обвеса». */
  sharedView?: boolean;
}

export const Flow = ({ sharedView = false }: FlowProps = {}) => {
  const dispatch = useAppDispatch();
  const { data, isLoading, error, rootId, source, chainBuild } = useAppSelector(
    (store) => store.graph,
  );
  const sourcesByNodeId = useAppSelector((s) => s.sources.byNodeId);

  const { fitView, screenToFlowPosition } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const hasFittedView = useRef(false);

  useEffect(() => {
    // В режиме просмотра по ссылке граф приходит с сервера — не перетираем его
    // содержимым из localStorage.
    if (sharedView) return;
    try {
      const raw = localStorage.getItem("saved-graph");
      if (!raw) return;
      const { nodes, edges } = JSON.parse(raw);
      if (Array.isArray(nodes) && nodes.length) {
        dispatch(setGraphData({ nodes, edges }));
      }
    } catch { /* ignore corrupted data */ }
  }, []);

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

    if (source === "new") {
      applyLayout();
      return;
    }

    if (source === "loaded") {
      // Для загруженных графов уважаем сохранённые позиции — не перераскладываем,
      // иначе layoutTree (rankdir BT для root без входящих) переворачивает граф
      // и теряются ручные правки. Layout запускаем только если позиции
      // отсутствуют/нулевые (например, БД отдала граф без позиций).
      const allZero = data.nodes.every(
        (n) => !n.position || (n.position.x === 0 && n.position.y === 0),
      );
      if (allZero) applyLayout();
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

  // Подсветка цепочки по hover — только для графов, загруженных через
  // вкладку «Объединение графов» (source === "loaded"). При наведении на узел
  // выделяются он сам, все предки и потомки + рёбра между ними; остальное
  // затемняется.
  const [hoveredChainId, setHoveredChainId] = useState<string | null>(null);
  const nodeTypeById = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const n of data.nodes) m.set(n.id, n.type);
    return m;
  }, [data.nodes]);
  const chainSet = useMemo<Set<string> | null>(() => {
    if (source !== "loaded" || !hoveredChainId) return null;
    return findChainNodeIds(
      data.edges,
      hoveredChainId,
      (id) => nodeTypeById.get(id),
    );
  }, [source, hoveredChainId, data.edges, nodeTypeById]);

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

  const [insertTrState, setInsertTrState] = useState<{
    nodeId: string;
    productLabel: string;
    neighbors: DirectProductNeighbor[];
    loading: boolean;
    error: string | null;
    customSystemPrompt: string;
    isPromptDirty: boolean;
  } | null>(null);

  const defaultTransformationsBetweenPrompt = useMemo(
    () => getDefaultTransformationsBetweenPrompt(),
    [],
  );

  // Step-by-step chain
  const stepChainSessions = useAppSelector(
    (s) => s.graph.stepChainSessions,
  );
  const sourcesPool = useAppSelector((s) => s.graph.sourcesPool);
  const stepSessionKey = (nodeId: string, dir: BuildDirection) =>
    `step::${nodeId}::${dir}`;
  const poolKey = (productName: string, dir: BuildDirection) =>
    `${productName
      .toLowerCase()
      .replace(/ё/g, "е")
      .trim()
      .replace(/\s+/g, " ")}::${dir}`;

  // Flow.tsx
  const flowNodes = useMemo(
    () =>
      data.nodes.map((n) => {
        const isAlt = n.data?.chainVariant === "alt";
        const isDimmed = chainSet ? !chainSet.has(n.id) : false;

        const cls = [
          n.id === highlightedId ? "node--highlight" : "",
          isAlt ? "node--alt" : "",
          isDimmed ? "node--dimmed" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return { ...n, className: cls };
      }),
    [data.nodes, highlightedId, chainSet],
  );

  const flowEdges = useMemo(() => {
    if (!chainSet) return data.edges;
    return data.edges.map((e) => {
      const bothIn = chainSet.has(e.source) && chainSet.has(e.target);
      if (bothIn) return e;
      const existing = e.className ?? "";
      const cls = [existing, "edge--dimmed"].filter(Boolean).join(" ");
      return { ...e, className: cls };
    });
  }, [data.edges, chainSet]);

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

  // Hover-подсветка цепочки (только для загруженных графов;
  // useMemo сам зануляет chainSet при source !== "loaded").
  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoveredChainId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => {
    setHoveredChainId(null);
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

  // Из контекстного меню → открыть модалку с подтверждением запроса
  const handleContextFetchTransformations = useCallback(() => {
    if (!contextMenu) return;
    const node = data.nodes.find((n) => n.id === contextMenu.nodeId);
    if (!node) return;
    const outgoing = getDirectProductNeighbors(
      contextMenu.nodeId,
      data.nodes,
      data.edges,
    ).filter((n) => n.role === "outgoing");
    if (!outgoing.length) {
      setContextMenu(null);
      return;
    }
    setInsertTrState({
      nodeId: contextMenu.nodeId,
      productLabel: String(node.data?.label ?? ""),
      neighbors: outgoing,
      loading: false,
      error: null,
      customSystemPrompt: defaultTransformationsBetweenPrompt,
      isPromptDirty: false,
    });
    setContextMenu(null);
  }, [contextMenu, data.nodes, data.edges, defaultTransformationsBetweenPrompt]);

  const handleFetchTransformations = useCallback(async () => {
    if (!insertTrState) return;
    const anchorId = insertTrState.nodeId;
    const anchor = data.nodes.find((n) => n.id === anchorId);
    if (!anchor || !insertTrState.neighbors.length) return;

    const anchorLabel = String(anchor.data?.label ?? "");
    const anchorDesc = anchor.data?.description
      ? String(anchor.data.description)
      : undefined;

    const chain: ChainProductNode[] = [
      {
        "Id узла": anchorId,
        "Тип узла": "Продукт",
        "Продукты": [anchorLabel],
        "Название узла": anchorLabel,
        ...(anchorDesc ? { "Описание продукта": anchorDesc } : {}),
      },
      ...insertTrState.neighbors.map((n) => {
        const node = data.nodes.find((nd) => nd.id === n.neighborNodeId);
        const desc = node?.data?.description
          ? String(node.data.description)
          : undefined;
        return {
          "Id узла": n.neighborNodeId,
          "Тип узла": "Продукт" as const,
          "Продукты": [n.neighborLabel],
          "Название узла": n.neighborLabel,
          ...(desc ? { "Описание продукта": desc } : {}),
        };
      }),
    ];

    const links: ChainLink[] = insertTrState.neighbors.map((n) => ({
      "Откуда": anchorId,
      "Куда": n.neighborNodeId,
      "Источник": anchorLabel,
      "Приемник": n.neighborLabel,
      "Тип связи": "сырье -> продукт",
    }));

    const edgeIdByPair = new Map<string, string>();
    for (const n of insertTrState.neighbors) {
      edgeIdByPair.set(`${anchorId}->${n.neighborNodeId}`, n.edgeId);
    }
    const knownNodeIds = new Set<string>([
      anchorId,
      ...insertTrState.neighbors.map((n) => n.neighborNodeId),
    ]);

    setInsertTrState((s) => (s ? { ...s, loading: true, error: null } : s));
    try {
      const result = await dispatch(
        fetchTransformationsForNeighbors({
          anchorNodeId: anchorId,
          chain,
          links,
          ...(insertTrState.isPromptDirty
            ? { customSystemPrompt: insertTrState.customSystemPrompt }
            : {}),
        }),
      ).unwrap();

      const groups = result.transformations
        .map((t) => {
          const inputNodeIds = t.inputNodeIds.filter((id) =>
            knownNodeIds.has(id),
          );
          const outputNodeIds = t.outputNodeIds.filter((id) =>
            knownNodeIds.has(id),
          );
          const removeEdgeIds: string[] = [];
          for (const inId of inputNodeIds) {
            for (const outId of outputNodeIds) {
              const eid = edgeIdByPair.get(`${inId}->${outId}`);
              if (eid) removeEdgeIds.push(eid);
            }
          }
          return {
            name: t.name,
            description: t.description,
            sources: t.sources,
            inputNodeIds,
            outputNodeIds,
            removeEdgeIds,
          };
        })
        .filter((g) => g.inputNodeIds.length > 0 && g.outputNodeIds.length > 0);

      if (!groups.length) {
        setInsertTrState((s) =>
          s
            ? {
                ...s,
                loading: false,
                error: "Сервер не вернул применимых преобразований",
              }
            : s,
        );
        return;
      }

      dispatch(insertTransformationsForNeighbors({ groups }));
      setInsertTrState(null);
    } catch (err) {
      const msg =
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message ||
            "Не удалось получить преобразования";
      setInsertTrState((s) =>
        s ? { ...s, loading: false, error: msg } : s,
      );
    }
  }, [dispatch, insertTrState, data.nodes]);

  // Outgoing-соседи для пункта меню (для текущего contextMenu.nodeId)
  const contextMenuHasOutgoingNeighbors = useMemo(() => {
    if (!contextMenu) return false;
    return getDirectProductNeighbors(
      contextMenu.nodeId,
      data.nodes,
      data.edges,
    ).some((n) => n.role === "outgoing");
  }, [contextMenu, data.nodes, data.edges]);

  // Подтверждение удаления
  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmNodeId) return;

    for (const dir of ["down", "up"] as const) {
      dispatch(
        clearStepState({ nodeId: deleteConfirmNodeId, direction: dir }),
      );
    }

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
      (
        selectedContinueProductNodeId?: string,
        filteredStep?: import("./store/types").StepChainApiStep,
      ) => {
        if (!selectedNodeId) return;
        const sKey = stepSessionKey(selectedNodeId, direction);
        dispatch(
          acceptPendingStep({
            sessionKey: sKey,
            selectedContinueProductNodeId,
            filteredStep,
          }),
        );
        dispatch(resetStepBuild({ nodeId: selectedNodeId, direction }));
        // stepAggregatedText НЕ чистим: после построения основного пути
        // альтернативы должны остаться видимыми, и useEffect пересоздаст
        // alt-ноды по сохранённому тексту с переиспользованием их позиций.
      },
    [dispatch, selectedNodeId],
  );

  const handleFetchStepSourcesV2 = useCallback(
    (direction: BuildDirection) => (opts?: { customSystemPrompt?: string; maxItems?: number }) => {
      if (!selectedNodeId) return;
      ensureStepSession(direction);
      const sKey = stepSessionKey(selectedNodeId, direction);
      const productName = String(selectedNode?.data?.label || "").trim();
      if (!productName) return;

      dispatch(
        setStepChainContinueProduct({
          sessionKey: sKey,
          productNodeId: selectedNodeId,
        }),
      );

      const existingSources =
        sourcesPool[poolKey(productName, direction)]?.sources ?? [];

      dispatch(
        fetchStepSourcesV2({
          nodeId: selectedNodeId,
          productName,
          direction,
          ...(existingSources.length ? { existingSources } : {}),
          ...(opts?.customSystemPrompt ? { customSystemPrompt: opts.customSystemPrompt } : {}),
          ...(opts?.maxItems ? { maxItems: opts.maxItems } : {}),
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      ensureStepSession,
      sourcesPool,
    ],
  );

  const handleAggregateStepSources = useCallback(
    (direction: BuildDirection) => (customSystemPrompt?: string, customUserPrompt?: string) => {
      if (!selectedNodeId) return;
      const sKey = stepSessionKey(selectedNodeId, direction);
      const productName = String(selectedNode?.data?.label || "").trim();
      if (!productName) return;

      dispatch(
        setStepChainContinueProduct({
          sessionKey: sKey,
          productNodeId: selectedNodeId,
        }),
      );

      const poolSources =
        sourcesPool[poolKey(productName, direction)]?.sources ?? [];
      if (!poolSources.length) return;

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
          sources: poolSources,
          existingChain,
          ...(customSystemPrompt ? { customSystemPrompt } : {}),
          ...(customUserPrompt ? { customUserPrompt } : {}),
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      sourcesPool,
    ],
  );

  const handleBuildStep = useCallback(
    (direction: BuildDirection) => (customText?: string, customSystemPrompt?: string) => {
      if (!selectedNodeId) return;
      ensureStepSession(direction);
      const sKey = stepSessionKey(selectedNodeId, direction);
      const productName = String(selectedNode?.data?.label || "").trim();
      if (!productName) return;

      dispatch(
        setStepChainContinueProduct({
          sessionKey: sKey,
          productNodeId: selectedNodeId,
        }),
      );

      const sliceKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sliceKey];
      const aggregated =
        customText ?? sliceState?.stepAggregatedText ?? "";
      if (!aggregated) return;

      const poolSources =
        sourcesPool[poolKey(productName, direction)]?.sources ?? [];

      dispatch(
        buildStep({
          sessionKey: sKey,
          nodeId: selectedNodeId,
          productName,
          direction,
          techText: aggregated,
          existingSources: poolSources.length ? poolSources : undefined,
          ...(customSystemPrompt ? { customSystemPrompt } : {}),
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      sourcesByNodeId,
      sourcesPool,
      ensureStepSession,
    ],
  );

  const handleClearStepState = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      dispatch(clearStepState({ nodeId: selectedNodeId, direction }));
      dispatch(removeStepAlternativeNodes({ nodeId: selectedNodeId, direction }));
    },
    [dispatch, selectedNodeId],
  );

  // ─── Create / remove step alternative nodes when aggregate text changes ───
  useEffect(() => {
    if (!selectedNodeId) return;
    for (const direction of ["up", "down"] as const) {
      const sKey = sourcesKey(selectedNodeId, direction);
      const sliceState = sourcesByNodeId[sKey];
      const text = sliceState?.stepAggregatedText;
      if (text) {
        const alts = parseAlternatives(text);
        if (alts.length > 1) {
          dispatch(
            createStepAlternativeNodes({
              nodeId: selectedNodeId,
              direction,
              alternatives: alts.slice(1),
            }),
          );
        } else {
          dispatch(removeStepAlternativeNodes({ nodeId: selectedNodeId, direction }));
        }
      } else {
        dispatch(removeStepAlternativeNodes({ nodeId: selectedNodeId, direction }));
      }
    }
  }, [
    selectedNodeId,
    sourcesByNodeId,
    dispatch,
  ]);

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

      const baseResult: DirectionTabProps = {
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

        stepChainCurrentProductLabel: String(selectedNode.data?.label || ""),
        stepChainCurrentProductNodeId: selectedNodeId,
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

        // --- step v2 flow (sources from graph-level pool) ---
        // Always read pool for the panel's own product — panel actions target
        // the selected node, not the chain tip.
        stepSources:
          sourcesPool[
            poolKey(String(selectedNode.data?.label ?? ""), direction)
          ]?.sources ?? [],
        stepSourcesStatus: sliceState?.stepSourcesStatus ?? "idle",
        stepSourcesError: sliceState?.stepSourcesError ?? null,

        stepAggregatedText: sliceState?.stepAggregatedText ?? null,
        stepAggregateStatus: sliceState?.stepAggregateStatus ?? "idle",
        stepAggregateError: sliceState?.stepAggregateError ?? null,
        stepNeedsSources: sliceState?.stepNeedsSources ?? false,
        stepInsufficientProducts: sliceState?.stepInsufficientProducts ?? [],

        stepBuildResult: sliceState?.stepBuildResult ?? null,
        stepBuildStatus: sliceState?.stepBuildStatus ?? "idle",
        stepBuildError: sliceState?.stepBuildError ?? null,

        onFetchStepSources: handleFetchStepSourcesV2(direction),
        onAggregateStepSources: handleAggregateStepSources(direction),
        onBuildStep: handleBuildStep(direction),
        onClearStepState: handleClearStepState(direction),
      };

      // ── Override for step alternative nodes ──
      const isStepAlt =
        selectedNode.data?.chainVariant === "alt" &&
        selectedNode.data?.stepAltDirection === direction;

      if (isStepAlt) {
        const rootNodeId = String(selectedNode.data?.chainRootNodeId || "");
        const rootNode = data.nodes.find((n) => n.id === rootNodeId);
        if (rootNode) {
          const rootProductName = String(rootNode.data?.label || "").trim();
          const rootSKey = sourcesKey(rootNodeId, direction);
          const rootSliceState = sourcesByNodeId[rootSKey];
          const rootStepSKey = stepSessionKey(rootNodeId, direction);
          const rootStepSession = stepChainSessions[rootStepSKey];
          const altDesc = String(selectedNode.data?.description || "");

          baseResult.isAlternativeNode = true;
          baseResult.altDescription = altDesc;
          baseResult.buildMode = rootSliceState?.buildMode ?? "step";
          baseResult.stepChainCurrentProductLabel = rootProductName;

          baseResult.stepSources =
            sourcesPool[poolKey(rootProductName, direction)]?.sources ?? [];
          baseResult.stepSourcesStatus =
            rootSliceState?.stepSourcesStatus ?? "idle";
          baseResult.stepAggregatedText =
            rootSliceState?.stepAggregatedText ?? null;
          baseResult.stepAggregateStatus =
            rootSliceState?.stepAggregateStatus ?? "idle";
          baseResult.stepBuildStatus =
            rootSliceState?.stepBuildStatus ?? "idle";
          baseResult.stepBuildError =
            rootSliceState?.stepBuildError ?? null;
          baseResult.pendingStep =
            rootStepSession?.pendingStep ?? null;
          baseResult.stepChainStepCount =
            rootStepSession?.steps.length ?? 0;
          baseResult.stepChainStatus =
            rootStepSession?.status ?? "idle";

          baseResult.onBuildStep = (customText?: string, customSystemPrompt?: string) => {
            const sKey = stepSessionKey(rootNodeId, direction);
            if (!stepChainSessions[sKey]) {
              dispatch(
                initStepChainSession({
                  sessionKey: sKey,
                  direction,
                  rootNodeId,
                  currentProductNodeId: rootNodeId,
                }),
              );
            }
            dispatch(
              setStepChainContinueProduct({
                sessionKey: sKey,
                productNodeId: rootNodeId,
              }),
            );
            const poolSrcs =
              sourcesPool[poolKey(rootProductName, direction)]?.sources ?? [];
            dispatch(
              buildStep({
                sessionKey: sKey,
                nodeId: rootNodeId,
                productName: rootProductName,
                direction,
                techText: customText || altDesc,
                existingSources: poolSrcs.length ? poolSrcs : undefined,
                ...(customSystemPrompt ? { customSystemPrompt } : {}),
              }),
            );
          };

          baseResult.onAcceptStep = (
            selectedContinueProductNodeId?: string,
            filteredStep?: import("./store/types").StepChainApiStep,
          ) => {
            const sKey = stepSessionKey(rootNodeId, direction);
            dispatch(
              acceptPendingStep({
                sessionKey: sKey,
                selectedContinueProductNodeId,
                filteredStep,
              }),
            );
            dispatch(resetStepBuild({ nodeId: rootNodeId, direction }));
            // Помечаем именно эту альтернативу как принятую: alt-нода с этим idx
            // удаляется и в дальнейшем не пересоздаётся useEffect-ом, остальные
            // альтернативы остаются доступны для построения.
            const altIdxStr =
              (selectedNode?.id ?? "").split("::").pop() ?? "";
            const idx = parseInt(altIdxStr, 10);
            if (Number.isFinite(idx)) {
              dispatch(
                acceptStepAlternative({ rootNodeId, direction, idx }),
              );
            }
          };

          baseResult.onRejectStep = () => {
            const sKey = stepSessionKey(rootNodeId, direction);
            dispatch(rejectPendingStep(sKey));
          };

          baseResult.onRetryStep = baseResult.onBuildStep;
        }
      }

      return baseResult;
    },
    [
      selectedNodeId,
      selectedNode,
      sourcesByNodeId,
      chainSessions,
      chainBuild,
      sourcesPool,
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

  const [saveFlash, setSaveFlash] = useState(false);
  const handleSaveToLocalStorage = useCallback(() => {
    localStorage.setItem(
      "saved-graph",
      JSON.stringify({ nodes: data.nodes, edges: data.edges }),
    );
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  }, [data.nodes, data.edges]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleClearCanvas = useCallback(() => {
    dispatch(setGraphData({ nodes: [], edges: [] }));
    localStorage.removeItem("saved-graph");
    setShowClearConfirm(false);
  }, [dispatch]);

  return (
    <div className={styles.container}>
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
        edges={flowEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={sharedView ? undefined : handleConnect}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeContextMenu={sharedView ? undefined : onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodesConnectable={!sharedView}
        connectionLineType={ConnectionLineType.Straight}
        snapToGrid
        onReconnect={sharedView ? undefined : handleReconnect}
        onReconnectStart={sharedView ? undefined : onReconnectStart}
        onReconnectEnd={sharedView ? undefined : onReconnectEnd}
        deleteKeyCode={sharedView ? null : undefined}
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
        <Controls position="bottom-left" style={{ bottom: "25%" }} showInteractive={false}>
          {!sharedView && (
            <>
          <ControlButton
            onClick={handleSaveToLocalStorage}
            title="Сохранить граф"
            style={saveFlash ? { backgroundColor: "#4caf50", color: "#fff" } : undefined}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M18.1716 1C18.702 1 19.2107 1.21071 19.5858 1.58579L22.4142 4.41421C22.7893 4.78929 23 5.29799 23 5.82843V20C23 21.6569 21.6569 23 20 23H4C2.34315 23 1 21.6569 1 20V4C1 2.34315 2.34315 1 4 1H18.1716ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21L5 21L5 15C5 13.3431 6.34315 12 8 12L16 12C17.6569 12 19 13.3431 19 15V21H20C20.5523 21 21 20.5523 21 20V6.82843C21 6.29799 20.7893 5.78929 20.4142 5.41421L18.5858 3.58579C18.2107 3.21071 17.702 3 17.1716 3H17V5C17 6.65685 15.6569 8 14 8H10C8.34315 8 7 6.65685 7 5V3H4ZM17 21V15C17 14.4477 16.5523 14 16 14L8 14C7.44772 14 7 14.4477 7 15L7 21L17 21ZM9 3H15V5C15 5.55228 14.5523 6 14 6H10C9.44772 6 9 5.55228 9 5V3Z" />
            </svg>
          </ControlButton>
          <ControlButton
            onClick={() => setIsTypeSelectorOpen(true)}
            title="Добавить узел"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ fill: 'none' }} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15" />
              <path d="M22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8" />
            </svg>
          </ControlButton>
            </>
          )}
          <ControlButton
            onClick={() => setIsSearchOpen((v) => !v)}
            title="Поиск по графу"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" />
            </svg>
          </ControlButton>
          {!sharedView && (
            <>
          <ControlButton
            onClick={() => setShowClearConfirm(true)}
            title="Очистить полотно"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" fill="currentColor">
              <path d="M960 0v112.941c467.125 0 847.059 379.934 847.059 847.059 0 467.125-379.934 847.059-847.059 847.059-467.125 0-847.059-379.934-847.059-847.059 0-267.106 126.607-515.915 338.824-675.727v393.374h112.94V112.941H0v112.941h342.89C127.058 407.38 0 674.711 0 960c0 529.355 430.645 960 960 960s960-430.645 960-960S1489.355 0 960 0" fillRule="evenodd" />
            </svg>
          </ControlButton>
          <ControlButton
            onClick={() => setShowShareModal(true)}
            title="Поделиться"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ fill: 'none' }} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.59 13.51L15.42 17.49M15.41 6.51L8.59 10.49" />
            </svg>
          </ControlButton>
            </>
          )}
        </Controls>
        <Background />
      </ReactFlow>
      {sharedView && !isPanelOpen && <GraphLegend />}
      {isSearchOpen && (
        <SearchGraphPanel onClose={() => setIsSearchOpen(false)} />
      )}
      <AddNodeModal
        isOpen={isTypeSelectorOpen}
        onClose={() => setIsTypeSelectorOpen(false)}
        onSelect={handleAddNode}
      />
      <ShareGraphModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />
      {contextMenu && (() => {
        const ctxNode = data.nodes.find((n) => n.id === contextMenu.nodeId);
        const ctxIsStepAlt =
          ctxNode?.data?.chainVariant === "alt" &&
          !!ctxNode?.data?.stepAltDirection;
        return (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isProduct={ctxNode?.type === "product"}
            isStepAlt={ctxIsStepAlt}
            hasOutgoingProductNeighbors={contextMenuHasOutgoingNeighbors}
            onBuildUp={() => handleContextBuild("up")}
            onBuildDown={() => handleContextBuild("down")}
            onBuildAlt={
              ctxIsStepAlt
                ? () =>
                    handleContextBuild(
                      ctxNode!.data!.stepAltDirection as BuildDirection,
                    )
                : undefined
            }
            onFetchTransformations={handleContextFetchTransformations}
            onDelete={handleContextDelete}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}
      <FlowPanel
        onClose={closePanel}
        isOpen={isPanelOpen}
        value={tempNodeLabel}
        onChangeValue={handleNodeNameChange}
        descriptionValue={tempNodeDescription}
        onChangeDescription={handleNodeDescriptionChange}
        nodeType={selectedNode?.type}
        transformationSources={
          selectedNode?.data?.transformationSources as string[] | undefined
        }
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
        readOnly={sharedView}
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
      {showClearConfirm && (
        <ConfirmDeleteModal
          nodeName=""
          title="Очистить полотно?"
          description="Все узлы и связи будут удалены. Это действие нельзя отменить."
          confirmLabel="Очистить"
          onConfirm={handleClearCanvas}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
      {insertTrState && (
        <SelectNeighborModal
          productLabel={insertTrState.productLabel}
          neighbors={insertTrState.neighbors}
          loading={insertTrState.loading}
          error={insertTrState.error}
          defaultSystemPrompt={defaultTransformationsBetweenPrompt}
          customSystemPrompt={insertTrState.customSystemPrompt}
          isPromptDirty={insertTrState.isPromptDirty}
          onChangeCustomSystemPrompt={(value) =>
            setInsertTrState((s) =>
              s
                ? {
                    ...s,
                    customSystemPrompt: value,
                    isPromptDirty: value !== defaultTransformationsBetweenPrompt,
                  }
                : s,
            )
          }
          onResetSystemPrompt={() =>
            setInsertTrState((s) =>
              s
                ? {
                    ...s,
                    customSystemPrompt: defaultTransformationsBetweenPrompt,
                    isPromptDirty: false,
                  }
                : s,
            )
          }
          onConfirm={handleFetchTransformations}
          onClose={() =>
            !insertTrState.loading && setInsertTrState(null)
          }
        />
      )}
    </div>
  );
};
