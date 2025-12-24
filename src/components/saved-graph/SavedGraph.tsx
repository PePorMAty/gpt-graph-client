import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";

import styles from "./SavedGraph.module.css";

import {
  fetchSavedGraphsThunk,
  loadSavedGraphThunk,
} from "../../store/slices/savedGraphSlice";

import { saveGraph } from "../../store/api/saved-graph-api";
import { SaveGraphModal } from "../save-graph-modal";

export const SavedGraph = () => {
  const dispatch = useAppDispatch();

  const { list, isLoading } = useAppSelector((state) => state.savedGraphs);

  const { data, leafNodes, hasMore, originalPrompt } = useAppSelector(
    (state) => state.graph
  );

  const [showSaveModal, setShowSaveModal] = useState(false);

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

  return (
    <div className={styles.container}>
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
              onClick={() => dispatch(loadSavedGraphThunk(g.id))}
            >
              Загрузить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
