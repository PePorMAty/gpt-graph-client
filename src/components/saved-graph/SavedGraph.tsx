import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import type { SavedGraphFile, SavedGraphMeta } from "../../store/types";

import styles from "./SavedGraph.module.css";

import {
  clearOpenedGraph,
  deleteSavedGraphThunk,
  fetchSavedGraphsThunk,
  loadSavedGraphThunk,
  renameSavedGraphThunk,
  setOpenedGraph,
} from "../../store/slices/savedGraphSlice";

import { useSaveGraph } from "../../hooks/useSaveGraph";
import { SaveGraphModal } from "../save-graph-modal";
import { loadGraphFromFile } from "../../store/slices/gptSlice";
import { extractSubgraph } from "../../utils/extractSubgraph";
import { getLeafNodes } from "../../utils/getLeafNodes";
import { OpenGraphModal } from "../open-graph-modal/OpenGraphModal";
import { SelectNodeModal } from "../select-node-modal/SelectNodeModal";
import { SelectDepthModal } from "../select-depth-modal/SelectDepthModal";
import { getMaxDepth } from "../../utils/getMaxDepth";
import { parseGraphJson } from "../../utils/parseGraphJson";
import { applyAutoLayout } from "../../utils/applyAutoLayout";
import { ConfirmDeleteModal } from "../confirm-delete-modal";

// Режимы сортировки списка сохранённых графов. Выбор переживает перезагрузку.
type SortMode = "date-desc" | "date-asc" | "name-asc" | "name-desc";
const SORT_KEY = "saved-graphs-sort";

const readSortMode = (): SortMode => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === "date-asc" || v === "name-asc" || v === "name-desc"
      ? v
      : "date-desc";
  } catch {
    return "date-desc";
  }
};

