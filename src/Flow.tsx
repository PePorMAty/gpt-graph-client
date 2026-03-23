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
  setProducerForPid,
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
import { setBuildDirection } from "./store/slices/sourcesSlice";
import { buildChainLevel1, expandNextInQueue } from "./store/api/graph-api";
import { listProducersForPid } from "./utils/listProducersForPid";

import { fetchProductCard } from "./store/api/product-card-api";

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

    const { nodes, edges } = await layoutTree(data.nodes, data.edges);

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

  // Flow.tsx
  const flowNodes = useMemo(
    () =>
      data.nodes.map((n) => {
        const isChainRoot = n.type === "product" && !!n.data?.chainBuiltRoot;
        const isAlt = n.data?.chainVariant === "alt";

        const cls = [
          n.id === highlightedId ? "node--highlight" : "",
          isChainRoot ? "node--chainroot" : "",
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
    }
  }, [selectedNodeId, isPanelOpen, selectedNode]);

  // Обработчик клика по узлу
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id);
    setIsPanelOpen(true);
  }, []);

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

  // Обработчик удаления узла
  const handleDeleteNode = useCallback(() => {
    if (selectedNodeId) {
      dispatch(removeNode(selectedNodeId));
      setIsPanelOpen(false);
      setTimeout(() => {
        setSelectedNodeId(null);
        setTempNodeLabel("");
        setTempNodeDescription("");
        setInitialLabel("");
        setInitialDescription("");
      }, 300);
    }
  }, [selectedNodeId, dispatch]);

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
    // центр окна
    const screenCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };

    // координаты графа
    const flowPosition = screenToFlowPosition(screenCenter);

    dispatch(
      addNode({
        type: selectedType,
        position: flowPosition,
      }),
    );

    setIsTypeSelectorOpen(false);
  };

  const currentSourcesState = selectedNodeId
    ? sourcesByNodeId[selectedNodeId]
    : undefined;

  const buildDirection: BuildDirection | null =
    selectedNode?.data?.buildDirection ??
    currentSourcesState?.direction ??
    null;

  const sourcesStatus = currentSourcesState?.status ?? "idle";
  const sourcesLoading = sourcesStatus === "loading";
  const sourcesError = currentSourcesState?.error ?? null;
  const sources = currentSourcesState?.sources ?? [];

  const aggStatus = currentSourcesState?.aggregateStatus ?? "idle";
  const aggregateLoading = aggStatus === "loading";
  const aggregateError = currentSourcesState?.aggregateError ?? null;
  const aggregatedDescription =
    currentSourcesState?.aggregatedDescription ?? null;

  // Источники берём из node.data (чтобы переживало сохранение/загрузку графа)

  const handleSetDirection = useCallback(
    (dir: BuildDirection) => {
      if (!selectedNodeId) return;
      dispatch(setBuildDirection({ nodeId: selectedNodeId, direction: dir }));

      // ✅ сохраняем выбор прямо в карточку
      dispatch(
        updateNodeData({
          nodeId: selectedNodeId,
          data: { buildDirection: dir },
        }),
      );
    },
    [dispatch, selectedNodeId],
  );

  const handleFindSources = useCallback(async () => {
    if (!selectedNodeId || !selectedNode) return;

    const productName = String(selectedNode.data?.label || "").trim();
    if (!productName) return;

    const result = await dispatch(
      fetchSources({ nodeId: selectedNodeId, productName, maxItems: 5 }),
    ).unwrap();

    // ✅ сохраняем источники прямо в node.data (переживёт save/load)
    dispatch(
      updateNodeData({
        nodeId: selectedNodeId,
        data: { sources: result.data.sources, sourcesAggregated: false },
      }),
    );
  }, [dispatch, selectedNodeId, selectedNode]);

  const handleAggregateSources = useCallback(async () => {
    if (!selectedNodeId || !selectedNode) return;

    const productName = String(selectedNode.data?.label || "").trim();
    if (!productName) return;

    // ✅ Источник правды — node.data.sources (переживает save/load)
    const payloadSources: TechnologySource[] =
      (selectedNode.data?.sources as TechnologySource[]) ??
      currentSourcesState?.sources ??
      [];

    if (!payloadSources.length) return;

    const result = await dispatch(
      aggregateSources({
        nodeId: selectedNodeId,
        productName,
        sources: payloadSources,
      }),
    ).unwrap();

    // ✅ Берём ТОЛЬКО aggregated_description
    const desc = String(result?.data?.aggregated_description ?? "").trim();

    // (опционально) защита от случайного JSON
    // если вдруг бек вернул что-то не то
    const safeDesc = desc.startsWith("{") ? "" : desc;

    dispatch(
      updateNodeData({
        nodeId: selectedNodeId,
        data: { description: safeDesc, sourcesAggregated: true },
      }),
    );

    // ✅ ВАЖНО: синхронизируем локальный текст в панели,
    // иначе textarea продолжит показывать старый JSON
    setTempNodeDescription(safeDesc);
    setInitialDescription(safeDesc);
  }, [
    dispatch,
    selectedNodeId,
    selectedNode,
    currentSourcesState?.sources,
    setTempNodeDescription,
    setInitialDescription,
  ]);

  const chainError =
    chainBuild?.status === "failed" && chainBuild?.nodeId === selectedNodeId
      ? chainBuild?.error
      : null;

  // --- CHAIN SESSIONS (multi-session) ---
  const chainSessions = useAppSelector((s) => s.graph.chainSessions);

  // root id цепочки, к которой принадлежит выбранный узел
  const nodeChainRootId: string | null =
    (selectedNode?.data?.chainRootNodeId as string) ?? null;

  // активная сессия = сессия для выбранного узла
  const activeSession = nodeChainRootId
    ? chainSessions[nodeChainRootId] ?? null
    : null;

  const chainReady = !!activeSession?.rawChain;
  const chainUiEnabled = !!chainReady;

  // "queue UI" показываем только на root активной цепочки
  const isActiveChainRoot =
    chainUiEnabled && selectedNodeId === nodeChainRootId;

  const queueLen = chainReady ? (activeSession.queue?.length ?? 0) : 0;

  // следующий pid берём из очереди активной сессии
  const queuePid: string | null = chainReady
    ? (activeSession.queue?.[0]?.pid ?? null)
    : null;

  // producers / built / selected — считаем для queuePid из активной сессии
  const producerOptions =
    queuePid && activeSession?.rawChain
      ? listProducersForPid(activeSession.rawChain, queuePid)
      : [];

  const builtProducerIds =
    (queuePid && activeSession?.expandedProducerByPid?.[queuePid]) || [];

  const builtSet = new Set(builtProducerIds);

  const mainProducerId = producerOptions[0]?.trId || "";

  const selectedProducerId =
    (queuePid && activeSession?.producerByPid?.[queuePid]) ||
    producerOptions.find((p) => !builtSet.has(p.trId))?.trId ||
    mainProducerId;

  const handleSelectProducer = (trId: string) => {
    if (!queuePid || !nodeChainRootId) return;
    if (builtSet.has(trId)) return;
    dispatch(
      setProducerForPid({
        rootNodeId: nodeChainRootId,
        pid: queuePid,
        transformationId: trId || null,
      }),
    );
  };

  const handleInitChain = async () => {
    await dispatch(
      buildChainLevel1({
        nodeId: selectedNodeId!,
        productName: String(selectedNode?.data?.label || "").trim(),
        techText: String(
          aggregatedDescription || selectedNode?.data?.description || "",
        ).trim(),
      }),
    ).unwrap();
  };

  // раскрыть следующий из очереди активной сессии
  const handleExpandNext = async () => {
    if (!nodeChainRootId) return;
    await dispatch(
      expandNextInQueue({ rootNodeId: nodeChainRootId }),
    ).unwrap();
  };

  const effectiveSources: TechnologySource[] =
    ((selectedNode?.data?.sources as TechnologySource[]) ?? sources) || [];

  const hasSources =
    Array.isArray(effectiveSources) && effectiveSources.length > 0;

  // aggregated у тебя сохраняется в node.data.description
  const hasAggregated =
    Boolean(selectedNode?.data?.sourcesAggregated) || aggStatus === "succeeded";

  // можно ли "получить цепочку" от этого продукта сейчас?
  const canInitChainHere =
    hasSources && hasAggregated && (!chainReady || !isActiveChainRoot);

  const initChainLabel =
    chainReady && !isActiveChainRoot
      ? "🧬 Продолжить граф: цепочка от этого продукта"
      : "🧬 Получить цепочку (chain)";

  const handleBuildProductCard = useCallback(
    async (options?: { customSystemPrompt?: string; selectedFields?: string[]; useWebSearch?: boolean }) => {
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
      <FlowPanel
        onClose={closePanel}
        isOpen={isPanelOpen}
        value={tempNodeLabel}
        onChangeValue={handleNodeNameChange}
        descriptionValue={tempNodeDescription}
        onChangeDescription={handleNodeDescriptionChange}
        onDelete={handleDeleteNode}
        nodeType={selectedNode?.type}
        buildDirection={buildDirection}
        onSetBuildDirection={handleSetDirection}
        onFindSources={handleFindSources}
        onAggregateSources={handleAggregateSources}
        sourcesLoading={sourcesLoading}
        sourcesError={sourcesError}
        // ⚠️ лучше передавать effectiveSources, чтобы переживало save/load
        sources={effectiveSources}
        aggregateLoading={aggregateLoading}
        aggregateError={aggregateError}
        // ⚠️ НЕ aggStatus, а реальный hasAggregated (см. ниже)
        hasAggregated={hasAggregated}
        chainLoading={chainBuild?.status === "loading"} // ✅ проще, без nodeId
        chainError={chainError}
        chainReady={chainReady}
        chainUiEnabled={chainUiEnabled}
        isActiveChainRoot={isActiveChainRoot}
        canInitChainHere={canInitChainHere}
        initChainLabel={initChainLabel}
        onInitChain={handleInitChain}
        queueLen={queueLen}
        chainPid={queuePid} // ✅ вот это важно
        producerOptions={producerOptions} // ✅ для queuePid
        selectedProducerId={selectedProducerId}
        onSelectProducer={handleSelectProducer}
        builtProducerIds={builtProducerIds} // ✅ для queuePid
        onExpandNext={isActiveChainRoot ? handleExpandNext : undefined}
        onBuildProductCard={handleBuildProductCard}
        productCardStatus={selectedNode?.data?.productCardStatus}
        productCardError={selectedNode?.data?.productCardError}
        productCard={selectedNode?.data?.productCard}
      />
    </div>
  );
};
