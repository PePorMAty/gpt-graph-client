// components/Flow.tsx
import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ConnectionLineType,
  type Node,
  type OnConnect,
  type OnReconnect,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  useReactFlow,
  useStoreApi,
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
  removeNodes,
  addNode,
  setGraphData,
  loadGraphFromFile,
  createStepAlternativeNodes,
  removeStepAlternativeNodes,
  insertTransformationsForNeighbors,
  addSourcesToPool,
} from "./store/slices/gptSlice";
import { setOpenedGraph } from "./store/slices/savedGraphSlice";
import { openGraphExtras } from "./store/graphExtras";
import { useAppSelector, useAppDispatch } from "./store/hooks";
import { FlowPanel } from "./components/flow-panel";
import { Notification } from "./components/notification";
import { ProductNode, TransformationNode } from "./components/nodes";

import { SaveGraphModal } from "./components/save-graph-modal";
import { useSaveGraph } from "./hooks/useSaveGraph";
import { buildSaveGraphPayload } from "./utils/buildSaveGraphPayload";
import { getLeafNodes } from "./utils/getLeafNodes";
import { layoutTree } from "./utils/layoutTree";
import { centerTreeOnRoot } from "./utils/centerTreeOnRoot";
import { findChainNodeIds } from "./utils/findChainNodeIds";
import { countProductSourcesByDirection } from "./utils/sourcesBadge";
import { collectSourceGroups } from "./utils/sourceRows";
import { onFitViewRequest } from "./utils/requestFitView";
import { collapseToProductsView } from "./utils/productsOnlyView";
import {
  buildFocusSubgraph,
  focusScopeDepths,
  type FocusScope,
  type FocusSubgraphResult,
} from "./utils/focusSubgraph";
import { focusLayoutSpacing } from "./utils/focusLayoutSpacing";
import {
  animateFocusTransition,
  nodesBounds,
  FOCUS_TRANSITION_MS,
  type FocusTransitionHandle,
} from "./utils/focusTransition";
import { applyHandlesByGeometry } from "./utils/normalize-edges";
import { inferLayoutDirection } from "./utils/inferLayoutDirection";
import { enrichSourcesFromNodes } from "./utils/enrichSourcesFromNodes";
// Автосейв полотна в sessionStorage: страховка от перезагрузки/зависания
// вкладки, а не постоянное хранилище (постоянное — сохранение на сервер).
import { clearCanvas, AUTOSAVE_KEY } from "./utils/clearCanvas";
import { GraphToolbar } from "./components/graph-toolbar/GraphToolbar";
import {
  CanvasTools,
  type CanvasMode,
} from "./components/canvas-tools/CanvasTools";
import { CanvasMinimap } from "./components/canvas-minimap/CanvasMinimap";
import styles from "./styles/Flow.module.css";
import type { CustomNode } from "./types";
import type { BuildDirection, TechnologySource } from "./store/types";
import { aggregateSources, fetchSources } from "./store/api/sources-api";
import {
  sourcesKey,
  setBuildMode,
  clearStepState,
  resetStepBuild,
  setStepAggregatedText,
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
  forceStepPreview,
  undoLastStep,
  setStepChainContinueProduct,
  sourcesPoolKey,
} from "./store/slices/gptSlice";
import type { DirectionTabProps } from "./components/flow-panel/types";
import {
  parseAlternatives,
  dedupeAlternatives,
  alternativeKey,
} from "./utils/parseAlternatives";
import { NodeContextMenu } from "./components/node-context-menu";
import {
  addBookmark,
  removeBookmark,
} from "./store/slices/bookmarksSlice";
import { PaneContextMenu } from "./components/node-context-menu/PaneContextMenu";
import { ConfirmDeleteModal } from "./components/confirm-delete-modal";
import { ConfirmUnsavedModal } from "./components/ui/ConfirmUnsavedModal";
import { graphSignature } from "./utils/graphSignature";
import { SelectNeighborModal } from "./components/select-neighbor-modal";
import {
  getDirectProductNeighbors,
  type DirectProductNeighbor,
} from "./utils/getDirectProductNeighbors";
import { getLinkedProducts } from "./utils/getLinkedProducts";
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
  const {
    data,
    isLoading,
    error,
    rootId,
    source,
    chainBuild,
    leafNodes,
    hasMore,
    originalPrompt,
  } = useAppSelector((store) => store.graph);
  const sourcesByNodeId = useAppSelector((s) => s.sources.byNodeId);
  const savedSignature = useAppSelector((s) => s.savedGraphs.savedSignature);

  const { fitView, fitBounds, setViewport, setCenter, screenToFlowPosition, getNodes } =
    useReactFlow();
  const rfStore = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const hasFittedView = useRef(false);

  useEffect(() => {
    // В режиме просмотра по ссылке граф приходит с сервера — не перетираем его
    // содержимым автосейва.
    if (sharedView) return;
    try {
      // Автосейв текущей сессии приоритетнее устаревшего ручного
      // localStorage-сейва (кнопка теперь сохраняет на сервер, но старый
      // сейв у пользователей мог остаться — не теряем его).
      const raw =
        sessionStorage.getItem(AUTOSAVE_KEY) ??
        localStorage.getItem("saved-graph");
      if (!raw) return;
      const saved = JSON.parse(raw);
      const nodes = saved.nodes;
      const edges = Array.isArray(saved.edges) ? saved.edges : [];
      if (!Array.isArray(nodes) || !nodes.length) return;
      // loadGraphFromFile (а не setGraphData): восстанавливает rootId, пул
      // источников и реестр цветов легенды по данным узлов.
      dispatch(
        loadGraphFromFile({
          nodes,
          edges,
          leafNodes: Array.isArray(saved.leaf_nodes)
            ? saved.leaf_nodes
            : getLeafNodes(nodes, edges),
          hasMore: !!saved.has_more,
          originalPrompt:
            typeof saved.prompt === "string" ? saved.prompt : null,
          sourcesPool: saved.sources?.pool,
          sourcesSeqCounter: saved.sources?.seqCounter,
        }),
      );
      // Привязка к открытому сохранённому графу переживает перезагрузку —
      // «Обновить …» продолжит писать в тот же файл.
      if (saved.openedGraph?.id) {
        dispatch(setOpenedGraph(saved.openedGraph));
        // Закладки и история графа лежат на сервере: после перезагрузки
        // вкладки поднимаем их оттуда, а не начинаем с пустых списков.
        dispatch(openGraphExtras(saved.openedGraph.id));
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

  // Режим «только продукты»: преобразования/альтернативы скрыты, продукты
  // склеены напрямую. Чистая проекция для рендера — store не мутируется,
  // выключение возвращает полный граф. Пока включён — полу-просмотр:
  // структурные правки заблокированы (двигать ноды и открывать карточки можно).
  const [productsOnly, setProductsOnly] = useState(false);
  // Режим указателя на полотне (правый рельс): выбор / рука / рамка.
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("select");
  // Живой ref: обработчики полотна создаются один раз и иначе видели бы
  // режим, актуальный на момент их создания.
  const canvasModeRef = useRef(canvasMode);
  canvasModeRef.current = canvasMode;
  // Меню по правому клику на пустом месте (добавление узла).
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Слой данных ГИСП. Подключения к базе ещё нет, поэтому включённый слой
  // пока ничего не рисует — узлы не несут признака подтверждения.
  const [industryData, setIndustryData] = useState(true);
  // Показывать альтернативные маршруты (alt-узлы и их связи).
  const [showAlternatives, setShowAlternatives] = useState(true);

  // Фокус-режим («как в TheBrain»): в центре — фокус-узел, вокруг видна
  // окрестность на focusDepth шагов; клик по видимому продукту делает его
  // новым центром. Чистая проекция для рендера со СВОЕЙ раскладкой — store
  // не мутируется, выключение возвращает полный граф с исходными позициями.
  const [focusState, setFocusState] = useState<{
    focusId: string;
    history: string[];
  } | null>(null);
  const [focusDepth, setFocusDepth] = useState(2);
  // Охват окрестности: шаги (стандарт) / только родители и дети / вся
  // цепочка узла. Переживает навигацию и повторный вход в режим.
  const [focusScope, setFocusScope] = useState<FocusScope>("steps");
  // Разложенная окрестность фокуса (готовые позиции + рёбра с хэндлами).
  const [focusView, setFocusView] = useState<FocusSubgraphResult | null>(null);
  const focusOn = focusState !== null;
  // Живой ref текущей (в т.ч. промежуточной, во время анимации) проекции —
  // новый переход стартует ровно с того кадра, на котором прервали старый.
  const focusViewRef = useRef(focusView);
  focusViewRef.current = focusView;
  // Идущая анимация перехода между окрестностями.
  const focusAnimRef = useRef<FocusTransitionHandle | null>(null);
  // Обёртка панели над холстом — для замера её высоты при подгонке камеры.
  const toolbarWrapRef = useRef<HTMLDivElement | null>(null);
  // Узел, на котором закончилась навигация в фокус-режиме. При выходе камера
  // подлетает к нему в полном графе, а не разлетается на всё полотно: иначе
  // на графе в сотни узлов теряется место, откуда вышли.
  const focusExitNodeIdRef = useRef<string | null>(null);

  // Подгонка камеры под окрестность с учётом панели над холстом: fitBounds
  // умеет только равномерный отступ, из-за чего верхний узел раскладки
  // (предок, к которому чаще всего и шагают) оказывался ровно под панелью, и
  // она перехватывала клики. Считаем вьюпорт сами: равные отступы по краям +
  // высота панели дополнительно сверху.
  const fitFocusCamera = useCallback(
    (nodes: CustomNode[], duration: number) => {
      const b = nodesBounds(nodes);
      const { width, height } = rfStore.getState();
      if (!width || !height || b.width <= 0 || b.height <= 0) {
        fitBounds(b, { padding: 0.25, duration });
        return;
      }
      const toolbar = toolbarWrapRef.current;
      const pad = Math.max(32, Math.min(width, height) * 0.06);
      const topPad = (toolbar ? toolbar.offsetHeight + 12 : 0) + pad;
      const zoom = Math.min(
        1.25,
        Math.max(
          0.1,
          Math.min(
            (width - pad * 2) / b.width,
            (height - topPad - pad) / b.height,
          ),
        ),
      );
      setViewport(
        {
          x: pad + (width - pad * 2 - b.width * zoom) / 2 - b.x * zoom,
          y: topPad + (height - topPad - pad - b.height * zoom) / 2 - b.y * zoom,
          zoom,
        },
        { duration },
      );
    },
    [rfStore, fitBounds, setViewport],
  );
  // Живой ref для обработчиков, подписанных один раз (highlight-node, клики).
  const focusStateRef = useRef(focusState);
  focusStateRef.current = focusState;
  // Последний узел, с которым взаимодействовал пользователь (клик, контекстное
  // меню, выбор в поиске, навигация в фокус-режиме). В отличие от
  // selectedNodeId переживает закрытие карточки (closePanel его зануляет) —
  // именно от этого узла отталкивается вход в фокус-режим.
  const lastInteractedNodeIdRef = useRef<string | null>(null);

  // При переключении «только продукты» или выходе из фокус-режима состав
  // холста меняется — переавтоцентрируем граф. Первый рендер пропускаем.
  const viewModeFirstRun = useRef(true);
  useEffect(() => {
    if (viewModeFirstRun.current) {
      viewModeFirstRun.current = false;
      return;
    }
    // В фокус-режиме камерой управляет эффект раскладки окрестности; сюда
    // попадаем при выходе из него (focusOn → false).
    if (focusOn) return;

    // Выход из фокус-режима: вместо разлёта на всё полотно подлетаем к узлу,
    // на котором закончили навигацию, и подсвечиваем его — на большом графе
    // иначе непонятно, откуда вышли. Узел заодно остаётся выделенным.
    const exitId = focusExitNodeIdRef.current;
    focusExitNodeIdRef.current = null;
    if (exitId) {
      const node = nodesRef.current.find((n) => n.id === exitId);
      if (node) {
        const id = requestAnimationFrame(() => {
          const w = node.measured?.width ?? 0;
          const h = node.measured?.height ?? 0;
          setCenter(node.position.x + w / 2, node.position.y + h / 2, {
            zoom: 1.3,
            duration: 600,
          });
          // Подсветка (снимется сама) + выделение, чтобы узел не потерялся
          // после того, как подсветка погаснет.
          window.dispatchEvent(
            new CustomEvent("highlight-node", { detail: exitId }),
          );
          dispatch(
            onNodesChange([
              { id: exitId, type: "select" as const, selected: true },
            ]),
          );
        });
        return () => cancelAnimationFrame(id);
      }
    }

    const id = requestAnimationFrame(() =>
      fitView({ padding: 0.2, duration: 300 }),
    );
    return () => cancelAnimationFrame(id);
  }, [productsOnly, focusOn, fitView, setCenter, dispatch]);

  // Ориентация раскладки фокус-окрестности — из геометрии текущего графа,
  // чтобы фокус-вид не переворачивался относительно полотна.
  const focusLayoutDirection = useMemo(
    () => inferLayoutDirection(data.nodes, data.edges),
    [data.nodes, data.edges],
  );

  // Перестройка окрестности фокуса: вход в режим, смена фокуса/глубины или
  // изменение данных графа. Подграф раскладывается заново (dagre/ELK),
  // позиции узлов в store не трогаются.
  const focusFitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusState) {
      focusAnimRef.current?.cancel();
      focusAnimRef.current = null;
      setFocusView(null);
      focusFitKeyRef.current = null;
      return;
    }
    // Фокус-узел мог исчезнуть из store (undo шага и т.п.) — выходим из режима.
    if (!data.nodes.some((n) => n.id === focusState.focusId)) {
      setFocusState(null);
      return;
    }
    // Любая смена фокуса (клик, «назад», крошки, поиск) — это взаимодействие:
    // повторный вход в режим продолжит с последнего центра.
    lastInteractedNodeIdRef.current = focusState.focusId;
    let cancelled = false;
    (async () => {
      // Глубины обхода заданы в терминах рёбер (up — по входящим), а охваты
      // «↑ Вверх»/«↓ Вниз» пользователь читает визуально. В «вверх»-графе
      // (rankdir BT) входящие рёбра ведут ВНИЗ полотна, поэтому направления
      // меняем местами — иначе кнопки работали бы зеркально экрану.
      const depths = focusScopeDepths(focusScope, focusDepth);
      const sub = buildFocusSubgraph(
        data.nodes,
        data.edges,
        focusState.focusId,
        focusLayoutDirection === "BT"
          ? { up: depths.down, down: depths.up }
          : depths,
      );
      // Ориентацию берём из геометрии полного графа, а не хардкодим: у
      // «вверх»-графов рёбра идут продукт → сырьё, и жёсткий "TB" переворачивал
      // окрестность зеркально тому, что видно на полотне вне фокус-режима.
      // Зазоры зависят от охвата: чем больше рангов в окрестности, тем плотнее
      // ставим узлы, иначе камера отъезжает и подписи мельчают.
      const laid = await layoutTree(
        sub.nodes,
        sub.edges,
        focusState.focusId,
        focusLayoutDirection,
        focusLayoutSpacing(sub.nodes, sub.edges),
      );
      if (cancelled) return;
      const centered = centerTreeOnRoot(laid.nodes, focusState.focusId);
      const next: FocusSubgraphResult = {
        nodes: centered,
        // Хэндлы из store соответствуют геометрии полного графа —
        // переназначаем по позициям фокус-раскладки.
        edges: applyHandlesByGeometry(centered, sub.edges),
      };

      focusAnimRef.current?.cancel();
      focusAnimRef.current = null;

      const prev = focusViewRef.current;
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Камера: границы целевой окрестности считаем сами (nodesBounds), не
      // полагаясь на внутренний стор React Flow — иначе fitView до коммита
      // новых нод подгонял бы камеру под старую раскладку. Двигаем только при
      // смене фокуса/охвата/глубины, а не на каждое фоновое обновление данных.
      const fitKey = `${focusState.focusId}::${focusScope}::${focusDepth}`;
      const cameraMoves = focusFitKeyRef.current !== fitKey;
      focusFitKeyRef.current = fitKey;

      // Первый показ окрестности (вход в режим) или запрет анимаций в системе —
      // мгновенный показ без анимации узлов.
      if (!prev || reduceMotion) {
        setFocusView(next);
        if (cameraMoves) {
          fitFocusCamera(next.nodes, reduceMotion ? 0 : 400);
        }
        return;
      }

      // Переход между окрестностями: остающиеся узлы переезжают, уходящие
      // гаснут, новые расцветают из точки клика. Камера едет к новой
      // окрестности одновременно с узлами.
      if (cameraMoves) {
        fitFocusCamera(next.nodes, FOCUS_TRANSITION_MS);
      }
      focusAnimRef.current = animateFocusTransition(prev, next, {
        focusId: focusState.focusId,
        onFrame: (view) => setFocusView(view),
        onDone: () => {
          focusAnimRef.current = null;
          setFocusView(next);
        },
      });
    })();
    return () => {
      cancelled = true;
      // Смена цели во время полёта: текущий кадр остаётся на экране, новый
      // переход подхватит его из focusViewRef как стартовый.
      focusAnimRef.current?.cancel();
      focusAnimRef.current = null;
    };
  }, [
    focusState,
    focusScope,
    focusDepth,
    focusLayoutDirection,
    data.nodes,
    data.edges,
    fitFocusCamera,
  ]);

  // После смены состава фокус-окрестности даём React Flow измерить ноды в DOM
  // и переставляем хэндлы (тот же приём, что для полного графа выше).
  useEffect(() => {
    if (!focusView) return;
    const timer = setTimeout(() => {
      updateNodeInternals(focusView.nodes.map((n) => n.id));
    }, 100);
    return () => clearTimeout(timer);
  }, [focusView, updateNodeInternals]);

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
  // Единый флаг «только чтение»: шар-ссылка ИЛИ включённый режим просмотра
  const readOnly = sharedView;
  // Структурные правки заблокированы: просмотр, «только продукты» или
  // фокус-режим (последние два — проекции, store в них не редактируется).
  const structureLocked = readOnly || productsOnly || focusOn;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Всплывающая подсказка о сохранении
  const [isSavedToastVisible, setIsSavedToastVisible] = useState(false);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSavedNotification = useCallback(() => {
    setIsSavedToastVisible(true);
    if (savedToastTimerRef.current) {
      clearTimeout(savedToastTimerRef.current);
    }
    savedToastTimerRef.current = setTimeout(() => {
      setIsSavedToastVisible(false);
    }, 2000);
  }, []);

  // Очистка таймера подсказки при размонтировании
  useEffect(() => {
    return () => {
      if (savedToastTimerRef.current) {
        clearTimeout(savedToastTimerRef.current);
      }
    };
  }, []);

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
    // В фокус-режиме окрестность и так обрезана — hover-затемнение не нужно.
    if (source !== "loaded" || !hoveredChainId || focusOn) return null;
    return findChainNodeIds(
      data.edges,
      hoveredChainId,
      (id) => nodeTypeById.get(id),
    );
  }, [source, hoveredChainId, data.edges, nodeTypeById, focusOn]);

  // Context menu & panel mode
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  // Узлы с закладкой — для пункта контекстного меню «убрать/добавить».
  const bookmarks = useAppSelector((s) => s.bookmarks.items);
  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.map((b) => b.nodeId)),
    [bookmarks],
  );
  // Узлы, ожидающие подтверждения удаления (одна нода или группа выделенных).
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  );

  // ===== Фокус-режим: вход/выход/навигация =====

  // Вход. Центр подбираем от «на чём был фокус пользователя», по приоритету:
  // открытая карточка → выделенный на полотне узел → последний узел, с
  // которым взаимодействовали (переживает закрытие карточки) → корень →
  // первый продукт графа.
  const enterFocusMode = useCallback(() => {
    const nodes = nodesRef.current;
    const isValid = (id: string | null | undefined): id is string =>
      !!id && nodes.some((n) => n.id === id);

    const rfSelected =
      nodes.find((n) => n.selected && n.type === "product") ??
      nodes.find((n) => n.selected);

    let initial: string | undefined;
    if (isValid(selectedNodeId)) initial = selectedNodeId;
    else if (rfSelected) initial = rfSelected.id;
    else if (isValid(lastInteractedNodeIdRef.current))
      initial = lastInteractedNodeIdRef.current;
    else if (isValid(rootId)) initial = rootId;
    else initial = (nodes.find((n) => n.type === "product") ?? nodes[0])?.id;

    if (!initial) return;

    // Снимаем выделение на полотне: в фокус-режиме select-изменения в store
    // не проходят, и устаревший флаг иначе перебил бы последний центр при
    // повторном входе.
    const currentlySelected = nodes.filter((n) => n.selected);
    if (currentlySelected.length) {
      dispatch(
        onNodesChange(
          currentlySelected.map((n) => ({
            id: n.id,
            type: "select" as const,
            selected: false,
          })),
        ),
      );
    }

    setIsPanelOpen(false);
    setContextMenu(null);
    setFocusState({ focusId: initial, history: [] });
  }, [selectedNodeId, rootId, dispatch]);

  // Выход по кнопке: запоминаем последний центр, чтобы камера подлетела
  // к нему в полном графе (см. эффект переавтоцентровки выше).
  const exitFocusMode = useCallback(() => {
    focusExitNodeIdRef.current = focusStateRef.current?.focusId ?? null;
    setFocusState(null);
  }, []);

  // Сделать узел новым центром (клик по продукту / выбор в поиске).
  // Если узел уже есть в пути (хлебных крошках) — не наращиваем хвост дублями,
  // а откатываем историю к нему, как при клике по крошке: П1→П2→П3, затем
  // шаги по графу обратно в П2 и П1 схлопывают путь до одного «П1». То же
  // при выходе на пройденный продукт другим маршрутом. Дублей в истории при
  // таком инварианте не бывает, indexOf находит единственное вхождение.
  const focusOnNode = useCallback((nodeId: string) => {
    setFocusState((s) => {
      if (!s || s.focusId === nodeId) return s;
      const idx = s.history.indexOf(nodeId);
      if (idx !== -1) {
        return { focusId: nodeId, history: s.history.slice(0, idx) };
      }
      return { focusId: nodeId, history: [...s.history, s.focusId] };
    });
  }, []);

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
  const sourcesSeqCounter = useAppSelector((s) => s.graph.sourcesSeqCounter);
  const needsFreshSources = useAppSelector((s) => s.graph.needsFreshSources);
  const stepSessionKey = (nodeId: string, dir: BuildDirection) =>
    `step::${nodeId}::${dir}`;
  // Ключ пула ОБЯЗАН совпадать с sourcesPoolKey (запись пула в gptSlice).
  // Локальная копия со слабой нормализацией расходилась с записью на именах
  // с дефисами («Олефин-богатый…») — источники «не клались» в продукт.
  const poolKey = sourcesPoolKey;

  // Flow.tsx
  const productsView = useMemo(
    () =>
      productsOnly ? collapseToProductsView(data.nodes, data.edges) : null,
    [productsOnly, data.nodes, data.edges],
  );

  const flowNodes = useMemo(
    () =>
      // Приоритет проекций: фокус-режим > «только продукты» > полный граф.
      // Выключенные альтернативы отсекаются последними — от проекции это не
      // зависит, alt-узлы одинаковы во всех.
      (focusView?.nodes ?? productsView?.nodes ?? data.nodes)
        .filter((n) => showAlternatives || n.data?.chainVariant !== "alt")
        .map((n) => {
        const isAlt = n.data?.chainVariant === "alt";
        const isDimmed = chainSet ? !chainSet.has(n.id) : false;
        const isFocusCenter = n.id === focusState?.focusId;

        const cls = [
          n.id === highlightedId ? "node--highlight" : "",
          isAlt ? "node--alt" : "",
          isDimmed ? "node--dimmed" : "",
          isFocusCenter ? "node--focus" : "",
        ]
          .filter(Boolean)
          .join(" ");

        // Крупная подпись — только у фокус-проекции: в полном графе и в
        // «только продукты» узлы остаются прежними.
        const compact = !!focusView;

        // Бейджи «↑ 📖 N / ↓ 📖 N» рисуем для любого product-узла, у которого
        // есть записи в sourcesPool: пошаговый поиск, восстановленный сейв или
        // объединённый граф. Кладём только в копию data для рендера.
        if (n.type === "product") {
          const lbl = String(n.data?.label ?? "");
          const badge = countProductSourcesByDirection(
            sourcesPool[poolKey(lbl, "down")],
            sourcesPool[poolKey(lbl, "up")],
          );
          const hasBadge = badge.up > 0 || badge.down > 0;
          // Слой ГИСП: узел сам решает, показывать ли бейдж — пока база не
          // подключена, gispProducers ни у кого нет и бейдж не появляется.
          return {
            ...n,
            className: cls,
            data: {
              ...n.data,
              ...(hasBadge ? { sourcesBadge: badge } : {}),
              ...(compact ? { focusCompact: true } : {}),
              showIndustryData: industryData,
            },
          };
        }

        return compact
          ? { ...n, className: cls, data: { ...n.data, focusCompact: true } }
          : { ...n, className: cls };
      }),
    [
      data.nodes,
      productsView,
      focusView,
      focusState,
      highlightedId,
      chainSet,
      sourcesPool,
      showAlternatives,
      industryData,
    ],
  );

  const flowEdges = useMemo(() => {
    const base = focusView?.edges ?? productsView?.edges ?? data.edges;
    // Скрытые альтернативы уносят с собой и свои рёбра — иначе связь
    // повисала бы в пустоте.
    const visibleIds = new Set(flowNodes.map((n) => n.id));
    const baseEdges = showAlternatives
      ? base
      : base.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    if (!chainSet) return baseEdges;
    return baseEdges.map((e) => {
      const bothIn = chainSet.has(e.source) && chainSet.has(e.target);
      if (bothIn) return e;
      const existing = e.className ?? "";
      const cls = [existing, "edge--dimmed"].filter(Boolean).join(" ");
      return { ...e, className: cls };
    });
  }, [data.edges, productsView, focusView, chainSet, flowNodes, showAlternatives]);

  // Просьба извне вписать граф в экран (открытие графа из библиотеки,
  // объединение). Узлы к моменту события ещё не измерены React Flow, а по
  // неизмеренным fitView считает границы неверно — ждём измерения, но не
  // дольше секунды, иначе на пустом графе ждали бы вечно.
  useEffect(() => {
    let raf = 0;

    const fitWhenMeasured = (deadline: number) => {
      const nodes = getNodes();
      const measured =
        nodes.length > 0 && nodes.every((n) => n.measured?.width);
      if (measured || performance.now() > deadline) {
        if (nodes.length) fitView({ padding: 0.2, duration: 400 });
        return;
      }
      raf = requestAnimationFrame(() => fitWhenMeasured(deadline));
    };

    const unsubscribe = onFitViewRequest(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        fitWhenMeasured(performance.now() + 1000),
      );
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, [fitView, getNodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      // В фокус-режиме найденный в поиске узел может быть вне окрестности —
      // делаем его новым центром, поиск работает как навигация. Если узел уже
      // в центре, просто возвращаем камеру к окрестности (панель поиска
      // успела улететь setCenter'ом к позиции узла в полном графе).
      lastInteractedNodeIdRef.current = id;
      const fs = focusStateRef.current;
      if (fs) {
        if (fs.focusId !== id) {
          focusOnNode(id);
        } else {
          requestAnimationFrame(() =>
            fitView({ padding: 0.25, duration: 400 }),
          );
        }
      }
      setHighlightedId(id);

      setTimeout(() => setHighlightedId(null), 3000);
    };

    window.addEventListener("highlight-node", handler);
    return () => window.removeEventListener("highlight-node", handler);
  }, [focusOnNode, fitView]);

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

  // saveChanges объявлен ниже (ему нужны temp-поля), а клик по узлу — здесь:
  // держим ссылку на актуальную версию, чтобы не тасовать порядок хуков.
  const saveChangesRef = useRef<() => boolean>(() => false);

  // Обработчик клика по узлу
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Режим «рука» — только панорамирование: карточку не открываем, иначе
      // она выскакивает при каждой попытке подвинуть холст «за узел».
      if (canvasModeRef.current === "pan") return;
      // При наборе группового выделения (зажат Shift/Ctrl/Cmd) не открываем
      // панель редактирования — пользователь выделяет несколько нод.
      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
      lastInteractedNodeIdRef.current = node.id;
      // Фокус-режим: клик по продукту (кроме текущего центра) — шаг
      // навигации, узел становится новым центром. Карточка узла — по клику
      // на сам центр или на преобразование.
      const fs = focusStateRef.current;
      if (fs && node.type === "product" && node.id !== fs.focusId) {
        focusOnNode(node.id);
        return;
      }
      // Карточка больше не блокирует полотно, поэтому по клику она может
      // ПЕРЕКЛЮЧИТЬСЯ на другой узел — правки предыдущего фиксируем до смены
      // (blur поля обычно успевает, но на клик мимо полей рассчитывать нельзя).
      if (node.id !== selectedNodeId) saveChangesRef.current();
      setSelectedNodeId(node.id);
      setIsPanelOpen(true);
      setContextMenu(null);
    },
    [focusOnNode, selectedNodeId],
  );

  // Hover-подсветка цепочки (только для загруженных графов;
  // useMemo сам зануляет chainSet при source !== "loaded").
  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoveredChainId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => {
    setHoveredChainId(null);
  }, []);

  // Выделенные узлы (групповое выделение через Shift+рамку / Ctrl+клик).
  const selectedNodes = useMemo(
    () => data.nodes.filter((n) => n.selected),
    [data.nodes],
  );

  // Обработчик правого клика по узлу
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      lastInteractedNodeIdRef.current = node.id;
      // Вариант 1: ПКМ по ноде вне текущего выделения сбрасывает выделение
      // до этой одной ноды, чтобы подсветка совпадала с целью меню.
      const currentlySelected = data.nodes.filter((n) => n.selected);
      const isNodeSelected = currentlySelected.some((n) => n.id === node.id);
      if (!isNodeSelected) {
        const changes: NodeChange[] = [
          ...currentlySelected.map((n) => ({
            id: n.id,
            type: "select" as const,
            selected: false,
          })),
          { id: node.id, type: "select" as const, selected: true },
        ];
        dispatch(onNodesChange(changes));
      }
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [data.nodes, dispatch],
  );

  // Карточка узла и панель раздела (источники, закладки, история) занимают
  // одно место слева, и панель над холстом сдвигается на их ширину. Каркас
  // живёт выше Flow, поэтому состояние карточки уходит ему событием.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("node-card-toggle", { detail: { open: isPanelOpen } }),
    );
  }, [isPanelOpen]);

  // Клик по пустому пространству — закрыть контекстные меню
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setPaneMenu(null);
  }, []);

  // Правый клик по пустому месту — меню добавления узла. В режиме рамки
  // правая кнопка не занята меню: там ею удобно доводить выделение.
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (readOnly || focusOn || canvasModeRef.current === "marquee") return;
      event.preventDefault();
      setContextMenu(null);
      setPaneMenu({ x: event.clientX, y: event.clientY });
    },
    [readOnly, focusOn],
  );

  // Узел появляется там, где вызвали меню, а не в центре экрана.
  const handleAddNodeAt = useCallback(
    (type: "product" | "transformation") => {
      if (!paneMenu) return;
      dispatch(
        addNode({
          type,
          position: screenToFlowPosition({ x: paneMenu.x, y: paneMenu.y }),
        }),
      );
      setPaneMenu(null);
    },
    [paneMenu, dispatch, screenToFlowPosition],
  );

  /** Поставить или снять закладку на узле. */
  const toggleBookmarkFor = useCallback(
    (nodeId: string) => {
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (bookmarkedIds.has(node.id)) {
        dispatch(removeBookmark(node.id));
      } else {
        dispatch(
          addBookmark({
            nodeId: node.id,
            label: String(node.data?.label ?? ""),
            kind: node.type === "transformation" ? "transformation" : "product",
          }),
        );
      }
    },
    [data.nodes, bookmarkedIds, dispatch],
  );

  // Закладка узла из контекстного меню.
  const handleToggleBookmark = useCallback(() => {
    if (!contextMenu) return;
    toggleBookmarkFor(contextMenu.nodeId);
    setContextMenu(null);
  }, [contextMenu, toggleBookmarkFor]);

  // Из контекстного меню → показать модалку подтверждения удаления.
  // Если правый клик пришёлся на ноду из группового выделения (>1) — удаляем
  // всю группу, иначе только одну ноду.
  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    const selectedIds = data.nodes
      .filter((n) => n.selected)
      .map((n) => n.id);
    const ids =
      selectedIds.length > 1 && selectedIds.includes(contextMenu.nodeId)
        ? selectedIds
        : [contextMenu.nodeId];
    setPendingDeleteIds(ids);
    setContextMenu(null);
  }, [contextMenu, data.nodes]);

  // Из карточки продукта → открыть модалку «Получить преобразования к соседним
  // продуктам» (SelectNeighborModal) для выбранной ноды.
  const handleOpenFetchTransformations = useCallback(() => {
    if (!selectedNodeId) return;
    const node = data.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    const outgoing = getDirectProductNeighbors(
      selectedNodeId,
      data.nodes,
      data.edges,
    ).filter((n) => n.role === "outgoing");
    if (!outgoing.length) return;
    setInsertTrState({
      nodeId: selectedNodeId,
      productLabel: String(node.data?.label ?? ""),
      neighbors: outgoing,
      loading: false,
      error: null,
      customSystemPrompt: defaultTransformationsBetweenPrompt,
      isPromptDirty: false,
    });
  }, [selectedNodeId, data.nodes, data.edges, defaultTransformationsBetweenPrompt]);

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

  // Outgoing-соседи выбранной ноды — для кнопки «Получить преобразования…»
  // в карточке продукта.
  const selectedNodeHasOutgoingNeighbors = useMemo(() => {
    if (!selectedNodeId) return false;
    return getDirectProductNeighbors(
      selectedNodeId,
      data.nodes,
      data.edges,
    ).some((n) => n.role === "outgoing");
  }, [selectedNodeId, data.nodes, data.edges]);

  // Подтверждение удаления (одна нода или группа выделенных)
  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;

    for (const id of pendingDeleteIds) {
      for (const dir of ["down", "up"] as const) {
        dispatch(clearStepState({ nodeId: id, direction: dir }));
      }
    }

    dispatch(removeNodes(pendingDeleteIds));

    const removedSelected =
      selectedNodeId !== null && pendingDeleteIds.includes(selectedNodeId);
    setPendingDeleteIds(null);

    if (removedSelected) {
      setIsPanelOpen(false);
      setTimeout(() => {
        setSelectedNodeId(null);
        setTempNodeLabel("");
        setTempNodeDescription("");
        setInitialLabel("");
        setInitialDescription("");
      }, 300);
    }
  }, [pendingDeleteIds, selectedNodeId, dispatch]);

  // Удаление выделенных нод клавишей Delete/Backspace (с подтверждением).
  // Игнорируем нажатия в полях ввода, чтобы не удалять ноды при правке текста.
  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const ids = data.nodes.filter((n) => n.selected).map((n) => n.id);
      if (ids.length === 0) return;
      e.preventDefault();
      setPendingDeleteIds(ids);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly, data.nodes]);

  // Сохранение изменённых полей узла (имя/описание).
  // Возвращает true, если что-то действительно было сохранено.
  const saveChanges = useCallback(() => {
    if (!selectedNodeId) return false;

    const updatedData: { label?: string; description?: string } = {};

    if (tempNodeLabel !== initialLabel) {
      updatedData.label = tempNodeLabel;
    }

    if (tempNodeDescription !== initialDescription) {
      updatedData.description = tempNodeDescription;
    }

    if (Object.keys(updatedData).length === 0) return false;

    dispatch(
      updateNodeData({
        nodeId: selectedNodeId,
        data: updatedData,
      }),
    );

    // Обновляем "исходные" значения, чтобы повторный blur/закрытие
    // не сохраняли одно и то же ещё раз.
    setInitialLabel(tempNodeLabel);
    setInitialDescription(tempNodeDescription);

    return true;
  }, [
    selectedNodeId,
    tempNodeLabel,
    tempNodeDescription,
    initialLabel,
    initialDescription,
    dispatch,
  ]);

  useEffect(() => {
    saveChangesRef.current = saveChanges;
  }, [saveChanges]);

  // Сохранение при потере фокуса поля имени/описания + всплывающая подсказка
  const handleFieldBlur = useCallback(() => {
    if (saveChanges()) {
      showSavedNotification();
    }
  }, [saveChanges, showSavedNotification]);

  // Закрытие панели с сохранением изменений (на случай, если blur не сработал)
  const closePanel = useCallback(() => {
    saveChanges();

    setIsPanelOpen(false);
    setTimeout(() => {
      setSelectedNodeId(null);
      setTempNodeLabel("");
      setTempNodeDescription("");
      setInitialLabel("");
      setInitialDescription("");
    }, 300);
  }, [saveChanges]);

  // ─── Ссылки на связанные продукты в карточке ───
  // Соседние продукты выбранной ноды (напрямую или через преобразование) —
  // рендерятся в карточке продукта как кликабельные ссылки.
  const linkedProducts = useMemo(
    () =>
      selectedNodeId
        ? getLinkedProducts(selectedNodeId, data.nodes, data.edges)
        : [],
    [selectedNodeId, data.nodes, data.edges],
  );

  // Клик по ссылке-соседу: закрыть карточку текущего продукта (с сохранением
  // правок), перелететь к выбранной ноде, выделить и подсветить её.
  const handleFocusLinkedProduct = useCallback(
    (nodeId: string) => {
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Карточку не закрываем, а ПЕРЕКЛЮЧАЕМ на выбранный продукт: переход по
      // ссылке — это продолжение чтения, а не выход из него. saveChanges
      // фиксирует правки текущего узла до смены (закрывать панель незачем).
      saveChanges();
      setSelectedNodeId(nodeId);
      setIsPanelOpen(true);
      lastInteractedNodeIdRef.current = nodeId;

      // «Поймать фокус»: снять выделение с остальных нод, выделить цель.
      const changes: NodeChange[] = [
        ...data.nodes
          .filter((n) => n.selected && n.id !== nodeId)
          .map((n) => ({
            id: n.id,
            type: "select" as const,
            selected: false,
          })),
        { id: nodeId, type: "select" as const, selected: true },
      ];
      dispatch(onNodesChange(changes));

      // Перелёт к ноде: центр с учётом измеренных размеров (как в поиске).
      const w = node.measured?.width ?? 0;
      const h = node.measured?.height ?? 0;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1.3,
        duration: 600,
      });
      window.dispatchEvent(
        new CustomEvent("highlight-node", { detail: nodeId }),
      );
    },
    [data.nodes, dispatch, saveChanges, setCenter],
  );

  // Обработчик изменения имени узла
  const handleNodeNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  // Коммит markdown-описания (alt-нода): MarkdownEditor отдаёт готовую строку —
  // сразу пишем в node.data.description (минуя blur-путь textarea).
  const handleCommitDescription = useCallback(
    (text: string) => {
      setTempNodeDescription(text);
      if (!selectedNodeId) return;
      if (text !== initialDescription) {
        dispatch(
          updateNodeData({
            nodeId: selectedNodeId,
            data: { description: text },
          }),
        );
        setInitialDescription(text);
        showSavedNotification();
      }
    },
    [selectedNodeId, initialDescription, dispatch, showSavedNotification],
  );

  // Коммит обобщённого описания преобразования → node.data.aggregatedDescription.
  const handleCommitAggregatedDescription = useCallback(
    (text: string) => {
      if (!selectedNodeId) return;
      dispatch(
        updateNodeData({
          nodeId: selectedNodeId,
          data: { aggregatedDescription: text },
        }),
      );
      showSavedNotification();
    },
    [selectedNodeId, dispatch, showSavedNotification],
  );

  // Обработчики изменений узлов и ребер
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // В фокус-режиме на полотне проекция со своей раскладкой, а id узлов
      // совпадают со store — изменения не применяем вовсе: позиции/выделение
      // затёрли бы полный граф, а замеры размеров (dimensions) меняли бы
      // data.nodes посреди анимации перехода и перезапускали её. React Flow
      // держит замеры во внутреннем сторе, для рендера их достаточно.
      if (focusOn) return;
      dispatch(onNodesChange(changes));
    },
    [dispatch, focusOn],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // В режиме «только продукты» на полотне синтетические рёбра, которых нет
      // в сторе — их изменения не применяем. В фокус-режиме рёбра из стора,
      // но режим просмотровый — изменения тоже не применяем.
      if (productsOnly || focusOn) return;
      dispatch(onEdgesChange(changes));
    },
    [dispatch, productsOnly, focusOn],
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

  // ─── Per-direction handlers (factories) ───
  const handleFindSources = useCallback(
    (direction: BuildDirection) =>
      async (opts?: {
        customSystemPrompt?: string;
        maxItems?: number;
        allowedDomains?: string[];
      }) => {
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
            allowedDomains: opts?.allowedDomains,
          }),
        ).unwrap();
      },
    [dispatch, selectedNodeId, selectedNode],
  );

  const handleAggregateSources = useCallback(
    (direction: BuildDirection) =>
      async (
        customSystemPrompt?: string,
        customUserPrompt?: string,
        selectedSources?: TechnologySource[],
      ) => {
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
      // Пользователь мог отметить чекбоксами подмножество источников (3.1) —
      // тогда обобщаем только по ним.
      const payloadSources: TechnologySource[] =
        selectedSources && selectedSources.length
          ? selectedSources
          : (dirSources ?? sliceState?.sources ?? []);

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
        // Обобщённое описание шага продукта-якоря (markdown) — прокинем на
        // создаваемую transformation-ноду (см. stepToFlow / карточка преобразования).
        const anchorAggregatedText =
          sourcesByNodeId[sourcesKey(selectedNodeId, direction)]
            ?.stepAggregatedText ?? null;
        dispatch(
          acceptPendingStep({
            sessionKey: sKey,
            selectedContinueProductNodeId,
            filteredStep,
            anchorAggregatedText,
          }),
        );
        dispatch(resetStepBuild({ nodeId: selectedNodeId, direction }));
        // stepAggregatedText НЕ чистим: после построения основного пути
        // альтернативы должны остаться видимыми, и useEffect пересоздаст
        // alt-ноды по сохранённому тексту с переиспользованием их позиций.
      },
    [dispatch, selectedNodeId, sourcesByNodeId],
  );

  // Активные запросы поиска источников — по ключу продукт+направление.
  // Нужны, чтобы прервать долгий поиск: dispatch(thunk) возвращает промис
  // с методом abort().
  const stepSourcesRequestsRef = useRef<
    Record<string, { abort: (reason?: string) => void } & Promise<unknown>>
  >({});

  const handleCancelStepSources = useCallback(
    (direction: BuildDirection) => () => {
      if (!selectedNodeId) return;
      const runKey = sourcesKey(selectedNodeId, direction);
      const running = stepSourcesRequestsRef.current[runKey];
      if (!running) return;
      running.abort("cancelled-by-user");
      delete stepSourcesRequestsRef.current[runKey];
    },
    [selectedNodeId],
  );

  const handleFetchStepSourcesV2 = useCallback(
    (direction: BuildDirection) =>
      (opts?: {
        customSystemPrompt?: string;
        maxItems?: number;
        allowedDomains?: string[];
        provider?: string;
        model?: string;
      }) => {
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

      const running = dispatch(
        fetchStepSourcesV2({
          nodeId: selectedNodeId,
          productName,
          direction,
          ...(existingSources.length ? { existingSources } : {}),
          ...(opts?.customSystemPrompt ? { customSystemPrompt: opts.customSystemPrompt } : {}),
          ...(opts?.maxItems ? { maxItems: opts.maxItems } : {}),
          ...(opts?.allowedDomains?.length
            ? { allowedDomains: opts.allowedDomains }
            : {}),
          ...(opts?.provider ? { provider: opts.provider } : {}),
          ...(opts?.model ? { model: opts.model } : {}),
        }),
      );

      // Держим ссылку на запрос, чтобы его можно было прервать кнопкой.
      // Ключ по продукту+направлению: параллельные поиски не мешают друг другу.
      const runKey = sourcesKey(selectedNodeId, direction);
      stepSourcesRequestsRef.current[runKey] = running;
      void running.finally(() => {
        if (stepSourcesRequestsRef.current[runKey] === running) {
          delete stepSourcesRequestsRef.current[runKey];
        }
      });
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
    (direction: BuildDirection) =>
      (
        customSystemPrompt?: string,
        customUserPrompt?: string,
        selectedSources?: TechnologySource[],
        provider?: string,
        model?: string,
      ) => {
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

      // Отмеченное чекбоксами подмножество (3.1) имеет приоритет над полным пулом.
      const rawSources =
        selectedSources && selectedSources.length
          ? selectedSources
          : (sourcesPool[poolKey(productName, direction)]?.sources ?? []);
      if (!rawSources.length) return;
      // В пуле из сейва/автосейва лежат только title+url — содержимое
      // подтягиваем из узлов, иначе сервер отвергнет обобщение как «нет ни
      // одного technology_description».
      const poolSources = enrichSourcesFromNodes(rawSources, data.nodes);

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
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
        }),
      );
    },
    [
      dispatch,
      selectedNodeId,
      selectedNode,
      sourcesPool,
      data.nodes,
    ],
  );

  // Ручное добавление источника (3.2): пишем и в пул (единый для step-потока и
  // бейджей; addSourcesToPool сам разрулит seq/originProduct — пул становится
  // «своим»), и в node.data.sourcesUp/Down (отображение full-chain потока).
  // Возвращает текст ошибки или null при успехе.
  const handleAddManualSource = useCallback(
    (direction: BuildDirection) =>
      (src: { title: string; url: string; description?: string }): string | null => {
        if (!selectedNodeId || !selectedNode) return "Узел не выбран";
        const productName = String(selectedNode.data?.label || "").trim();
        if (!productName) return "У узла нет названия";

        const url = src.url.trim();
        const title = src.title.trim() || url;
        if (!/^https?:\/\/.+/i.test(url)) {
          return "Ссылка должна начинаться с http:// или https://";
        }

        const dirField = direction === "up" ? "sourcesUp" : "sourcesDown";
        const nodeSources =
          (selectedNode.data?.[dirField] as TechnologySource[] | undefined) ?? [];
        const poolSources =
          sourcesPool[poolKey(productName, direction)]?.sources ?? [];
        // Объединяем оба хранилища (могли разойтись), дедуп по url.
        const merged: TechnologySource[] = [];
        const seen = new Set<string>();
        for (const s of [...poolSources, ...nodeSources]) {
          const key = String(s.url || "").trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(s);
        }
        if (seen.has(url.toLowerCase())) {
          return "Источник с таким URL уже есть в списке";
        }

        const manual: TechnologySource = {
          title,
          url,
          access_hint: "",
          technology_description: src.description?.trim() ?? "",
          inputs_outputs_hint: [],
          evidence_snippets: [],
          // Пометка переживает поиск: fetchSources переносит ручные источники
          // в новый набор, иначе они пропадали из списка узла.
          isManual: true,
        };
        const next = [...merged, manual];

        dispatch(addSourcesToPool({ productName, direction, sources: next }));
        dispatch(
          updateNodeData({
            nodeId: selectedNodeId,
            data: { [dirField]: next },
          }),
        );
        return null;
      },
    [dispatch, selectedNodeId, selectedNode, sourcesPool],
  );

  const handleBuildStep = useCallback(
    (direction: BuildDirection) =>
    (
      customText?: string,
      customSystemPrompt?: string,
      provider?: string,
      model?: string,
    ) => {
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
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
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

  // Достаточный ребёнок: источники унаследованы от родителя → обобщаем их и
  // СРАЗУ строим шаг (без ручного поиска/обобщения). Решение «достаточно»
  // принято на build родителя; запрос на обобщение идёт только сейчас.
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
        // Схлопываем дубли вариантов: модель иногда возвращает 2 одинаковых по
        // сути альтернативы (тот же набор прекурсоров/продуктов) — оставляем одну.
        const alts = dedupeAlternatives(parseAlternatives(text));
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
      }
      // Нет обобщения (например, свежий поиск источников после цикла) — alt-ноды
      // НЕ трогаем: при цикле основной вариант не строится, и альтернативы —
      // единственный способ продолжить (задача №4). Удаление только явное:
      // «Сбросить и начать шаг заново» (handleClearStepState) или замена новым
      // обобщением (ветки выше).
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
        onAddManualSource: handleAddManualSource(direction),
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
        onChangeStepAggregatedText: (text) => {
          if (!selectedNodeId) return;
          dispatch(
            setStepAggregatedText({
              nodeId: selectedNodeId,
              direction,
              text,
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
        onForceStepPreview: () => dispatch(forceStepPreview(sKeyStep)),
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
        stepSources: (() => {
          const lbl = String(selectedNode.data?.label ?? "");
          const poolSrcs = sourcesPool[poolKey(lbl, direction)]?.sources;
          // Fallback на резервное хранилище по nodeId (sourcesSlice) — на
          // случай рассинхрона ключа пула.
          return poolSrcs?.length ? poolSrcs : (sliceState?.sources ?? []);
        })(),
        stepSourcesOrigin: (() => {
          const lbl = String(selectedNode.data?.label ?? "");
          const entry = sourcesPool[poolKey(lbl, direction)];
          return entry?.originProduct &&
            poolKey(entry.originProduct, direction) !== poolKey(lbl, direction)
            ? entry.originProduct
            : null;
        })(),
        stepNeedsFreshSources:
          needsFreshSources[
            poolKey(String(selectedNode.data?.label ?? ""), direction)
          ] ?? null,
        stepSourcesStatus: sliceState?.stepSourcesStatus ?? "idle",
        stepSourcesError: sliceState?.stepSourcesError ?? null,
        stepSourcesExhausted: sliceState?.stepSourcesExhausted ?? false,

        stepAggregatedText: sliceState?.stepAggregatedText ?? null,
        stepAggregateStatus: sliceState?.stepAggregateStatus ?? "idle",
        stepAggregateError: sliceState?.stepAggregateError ?? null,
        stepNeedsSources: sliceState?.stepNeedsSources ?? false,
        stepInsufficientProducts: sliceState?.stepInsufficientProducts ?? [],

        stepBuildResult: sliceState?.stepBuildResult ?? null,
        stepBuildStatus: sliceState?.stepBuildStatus ?? "idle",
        stepBuildError: sliceState?.stepBuildError ?? null,
        stepBuiltFromAggregate: sliceState?.stepBuiltFromAggregate ?? false,

        onFetchStepSources: handleFetchStepSourcesV2(direction),
        onCancelStepSources: handleCancelStepSources(direction),
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

          baseResult.onBuildStep = (
            customText?: string,
            customSystemPrompt?: string,
            provider?: string,
            model?: string,
          ) => {
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
                // Выбор провайдера/модели из панели: раньше override для
                // alt-нод обрезал эти аргументы, и построение альтернативы
                // всегда уходило на дефолтный провайдер.
                ...(provider ? { provider } : {}),
                ...(model ? { model } : {}),
              }),
            );
          };

          baseResult.onAcceptStep = (
            selectedContinueProductNodeId?: string,
            filteredStep?: import("./store/types").StepChainApiStep,
          ) => {
            const sKey = stepSessionKey(rootNodeId, direction);
            // Ключ содержимого альтернативы. «Принятой» её пометит сам reducer
            // и ТОЛЬКО если шаг реально материализовался — при dead-end цикла
            // alt-нода должна остаться на полотне (задача №4). Ключ по
            // содержимому, а не индексу: индексы теряют смысл, когда alt-ноды
            // переживают пере-обобщение.
            const altAcceptKey = alternativeKey({
              fullDescription: altDesc,
              title: String(selectedNode?.data?.label ?? ""),
            });
            dispatch(
              acceptPendingStep({
                sessionKey: sKey,
                selectedContinueProductNodeId,
                filteredStep,
                isAlternativeFirstStep: true,
                ...(altAcceptKey ? { altAcceptKey } : {}),
              }),
            );
            dispatch(resetStepBuild({ nodeId: rootNodeId, direction }));
          };

          baseResult.onRejectStep = () => {
            const sKey = stepSessionKey(rootNodeId, direction);
            dispatch(rejectPendingStep(sKey));
          };
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
      needsFreshSources,
      handleFindSources,
      handleAggregateSources,
      handleAddManualSource,
      handleInitChain,
      handleExpandNext,
      stepChainSessions,
      handleAcceptStep,
      handleFetchStepSourcesV2,
      handleCancelStepSources,
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

  // Группы источников для таблицы: реальные из sourcesPool по всем продуктам.
  // Каждая группа = продукт×направление с пометкой наследования (inheritedFrom)
  // и дедупом источников по url.
  const sourceGroups = useMemo(() => {
    const labels = data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label ?? ""))
      .filter(Boolean);
    return collectSourceGroups(labels, sourcesPool, poolKey);
  }, [data.nodes, sourcesPool, poolKey]);

  // Продукт, чьи источники подсвечиваются при открытии таблицы из выбранной ноды.
  // Для продукта — он сам; для преобразования/альтернативы — продукт-якорь
  // (источник входящего ребра или chainRootNodeId).
  const sourcesCurrentProduct = useMemo(() => {
    if (!selectedNode) return "";
    if (selectedNode.type === "product")
      return String(selectedNode.data?.label ?? "");
    const incoming = data.edges.find((e) => e.target === selectedNode.id);
    const parent = incoming
      ? data.nodes.find(
          (n) => n.id === incoming.source && n.type === "product",
        )
      : undefined;
    if (parent) return String(parent.data?.label ?? "");
    const rootId = String(selectedNode.data?.chainRootNodeId ?? "");
    const root = rootId
      ? data.nodes.find((n) => n.id === rootId)
      : undefined;
    return root ? String(root.data?.label ?? "") : "";
  }, [selectedNode, data.edges, data.nodes]);

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

  // ─── Сохранение на сервер (боковая кнопка) ───
  // Та же логика, что у кнопки во вкладке «Сохранённые»: если открыт
  // сохранённый граф — модалка предложит обновить его или сохранить как новый.
  const {
    openedGraphId,
    openedGraphName,
    defaultName: saveDefaultName,
    saveNew: saveGraphAsNew,
    updateOpened: updateOpenedGraph,
  } = useSaveGraph();
  const [showSaveGraphModal, setShowSaveGraphModal] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  // Название графа в панели над холстом: имя сохранённого файла, иначе запрос,
  // которым граф создавали (он же — имя графа, созданного вручную).
  const graphDisplayName = openedGraphName || originalPrompt || "";
  // В режиме рамки протяжка левой кнопкой выделяет, а не панорамирует.
  const marqueeMode = canvasMode === "marquee" && !readOnly && !focusOn;
  const flashSaveButton = useCallback(() => {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  }, []);

  const handleSaveGraphAsNew = useCallback(
    async (name?: string) => {
      if (await saveGraphAsNew(name)) {
        setShowSaveGraphModal(false);
        flashSaveButton();
      }
    },
    [saveGraphAsNew, flashSaveButton],
  );

  const handleUpdateOpenedGraph = useCallback(async () => {
    if (await updateOpenedGraph()) {
      setShowSaveGraphModal(false);
      flashSaveButton();
    }
  }, [updateOpenedGraph, flashSaveButton]);

  // ─── Автосейв в sessionStorage ───
  // Каждое изменение графа (с debounce — drag генерирует десятки событий в
  // секунду) пишем в sessionStorage: перезагрузка/зависание вкладки не теряет
  // результат. Сериализация графа на сотни узлов занимает единицы миллисекунд,
  // с debounce 600 мс это незаметно.
  useEffect(() => {
    if (sharedView) return;
    const timer = setTimeout(() => {
      try {
        if (!data.nodes.length) {
          // Пустое полотно (например, после очистки) — автосейв не нужен.
          sessionStorage.removeItem(AUTOSAVE_KEY);
          return;
        }
        const payload = buildSaveGraphPayload({
          originalPrompt,
          nodes: data.nodes,
          edges: data.edges,
          leafNodes,
          hasMore,
          sourcesPool,
          sourcesSeqCounter,
        });
        sessionStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({
            ...payload,
            ...(openedGraphId
              ? {
                  openedGraph: {
                    id: openedGraphId,
                    name: openedGraphName ?? "",
                  },
                }
              : {}),
          }),
        );
      } catch { /* квота/приватный режим — автосейв не критичен */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [
    sharedView,
    data.nodes,
    data.edges,
    leafNodes,
    hasMore,
    originalPrompt,
    sourcesPool,
    sourcesSeqCounter,
    openedGraphId,
    openedGraphName,
  ]);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [savingBeforeClear, setSavingBeforeClear] = useState(false);

  // Очистка необратима, поэтому при несохранённых правках сначала предлагаем
  // сохранить — тот же вопрос, что перед созданием и открытием графа.
  const clearIsLossy =
    data.nodes.length > 0 &&
    graphSignature(data.nodes, data.edges) !== savedSignature;

  const handleClearCanvas = useCallback(() => {
    clearCanvas(dispatch);
    setShowClearConfirm(false);
  }, [dispatch]);

  const handleSaveThenClear = useCallback(async () => {
    setSavingBeforeClear(true);
    const ok = openedGraphId
      ? await updateOpenedGraph()
      : await saveGraphAsNew(saveDefaultName);
    setSavingBeforeClear(false);
    if (!ok) return; // ошибку показал тост — остаёмся в вопросе
    handleClearCanvas();
  }, [
    openedGraphId,
    updateOpenedGraph,
    saveGraphAsNew,
    saveDefaultName,
    handleClearCanvas,
  ]);

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

      {/* Панель над холстом. Обёртка нужна для замера высоты при подгонке
          камеры в фокус-режиме (см. fitFocusCamera). */}
      {!sharedView && (
        <div ref={toolbarWrapRef} className={styles.toolbarWrap}>
          <GraphToolbar
            graphName={graphDisplayName}
            productsOnly={productsOnly}
            onToggleProductsOnly={() => setProductsOnly((v) => !v)}
            focusOn={focusOn}
            onToggleFocus={() => (focusOn ? exitFocusMode() : enterFocusMode())}
            focusScope={focusScope}
            onFocusScopeChange={setFocusScope}
            focusDepth={focusDepth}
            onFocusDepthChange={setFocusDepth}
            industryData={industryData}
            onToggleIndustryData={() => setIndustryData((v) => !v)}
            alternatives={showAlternatives}
            onToggleAlternatives={() => setShowAlternatives((v) => !v)}
          />
        </div>
      )}

      <CanvasTools
        mode={canvasMode}
        onModeChange={setCanvasMode}
        onSave={() => setShowSaveGraphModal(true)}
        canSave={data.nodes.length > 0}
        onClear={() => setShowClearConfirm(true)}
        canClear={data.nodes.length > 0}
        saveFlash={saveFlash}
        readOnly={readOnly || focusOn}
      />

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={structureLocked ? undefined : handleConnect}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeContextMenu={structureLocked ? undefined : onNodeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={structureLocked ? undefined : onPaneContextMenu}
        nodesConnectable={!structureLocked}
        // В фокус-режиме позиции задаёт раскладка окрестности — двигать нечего;
        // в режиме «рука» узлы тоже неподвижны, тянется только холст.
        nodesDraggable={!focusOn && canvasMode !== "pan"}
        connectionLineType={ConnectionLineType.Straight}
        snapToGrid
        // Режим указателя из правого рельса: «рамка» отдаёт протяжку левой
        // кнопкой выделению, остальные два — панорамированию. Shift+протяжка
        // и Ctrl/Cmd+клик работают в любом режиме, как раньше.
        selectionKeyCode={readOnly || focusOn ? null : "Shift"}
        multiSelectionKeyCode={readOnly || focusOn ? null : ["Meta", "Control"]}
        selectionOnDrag={marqueeMode}
        panOnDrag={!marqueeMode}
        onReconnect={structureLocked ? undefined : handleReconnect}
        onReconnectStart={structureLocked ? undefined : onReconnectStart}
        onReconnectEnd={structureLocked ? undefined : onReconnectEnd}
        // Удаление обрабатываем сами (через подтверждение), отключаем нативное.
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        nodeTypes={nodeTypes}
        edgesFocusable={false}
        nodesFocusable={false}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          // sourceHandle/targetHandle тут не задаём: DefaultEdgeOptions их не
          // поддерживает (Omit в типах @xyflow), библиотека их игнорировала;
          // хэндлы рёбрам назначает normalizeEdges/applyHandlesByGeometry.
          type: "straight",
        }}
      >
        {/* Цвет точек — литералом: var() в SVG-атрибуте не раскрывается,
            токен здесь применим только к CSS-свойству фона. */}
        <Background
          gap={22}
          size={1.4}
          color="#c4dcf2"
          style={{ background: "var(--c-canvas)" }}
        />
      </ReactFlow>

      {/* Мини-карта — своя, а не штатная: она следит за камерой и показывает
          окрестность кадра, иначе на больших графах узлы неразличимы.
          Живёт вне <ReactFlow>, чтобы её клики не доходили до полотна. */}
      {data.nodes.length > 0 && <CanvasMinimap nodes={flowNodes} />}
      <SaveGraphModal
        isOpen={showSaveGraphModal}
        onClose={() => setShowSaveGraphModal(false)}
        onSave={handleSaveGraphAsNew}
        defaultName={saveDefaultName}
        openedName={openedGraphId ? openedGraphName : null}
        onUpdate={openedGraphId ? handleUpdateOpenedGraph : undefined}
      />
      {paneMenu && (
        <PaneContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          onAdd={handleAddNodeAt}
          onClose={() => setPaneMenu(null)}
        />
      )}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleContextDelete}
          selectedCount={selectedNodes.length}
          isBookmarked={bookmarkedIds.has(contextMenu.nodeId)}
          onToggleBookmark={
            // Альтернатива живёт внутри шага — отмечать её закладкой незачем.
            data.nodes.find((n) => n.id === contextMenu.nodeId)?.data
              ?.chainVariant === "alt"
              ? undefined
              : handleToggleBookmark
          }
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
        onFieldBlur={handleFieldBlur}
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
        hasOutgoingProductNeighbors={selectedNodeHasOutgoingNeighbors}
        onFetchTransformations={handleOpenFetchTransformations}
        linkedProducts={linkedProducts}
        onFocusLinkedProduct={handleFocusLinkedProduct}
        readOnly={structureLocked}
        nodeId={selectedNodeId}
        sourceGroups={sourceGroups}
        sourcesCurrentProduct={sourcesCurrentProduct}
        isAltNode={selectedNode?.data?.chainVariant === "alt"}
        isBookmarked={selectedNodeId ? bookmarkedIds.has(selectedNodeId) : false}
        onToggleBookmark={
          selectedNodeId && !structureLocked
            ? () => toggleBookmarkFor(selectedNodeId)
            : undefined
        }
        onDeleteNode={
          selectedNodeId && !structureLocked
            ? () => setPendingDeleteIds([selectedNodeId])
            : undefined
        }
        isUnfilledUserProduct={
          selectedNode?.data?.isUserAdded === true &&
          !String(selectedNode?.data?.description ?? "").trim()
        }
        altDirection={
          selectedNode?.data?.stepAltDirection as BuildDirection | undefined
        }
        aggregatedDescription={
          selectedNode?.data?.aggregatedDescription as string | undefined
        }
        onCommitDescription={handleCommitDescription}
        onCommitAggregatedDescription={handleCommitAggregatedDescription}
      />

      <Notification
        message="Изменения сохранены"
        isVisible={isSavedToastVisible}
      />

      {pendingDeleteIds &&
        pendingDeleteIds.length > 0 &&
        (pendingDeleteIds.length === 1 ? (
          <ConfirmDeleteModal
            nodeName={
              data.nodes.find((n) => n.id === pendingDeleteIds[0])?.data
                ?.label || ""
            }
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDeleteIds(null)}
          />
        ) : (
          <ConfirmDeleteModal
            nodeName=""
            title={`Удалить выбранные узлы (${pendingDeleteIds.length})?`}
            description="Все выбранные узлы и связанные с ними связи будут удалены. Это действие нельзя отменить."
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDeleteIds(null)}
          />
        ))}
      {showClearConfirm &&
        (clearIsLossy ? (
          <ConfirmUnsavedModal
            open
            action="очисткой полотна"
            confirmLabel="Сохранить и очистить"
            saving={savingBeforeClear}
            onCancel={() => setShowClearConfirm(false)}
            onDiscard={handleClearCanvas}
            onSave={handleSaveThenClear}
          />
        ) : (
          <ConfirmDeleteModal
            nodeName=""
            title="Очистить полотно?"
            description="Все узлы и связи будут удалены. Это действие нельзя отменить."
            confirmLabel="Очистить"
            onConfirm={handleClearCanvas}
            onCancel={() => setShowClearConfirm(false)}
          />
        ))}
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
          // Закрытие во время запроса разрешено: он идёт минутами, а
          // результат применится и при закрытой модалке — о нём сообщит тост.
          onClose={() => setInsertTrState(null)}
        />
      )}
    </div>
  );
};