export const SavedGraph = () => {
  const dispatch = useAppDispatch();

  const { list, isLoading } = useAppSelector((state) => state.savedGraphs);

  const {
    openedGraphId,
    openedGraphName,
    defaultName,
    hasNodes,
    saveNew,
    updateOpened,
  } = useSaveGraph();

  const selectedGraph = useAppSelector(
    (state) => state.savedGraphs.selectedGraph,
  );

  // id/имя графа, который открывается сейчас (запоминаем при клике «Загрузить»,
  // чтобы после полного открытия привязать «Обновить» к правильному файлу).
  const [pendingOpen, setPendingOpen] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSelectNode, setShowSelectNode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSelectDepth, setShowSelectDepth] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Промис загрузки выбранного файла графа. «Открыть полностью/узел» ждут его
  // вместо чтения selectedGraph из стора: раньше первый клик попадал на ещё
  // не загруженный (или прошлый) selectedGraph и молча выходил — кнопку
  // приходилось жать дважды.
  const loadRequestRef = useRef<Promise<SavedGraphFile> | null>(null);

  // Дождаться загрузки выбранного графа; при ошибке — сообщить и вернуть null.
  const awaitSelectedGraph = async (): Promise<SavedGraphFile | null> => {
    if (!loadRequestRef.current) return selectedGraph;
    try {
      return await loadRequestRef.current;
    } catch (e) {
      alert(
        "Не удалось загрузить граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
      return null;
    }
  };

  const openFull = async () => {
    const graph = await awaitSelectedGraph();
    if (!graph) {
      setShowOpenModal(false);
      return;
    }

    dispatch(
      loadGraphFromFile({
        nodes: graph.graph.nodes,
        edges: graph.graph.edges,
        leafNodes: graph.state.leaf_nodes,
        hasMore: graph.state.has_more,
        originalPrompt: graph.meta.prompt ?? null,
        sourcesPool: graph.state.sources?.pool,
        sourcesSeqCounter: graph.state.sources?.seqCounter,
      }),
    );

    // Полное открытие сохранённого графа — запоминаем его файл для «Обновить».
    if (pendingOpen) {
      dispatch(setOpenedGraph(pendingOpen));
    }

    setShowOpenModal(false);
  };

  const openPartial = async () => {
    // Частичное открытие даёт подграф — это уже не «тот же файл», отвязываем.
    dispatch(clearOpenedGraph());
    setShowOpenModal(false);
    // Модалка выбора узла читает selectedGraph из стора — дождёмся загрузки.
    const graph = await awaitSelectedGraph();
    if (!graph) return;
    setShowSelectNode(true);
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
     Сортировка списка
  ======================= */
  const [sortMode, setSortMode] = useState<SortMode>(readSortMode);

  const changeSortMode = (mode: SortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(SORT_KEY, mode);
    } catch { /* приватный режим — выбор не переживёт перезагрузку */ }
  };

  const sortedList = useMemo(() => {
    // «По дате» — по последнему изменению (updatedAt), для нетронутых сейвов —
    // по дате создания.
    const ts = (g: SavedGraphMeta) =>
      Date.parse(g.updatedAt ?? g.createdAt) || 0;
    const byName = (a: SavedGraphMeta, b: SavedGraphMeta) =>
      a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    const arr = [...list];
    switch (sortMode) {
      case "date-asc":
        arr.sort((a, b) => ts(a) - ts(b));
        break;
      case "name-asc":
        arr.sort(byName);
        break;
      case "name-desc":
        arr.sort((a, b) => byName(b, a));
        break;
      default:
        arr.sort((a, b) => ts(b) - ts(a));
    }
    return arr;
  }, [list, sortMode]);

  /* =======================
     Сохранение графа
  ======================= */
  // Сборка payload и запросы — в useSaveGraph (общий с боковой кнопкой на полотне).
  const handleSaveGraph = async (name?: string) => {
    if (await saveNew(name)) setShowSaveModal(false);
  };

  // Перезаписать открытый сохранённый граф текущим состоянием полотна.
  const handleUpdateGraph = async () => {
    if (await updateOpened()) setShowSaveModal(false);
  };

  // Переименовать сохранённый граф из списка.
  const handleRename = async (id: string, name?: string) => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return;
    try {
      await dispatch(renameSavedGraphThunk({ id, name: trimmed })).unwrap();
      setRenameCandidate(null);
    } catch (e) {
      alert(
        "Не удалось переименовать граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  const handleLoadGraph = (g: SavedGraphMeta) => {
    setPendingOpen({ id: g.id, name: g.name });
    const request = dispatch(loadSavedGraphThunk(g.id)).unwrap();
    loadRequestRef.current = request;
    // Ошибку показываем в момент открытия (awaitSelectedGraph) — тут только
    // глушим unhandled rejection.
    request.catch(() => {});

    setShowOpenModal(true);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const { payload, warnings, needsLayout, sources } = parseGraphJson(text);

      const promptFromFile =
        payload.originalPrompt ?? file.name.replace(/\.[^.]+$/, "");

      let finalPayload = {
        ...payload,
        originalPrompt: promptFromFile,
        sourcesPool: sources?.pool,
        sourcesSeqCounter: sources?.seqCounter,
      };
      if (needsLayout) {
        const laid = await applyAutoLayout(payload.nodes, payload.edges);
        finalPayload = { ...finalPayload, nodes: laid.nodes, edges: laid.edges };
      }

      dispatch(loadGraphFromFile(finalPayload));
      // Загруженный из локального файла граф не привязан к серверному сейву.
      dispatch(clearOpenedGraph());

      const summary = `Загружено узлов: ${finalPayload.nodes.length}, рёбер: ${finalPayload.edges.length}.`;
      if (warnings.length) {
        alert(`${summary}\n\nПредупреждения:\n• ${warnings.join("\n• ")}`);
      } else {
        alert(`Граф загружен ✅\n${summary}`);
      }
    } catch (err) {
      console.error(err);
      alert(
        "Не удалось загрузить граф: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

      <div className={styles.toolbar}>
        <div className={styles.toolbarButtons}>
          <button
            className={styles.saveButton}
            onClick={() => setShowSaveModal(true)}
            disabled={!hasNodes}
          >
            💾 Сохранить граф
          </button>

          <button
            className={styles.uploadButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "⏳ Загрузка..." : "📂 Загрузить из файла"}
          </button>
        </div>

        <label
          className={styles.sortControl}
          title="Сортировка списка сохранённых графов"
        >
          <span aria-hidden>⇅</span>
          <select
            className={styles.sortSelect}
            value={sortMode}
            onChange={(e) => changeSortMode(e.target.value as SortMode)}
            aria-label="Сортировка сохранённых графов"
          >
            <option value="date-desc">Сначала новые</option>
            <option value="date-asc">Сначала старые</option>
            <option value="name-asc">Имя А→Я</option>
            <option value="name-desc">Имя Я→А</option>
          </select>
        </label>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleFileUpload}
      />

      <SaveGraphModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveGraph}
        defaultName={defaultName}
        openedName={openedGraphId ? openedGraphName : null}
        onUpdate={openedGraphId ? handleUpdateGraph : undefined}
      />

      {/* Переименование сохранённого графа (переиспользуем модалку). */}
      <SaveGraphModal
        isOpen={!!renameCandidate}
        onClose={() => setRenameCandidate(null)}
        onSave={(newName) =>
          renameCandidate && handleRename(renameCandidate.id, newName)
        }
        defaultName={renameCandidate?.name ?? ""}
        title="✏️ Переименовать граф"
        confirmLabel="Переименовать"
      />

      {!isLoading && list.length === 0 && (
        <p className={styles.empty}>Нет сохранённых графов</p>
      )}

      <ul className={styles.list}>
        {sortedList.map((g) => (
          <li key={g.id} className={styles.item}>
            <div className={styles.meta}>
              <strong>{g.name}</strong>
              <span>
                {new Date(g.createdAt).toLocaleString()}
                {g.updatedAt
                  ? ` · обновлён ${new Date(g.updatedAt).toLocaleString()}`
                  : ""}
              </span>
              <small>Leaf: {g.leafCount}</small>
            </div>

            <div className={styles.itemActions}>
              <button
                className={styles.loadButton}
                onClick={() => handleLoadGraph(g)}
                disabled={deletingId === g.id}
              >
                Загрузить
              </button>
              <button
                type="button"
                className={styles.renameButton}
                onClick={() => setRenameCandidate({ id: g.id, name: g.name })}
                disabled={deletingId === g.id}
                title="Переименовать граф"
                aria-label={`Переименовать граф «${g.name}»`}
              >
                ✏️
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setDeleteCandidate({ id: g.id, name: g.name })}
                disabled={deletingId === g.id}
                title="Удалить граф"
                aria-label={`Удалить граф «${g.name}»`}
              >
                {deletingId === g.id ? "…" : "🗑"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {deleteCandidate && (
        <ConfirmDeleteModal
          nodeName={deleteCandidate.name}
          title={
            <>Удалить граф &laquo;{deleteCandidate.name}&raquo;?</>
          }
          description="Граф будет удалён без возможности восстановления."
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={async () => {
            const { id } = deleteCandidate;
            setDeleteCandidate(null);
            setDeletingId(id);
            try {
              await dispatch(deleteSavedGraphThunk(id)).unwrap();
            } catch (e) {
              alert(
                "Не удалось удалить граф: " +
                  (e instanceof Error ? e.message : String(e)),
              );
            } finally {
              setDeletingId(null);
            }
          }}
        />
      )}
    </div>
  );
};
