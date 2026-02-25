import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { aggregateSources, fetchSources } from "../api/sources-api";
import type { BuildDirection, TechnologySource } from "../types";

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
    setBuildDirection: (
      state,
      action: PayloadAction<{ nodeId: string; direction: BuildDirection }>,
    ) => {
      const { nodeId, direction } = action.payload;
      state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
      state.byNodeId[nodeId].direction = direction;
    },
    clearNodeSources: (state, action: PayloadAction<{ nodeId: string }>) => {
      delete state.byNodeId[action.payload.nodeId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSources.pending, (state, action) => {
        const nodeId = action.meta.arg.nodeId;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].status = "loading";
        state.byNodeId[nodeId].error = null;
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
        const nodeId = action.meta.arg.nodeId;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].status = "failed";
        state.byNodeId[nodeId].error =
          (action.payload as string) || "Ошибка поиска источников";
      })
      // --------- AGGREGATE ----------
      .addCase(aggregateSources.pending, (state, action) => {
        const nodeId = action.meta.arg.nodeId;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].aggregateStatus = "loading";
        state.byNodeId[nodeId].aggregateError = null;
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
        const nodeId = action.meta.arg.nodeId;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].aggregateStatus = "failed";
        state.byNodeId[nodeId].aggregateError =
          (action.payload as string) || "Ошибка обобщения источников";
      });
  },
});

export const { setBuildDirection, clearNodeSources } = sourcesSlice.actions;
export default sourcesSlice.reducer;
