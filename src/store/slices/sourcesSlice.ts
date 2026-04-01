import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { aggregateSources, fetchSources } from "../api/sources-api";
import type { BuildDirection, TechnologySource } from "../types";

/** Составной ключ для per-direction состояния источников */
export const sourcesKey = (nodeId: string, direction: BuildDirection) =>
  `${nodeId}::${direction}`;

type Status = "idle" | "loading" | "succeeded" | "failed";

type NodeSourcesState = {
  direction: BuildDirection | null;
  status: Status;
  error: string | null;

  // опционально храним и тут (для UI/кеша),
  // но "истина" всё равно в node.data.sources, потому что сохраняется в файл графа
  sources: TechnologySource[];
  maxItems: number | null;
  product: string | null;

  aggregateStatus: Status;
  aggregateError: string | null;
  aggregatedDescription: string | null;
  aggregatedMarkdown: string | null;
};

type SourcesState = {
  byNodeId: Record<string, NodeSourcesState>;
};

const makeNodeState = (): NodeSourcesState => ({
  direction: null,
  status: "idle",
  error: null,
  sources: [],
  maxItems: null,
  product: null,
  aggregateStatus: "idle",
  aggregateError: null,
  aggregatedDescription: null,
  aggregatedMarkdown: null,
});

const initialState: SourcesState = {
  byNodeId: {},
};

const sourcesSlice = createSlice({
  name: "sources",
  initialState,
  reducers: {
    clearNodeSources: (state, action: PayloadAction<{ nodeId: string }>) => {
      delete state.byNodeId[action.payload.nodeId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSources.pending, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].status = "loading";
        state.byNodeId[key].error = null;
      })
      .addCase(fetchSources.fulfilled, (state, action) => {
        const { nodeId, data } = action.payload;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].status = "succeeded";
        state.byNodeId[nodeId].error = null;
        state.byNodeId[nodeId].sources = data.sources ?? [];
        state.byNodeId[nodeId].maxItems = data.maxItems ?? null;
        state.byNodeId[nodeId].product = data.product ?? null;
        // если повторно ищем источники — сбрасываем предыдущее обобщение
        state.byNodeId[nodeId].aggregateStatus = "idle";
        state.byNodeId[nodeId].aggregateError = null;
        state.byNodeId[nodeId].aggregatedDescription = null;
      })
      .addCase(fetchSources.rejected, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].status = "failed";
        state.byNodeId[key].error =
          (action.payload as string) || "Ошибка поиска источников";
      })
      // --------- AGGREGATE ----------
      .addCase(aggregateSources.pending, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].aggregateStatus = "loading";
        state.byNodeId[key].aggregateError = null;
      })
      .addCase(aggregateSources.fulfilled, (state, action) => {
        const { nodeId, data } = action.payload;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();

        state.byNodeId[nodeId].aggregateStatus = "succeeded";
        state.byNodeId[nodeId].aggregateError = null;

        // ✅ общий текст
        state.byNodeId[nodeId].aggregatedDescription =
          data.aggregated_description ?? null;
        state.byNodeId[nodeId].aggregatedMarkdown =
          data.aggregated_markdown ?? null;
      })
      .addCase(aggregateSources.rejected, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].aggregateStatus = "failed";
        state.byNodeId[key].aggregateError =
          (action.payload as string) || "Ошибка обобщения источников";
      });
  },
});

export const { clearNodeSources } = sourcesSlice.actions;
export default sourcesSlice.reducer;
