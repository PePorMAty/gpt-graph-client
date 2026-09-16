import { useCallback } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  fetchSavedGraphsThunk,
  markGraphSaved,
  setOpenedGraph,
  updateSavedGraphThunk,
} from "../store/slices/savedGraphSlice";
import { saveGraph } from "../store/api/saved-graph-api";
import { pushGraphExtras } from "../store/graphExtras";
import { buildSaveGraphPayload } from "../utils/buildSaveGraphPayload";
import { graphSignature } from "../utils/graphSignature";
import { showToast } from "../components/toast/toastStore";

// Сохранение текущего полотна на сервер: новый файл или перезапись открытого
// сохранённого графа. Общая логика для кнопки во вкладке «Сохранённые» и
// боковой кнопки сохранения на полотне.
export function useSaveGraph() {
  const dispatch = useAppDispatch();
  const {
    data,
    leafNodes,
    hasMore,
    originalPrompt,
    sourcesPool,
    sourcesSeqCounter,
  } = useAppSelector((s) => s.graph);
  const { openedGraphId, openedGraphName } = useAppSelector(
    (s) => s.savedGraphs,
  );

  const buildPayload = useCallback(
    (name?: string) =>
      buildSaveGraphPayload({
        name,
        originalPrompt,
        nodes: data.nodes,
        edges: data.edges,
        leafNodes,
        hasMore,
        sourcesPool,
        sourcesSeqCounter,
      }),
    [
      data.nodes,
      data.edges,
      leafNodes,
      hasMore,
      originalPrompt,
      sourcesPool,
      sourcesSeqCounter,
    ],
  );

  // Сохранить полотно как новый файл на сервере. Возвращает true при успехе.
  const saveNew = useCallback(
    async (name?: string): Promise<boolean> => {
      try {
        const res = await saveGraph(buildPayload(name));

        // Новый файл теперь «открыт» — последующее «Сохранить» предложит его обновить.
        if (res?.file) {
          dispatch(
            setOpenedGraph({
              id: res.file,
              name: name || (originalPrompt ?? "graph"),
            }),
          );
          // До этого момента графа на сервере не было, и закладки с историей
          // копились только в памяти — переносим их в новый файл. Строго до
          // markGraphSaved: иначе его запись «Граф сохранён» уедет дважды.
          await dispatch(pushGraphExtras(res.file));
        }

        dispatch(
          markGraphSaved({ signature: graphSignature(data.nodes, data.edges) }),
        );
        // обновим список, чтобы новый файл появился
        dispatch(fetchSavedGraphsThunk());
        showToast("success", "Граф сохранён на сервер");
        return true;
      } catch (e) {
        console.error(e);
        showToast("error", "Ошибка сохранения графа");
        return false;
      }
    },
    [buildPayload, data.nodes, data.edges, dispatch, originalPrompt],
  );

  // Перезаписать открытый сохранённый граф текущим состоянием полотна.
  const updateOpened = useCallback(async (): Promise<boolean> => {
    if (!openedGraphId) return false;
    try {
      await dispatch(
        updateSavedGraphThunk({
          id: openedGraphId,
          payload: buildPayload(openedGraphName ?? undefined),
        }),
      ).unwrap();
      dispatch(
        markGraphSaved({ signature: graphSignature(data.nodes, data.edges) }),
      );
      showToast("success", `Граф «${openedGraphName}» обновлён`);
      return true;
    } catch (e) {
      showToast(
        "error",
        "Не удалось обновить граф: " +
          (e instanceof Error ? e.message : String(e)),
      );
      return false;
    }
  }, [
    buildPayload,
    data.nodes,
    data.edges,
    dispatch,
    openedGraphId,
    openedGraphName,
  ]);

  return {
    openedGraphId,
    openedGraphName,
    defaultName: originalPrompt ?? "graph",
    hasNodes: data.nodes.length > 0,
    buildPayload,
    saveNew,
    updateOpened,
  };
}
