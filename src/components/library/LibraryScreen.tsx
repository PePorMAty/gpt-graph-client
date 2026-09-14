import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearOpenedGraph,
  deleteSavedGraphThunk,
  fetchSavedGraphsThunk,
  loadSavedGraphThunk,
  markGraphSaved,
  renameSavedGraphThunk,
  setOpenedGraph,
  updateGraphDescriptionThunk,
} from "../../store/slices/savedGraphSlice";
import { loadGraphFromFile } from "../../store/slices/gptSlice";
import { parseGraphJson } from "../../utils/parseGraphJson";
import { applyAutoLayout } from "../../utils/applyAutoLayout";
import { graphSignature } from "../../utils/graphSignature";
import { requestFitView } from "../../utils/requestFitView";
import { useSaveGraph } from "../../hooks/useSaveGraph";
import type { SavedGraphMeta } from "../../store/types";
import { showToast } from "../toast/toastStore";
import { ConfirmUnsavedModal } from "../ui/ConfirmUnsavedModal";
import { ConfirmDeleteModal } from "../confirm-delete-modal";
import { SaveGraphModal } from "../save-graph-modal";
import { GraphList, type SortMode } from "./GraphList";
import { GraphDetails } from "./GraphDetails";
import { DatabaseIcon } from "../icons";
import styles from "./LibraryScreen.module.css";

const SORT_KEY = "library-sort";

function readSort(): SortMode {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (raw === "updated" || raw === "created" || raw === "name") return raw;
  } catch {
    /* приватный режим — берём порядок по умолчанию */
  }
  return "updated";
}

/**
 * Библиотека: список сохранённых графов слева, карточка выбранного справа.
 *
 * Выбор графа в списке не трогает полотно — он только догружает файл, чтобы
 * показать превью, сводку и источники. На полотно граф попадает кнопкой
 * «Открыть граф», и она же переводит на вкладку «Граф».
 */
