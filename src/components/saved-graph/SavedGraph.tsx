import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";

import styles from "./SavedGraph.module.css";

import {
  fetchSavedGraphsThunk,
  loadSavedGraphThunk,
} from "../../store/slices/savedGraphSlice";

import { saveGraph } from "../../store/api/saved-graph-api";
import { SaveGraphModal } from "../save-graph-modal";
import { loadGraphFromFile } from "../../store/slices/gptSlice";
import { extractSubgraph } from "../../utils/extractSubgraph";
import { getLeafNodes } from "../../utils/getLeafNodes";
import { OpenGraphModal } from "../open-graph-modal/OpenGraphModal";
import { SelectNodeModal } from "../select-node-modal/SelectNodeModal";
import { SelectDepthModal } from "../select-depth-modal/SelectDepthModal";
import { getMaxDepth } from "../../utils/getMaxDepth";

export const SavedGraph = () => {
  const dispatch = useAppDispatch();

  const { list, isLoading } = useAppSelector((state) => state.savedGraphs);

  const { data, leafNodes, hasMore, originalPrompt } = useAppSelector(
    (state) => state.graph,
  );

  const selectedGraph = useAppSelector(
    (state) => state.savedGraphs.selectedGraph,
  );

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSelectNode, setShowSelectNode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSelectDepth, setShowSelectDepth] = useState(false);

  const openFull = () => {
    if (!selectedGraph) return;

    dispatch(
      loadGraphFromFile({
        nodes: selectedGraph.graph.nodes,
        edges: selectedGraph.graph.edges,
        leafNodes: selectedGraph.state.leaf_nodes,
        hasMore: selectedGraph.state.has_more,
        originalPrompt: selectedGraph.meta.prompt ?? null,
      }),
    );

    setShowOpenModal(false);
  };

  const openPartial = () => {
    setShowOpenModal(false);
    setTimeout(() => {
      setShowSelectNode(true);
    }, 0);
  };

  const openNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setShowSelectNode(false);
    setShowSelectDepth(true);
  };

  const confirmDepth = (up: number, down: number) => {
    if (!selectedGraph || !selectedNodeId) return;

    const sub = extractSubgraph(
      selectedGraph.graph.nodes,
      selectedGraph.graph.edges,
      selectedNodeId,
      up,
      down,
    );

    dispatch(
      loadGraphFromFile({
        nodes: sub.nodes,
        edges: sub.edges,
        leafNodes: getLeafNodes(sub.nodes, sub.edges),
        hasMore: false,
        originalPrompt: selectedGraph.meta.prompt ?? null,
      }),
    );

    setShowSelectDepth(false);
    setSelectedNodeId(null);
  };

  /* =======================
     Загрузка списка файлов
  ======================= */
  useEffect(() => {
    dispatch(fetchSavedGraphsThunk());
  }, [dispatch]);

  /* =======================
     Сохранение графа
  ======================= */
  const handleSaveGraph = async (name?: string) => {
    if (!originalPrompt) {
      alert("Нет исходного промпта для сохранения");
      return;
    }

    try {
      await saveGraph({
        name,
        prompt: originalPrompt,
        nodes: data.nodes,
        edges: data.edges,
        leaf_nodes: leafNodes,
        has_more: hasMore,
      });

      setShowSaveModal(false);
      alert("Граф сохранён ✅");

      // обновим список, чтобы новый файл появился
      dispatch(fetchSavedGraphsThunk());
    } catch (e) {
      console.error(e);
      alert("Ошибка сохранения графа");
    }
  };

  const handleLoadGraph = (g: any) => {
    dispatch(loadSavedGraphThunk(g.id));

    setShowOpenModal(true);
  };

  return (
    <div className={styles.container}>
      <OpenGraphModal
        isOpen={showOpenModal}
        onFull={openFull}
        onPartial={openPartial}
        onClose={() => setShowOpenModal(false)}
      />

      {showSelectNode && selectedGraph && (
        <SelectNodeModal
          nodes={selectedGraph.graph.nodes.filter((n) => n.type === "product")}
          onSelect={openNode}
          onClose={() => setShowSelectNode(false)}
        />
      )}

      {showSelectDepth && selectedGraph && selectedNodeId && (
        <SelectDepthModal
          nodeLabel={
            selectedGraph.graph.nodes.find((n) => n.id === selectedNodeId)?.data
              ?.label ?? selectedNodeId
          }
          maxUp={getMaxDepth(
            selectedGraph.graph.nodes,
            selectedGraph.graph.edges,
            selectedNodeId,
            "up",
          )}
          maxDown={getMaxDepth(
            selectedGraph.graph.nodes,
            selectedGraph.graph.edges,
            selectedNodeId,
            "down",
          )}
          onConfirm={confirmDepth}
          onClose={() => setShowSelectDepth(false)}
        />
      )}

      <h3>📁 Сохранённые графы</h3>

      {isLoading && <p>Загрузка...</p>}

      <button
        className={styles.saveButton}
        onClick={() => setShowSaveModal(true)}
        disabled={!data.nodes.length}
      >
        💾 Сохранить граф
      </button>

      <SaveGraphModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveGraph}
        defaultName={originalPrompt ?? "graph"}
      />

      {!isLoading && list.length === 0 && (
        <p className={styles.empty}>Нет сохранённых графов</p>
      )}

      <ul className={styles.list}>
        {list.map((g) => (
          <li key={g.id} className={styles.item}>
            <div className={styles.meta}>
              <strong>{g.name}</strong>
              <span>{new Date(g.createdAt).toLocaleString()}</span>
              <small>Leaf: {g.leafCount}</small>
            </div>

            <button
              className={styles.loadButton}
              onClick={() => handleLoadGraph(g)}
            >
              Загрузить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
//работает не так как надо все равно, я скину код, там работает как надо, но только отображение при выборе вверх и вниз не так показывается. сейчас учитываются и продукты и преобразовния, а надо чтобы учитывались только продукты в отображении доступных уровней вверх и вниз.
