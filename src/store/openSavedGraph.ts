// Открыть сохранённый граф с сервера на полотне — по id, без библиотеки.
//
// Нужен окну конфликта сохранения («Граф изменили, пока вы работали» →
// «Открыть их версию»): свежая версия кладётся на полотно так же, как при
// открытии из библиотеки — узлы, источники, привязка «Обновить …» с версией,
// закладки и история, слепок «сохранено».

import { createAsyncThunk } from "@reduxjs/toolkit";

import type { AppDispatch, RootState } from "./store";
import type { SavedGraphFile } from "./types";

import { loadSavedGraph } from "./api/saved-graph-api";
import { openGraphExtras } from "./graphExtras";
import { loadGraphFromFile } from "./slices/gptSlice";
import { markGraphSaved, setOpenedGraph } from "./slices/savedGraphSlice";
import { graphSignature } from "../utils/graphSignature";
import { requestFitView } from "../utils/requestFitView";

export const openSavedGraphOnCanvas = createAsyncThunk<
  SavedGraphFile["meta"],
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  "savedGraphs/openOnCanvas",
  async (id, { dispatch }) => {
    const file = await loadSavedGraph(id);
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
    dispatch(setOpenedGraph({ id, name: file.meta.name, version: file.meta.version ?? null }));
    dispatch(openGraphExtras(id));
    dispatch(
      markGraphSaved({
        signature: graphSignature(file.graph.nodes, file.graph.edges),
        opened: true,
      }),
    );
    requestFitView();
    return file.meta;
  },
);