export const LibraryScreen = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const {
    list,
    selectedGraph,
    selectedGraphId,
    isLoading,
    error,
    savedSignature,
    openedGraphId,
  } = useAppSelector((s) => s.savedGraphs);
  const { nodes: canvasNodes, edges: canvasEdges } = useAppSelector(
    (s) => s.graph.data,
  );
  const { saveNew, updateOpened } = useSaveGraph();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>(readSort);
  const [renameTarget, setRenameTarget] = useState<SavedGraphMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedGraphMeta | null>(null);
  const [pendingOpen, setPendingOpen] = useState<SavedGraphMeta | null>(null);
  const [savingBeforeOpen, setSavingBeforeOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Вопрос о несохранённых правках перед объединением. Ответ нужен вкладке
  // объединения как результат её вызова, поэтому держим resolve обещания:
  // модалка — часть этого экрана, а ждёт ответа другой компонент.
  const [askBeforeMerge, setAskBeforeMerge] = useState(false);
  const [savingBeforeMerge, setSavingBeforeMerge] = useState(false);
  const mergeResolve = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    dispatch(fetchSavedGraphsThunk());
  }, [dispatch]);

  // Выбор графа в списке — только подгрузка сведений для карточки.
  useEffect(() => {
    if (!selectedId) return;
    dispatch(loadSavedGraphThunk(selectedId));
  }, [selectedId, dispatch]);

  const changeSort = useCallback((mode: SortMode) => {
    setSort(mode);
    try {
      localStorage.setItem(SORT_KEY, mode);
    } catch {
      /* приватный режим — выбор не переживёт перезагрузку */
    }
  }, []);

  const selectedMeta = useMemo(
    () => list.find((g) => g.id === selectedId) ?? null,
    [list, selectedId],
  );

  const isDirty =
    canvasNodes.length > 0 &&
    graphSignature(canvasNodes, canvasEdges) !== savedSignature;

  /**
   * Положить выбранный граф на полотно.
   *
   * `stay` оставляет пользователя в библиотеке — так вкладка «Объединить
   * графы» кладёт на полотно основу перед слиянием, не убегая с экрана.
   * Возвращает false, если файл графа ещё не догружен.
   */
  const openOnCanvas = useCallback(
    (meta: SavedGraphMeta, stay = false): boolean => {
      const file = selectedGraph;
      if (!file || selectedGraphId !== meta.id) return false;
      dispatch(
        loadGraphFromFile({
          nodes: file.graph.nodes,
          edges: file.graph.edges,
          leafNodes: file.state.leaf_nodes,
          hasMore: file.state.has_more,
          originalPrompt: file.meta.prompt ?? null,
          sourcesPool: file.state.sources?.pool,
          sourcesSeqCounter: file.state.sources?.seqCounter,
        }),
      );
      dispatch(setOpenedGraph({ id: meta.id, name: meta.name }));
      dispatch(
        markGraphSaved({
          signature: graphSignature(file.graph.nodes, file.graph.edges),
        }),
      );
      if (!stay) {
        navigate("/");
        // Камера полотна осталась от прежнего графа — вписываем новый в экран.
        requestFitView();
      }
      return true;
    },
    [selectedGraph, selectedGraphId, dispatch, navigate],
  );

  const handleOpen = useCallback(() => {
    if (!selectedMeta) return;
    // Полотно затирается — при несохранённых правках сначала спрашиваем.
    if (isDirty) setPendingOpen(selectedMeta);
    else openOnCanvas(selectedMeta);
  }, [selectedMeta, isDirty, openOnCanvas]);

  const saveThenOpen = async () => {
    if (!pendingOpen) return;
    setSavingBeforeOpen(true);
    const ok = openedGraphId ? await updateOpened() : await saveNew();
    setSavingBeforeOpen(false);
    if (!ok) return;
    const target = pendingOpen;
    setPendingOpen(null);
    openOnCanvas(target);
  };

  const discardThenOpen = () => {
    const target = pendingOpen;
    setPendingOpen(null);
    if (target) openOnCanvas(target);
  };

  const handleRename = async (name?: string) => {
    const trimmed = (name ?? "").trim();
    if (!renameTarget || !trimmed) return;
    try {
      await dispatch(
        renameSavedGraphThunk({ id: renameTarget.id, name: trimmed }),
      ).unwrap();
      setRenameTarget(null);
    } catch (e) {
      showToast(
        "error",
        "Не удалось переименовать граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  /** Загрузка графа из JSON-файла прямо на полотно. */
  const handleUploadFile = async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const { payload, warnings, needsLayout, sources } = parseGraphJson(text);
      const name = payload.originalPrompt ?? file.name.replace(/\.[^.]+$/, "");

      let finalPayload = {
        ...payload,
        originalPrompt: name,
        sourcesPool: sources?.pool,
        sourcesSeqCounter: sources?.seqCounter,
      };
      if (needsLayout) {
        const laid = await applyAutoLayout(payload.nodes, payload.edges);
        finalPayload = { ...finalPayload, nodes: laid.nodes, edges: laid.edges };
      }

      dispatch(loadGraphFromFile(finalPayload));
      // Граф из файла не привязан к серверному сейву — «Сохранить» предложит
      // создать новый, а не перезаписать чужой.
      dispatch(clearOpenedGraph());

      showToast(
        warnings.length ? "info" : "success",
        `Граф загружен: ${finalPayload.nodes.length} узлов, ${finalPayload.edges.length} связей.` +
          (warnings.length ? ` Предупреждений: ${warnings.length}.` : ""),
      );
      navigate("/");
      requestFitView();
    } catch (e) {
      showToast(
        "error",
        "Не удалось загрузить граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setUploading(false);
    }
  };

  /**
   * Положить на полотно граф-основу перед объединением.
   *
   * Объединение затирает полотно так же, как открытие графа, поэтому при
   * несохранённых правках сначала спрашиваем. Ответ возвращается вкладке
   * объединения: false — пользователь отменил, слияние не начинаем.
   */
  const requestMergeBase = useCallback((): Promise<boolean> => {
    if (!selectedMeta) return Promise.resolve(false);
    if (!isDirty) {
      const ok = openOnCanvas(selectedMeta, true);
      if (!ok) showToast("error", "Граф ещё загружается — попробуйте ещё раз");
      return Promise.resolve(ok);
    }
    return new Promise<boolean>((resolve) => {
      mergeResolve.current = resolve;
      setAskBeforeMerge(true);
    });
  }, [selectedMeta, isDirty, openOnCanvas]);

  /** Закрыть вопрос и вернуть ответ вкладке объединения. */
  const finishMergeAsk = useCallback(
    (proceed: boolean) => {
      setAskBeforeMerge(false);
      const resolve = mergeResolve.current;
      mergeResolve.current = null;
      if (!resolve) return;
      if (!proceed || !selectedMeta) {
        resolve(false);
        return;
      }
      const ok = openOnCanvas(selectedMeta, true);
      if (!ok) showToast("error", "Граф ещё загружается — попробуйте ещё раз");
      resolve(ok);
    },
    [selectedMeta, openOnCanvas],
  );

  const saveThenMerge = async () => {
    setSavingBeforeMerge(true);
    const ok = openedGraphId ? await updateOpened() : await saveNew();
    setSavingBeforeMerge(false);
    if (!ok) return; // ошибку показал тост — остаёмся в вопросе
    finishMergeAsk(true);
  };

  /** Сохранить описание выбранного графа. Возвращает успех — карточка по нему
   *  решает, закрывать ли режим правки. */
  const handleSaveDescription = useCallback(
    async (text: string) => {
      if (!selectedMeta) return false;
      try {
        await dispatch(
          updateGraphDescriptionThunk({ id: selectedMeta.id, description: text }),
        ).unwrap();
        showToast("success", "Описание графа сохранено");
        return true;
      } catch (e) {
        showToast(
          "error",
          "Не удалось сохранить описание: " +
            (e instanceof Error ? e.message : String(e)),
        );
        return false;
      }
    },
    [selectedMeta, dispatch],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await dispatch(deleteSavedGraphThunk(id)).unwrap();
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      showToast(
        "error",
        "Не удалось удалить граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  return (
    <div className={styles.screen}>
      <GraphList
        items={list}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRename={setRenameTarget}
        onDelete={setDeleteTarget}
        sort={sort}
        onSortChange={changeSort}
        isLoading={isLoading}
        onUploadFile={handleUploadFile}
        uploading={uploading}
      />

      <main className={styles.main}>
        {selectedMeta ? (
          <GraphDetails
            key={selectedMeta.id}
            meta={selectedMeta}
            file={selectedGraph?.meta ? selectedGraph : null}
            isLoading={isLoading}
            error={error}
            items={list}
            onOpen={handleOpen}
            onRename={() => setRenameTarget(selectedMeta)}
            onDelete={() => setDeleteTarget(selectedMeta)}
            onOpenBase={requestMergeBase}
            onSaveDescription={handleSaveDescription}
            onGoToCanvas={() => {
              navigate("/");
              // Результат объединения шире исходного графа — показываем целиком.
              requestFitView();
            }}
          />
        ) : (
          <div className={styles.empty}>
            <DatabaseIcon size={34} className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>Граф не выбран</div>
            <p className={styles.emptyText}>
              Выберите граф слева — здесь появятся его схема, сводка, источники
              и объединение с другими графами.
            </p>
          </div>
        )}
      </main>

      <ConfirmUnsavedModal
        open={askBeforeMerge}
        action="объединением графов"
        confirmLabel="Сохранить и объединить"
        saving={savingBeforeMerge}
        onCancel={() => finishMergeAsk(false)}
        onDiscard={() => finishMergeAsk(true)}
        onSave={saveThenMerge}
      />

      <ConfirmUnsavedModal
        open={pendingOpen !== null}
        action="открытием другого графа"
        confirmLabel="Сохранить и открыть"
        saving={savingBeforeOpen}
        onCancel={() => setPendingOpen(null)}
        onDiscard={discardThenOpen}
        onSave={saveThenOpen}
      />

      <SaveGraphModal
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        onSave={handleRename}
        defaultName={renameTarget?.name ?? ""}
        title="Переименовать граф"
        confirmLabel="Переименовать"
      />

      {deleteTarget && (
        <ConfirmDeleteModal
          nodeName={deleteTarget.name}
          title={`Удалить граф «${deleteTarget.name}»?`}
          description="Сохранённый файл будет удалён с сервера. Это действие нельзя отменить."
          confirmLabel="Удалить"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
