import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { fetchSources } from "../api/sources-api";
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
      })
      .addCase(fetchSources.rejected, (state, action) => {
        const nodeId = action.meta.arg.nodeId;
        state.byNodeId[nodeId] = state.byNodeId[nodeId] ?? makeNodeState();
        state.byNodeId[nodeId].status = "failed";
        state.byNodeId[nodeId].error =
          (action.payload as string) || "Ошибка поиска источников";
      });
  },
});

export const { setBuildDirection, clearNodeSources } = sourcesSlice.actions;
export default sourcesSlice.reducer;
