import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { aggregateSources, fetchSources } from "../api/sources-api";
import {
  aggregateStepSources,
  buildStep,
  fetchStepSourcesV2,
} from "../api/step-chain-api";
import type { BuildDirection, TechnologySource } from "../types";
import type { TechChain } from "../../utils/chainToFlow";

/** Составной ключ для per-direction состояния источников */
export const sourcesKey = (nodeId: string, direction: BuildDirection) =>
  `${nodeId}::${direction}`;

type Status = "idle" | "loading" | "succeeded" | "failed";

export type BuildMode = "whole" | "step" | null;

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

  // ── step-by-step build state ──
  buildMode: BuildMode;

  stepSourcesStatus: Status;
  stepSourcesError: string | null;
  stepSources: TechnologySource[];

  stepAggregateStatus: Status;
  stepAggregateError: string | null;
  stepAggregatedText: string | null;
  stepNeedsSources: boolean;
  stepInsufficientProducts: string[];

  stepBuildStatus: Status;
  stepBuildError: string | null;
  stepBuildResult: TechChain | null;
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

  buildMode: null,

  stepSourcesStatus: "idle",
  stepSourcesError: null,
  stepSources: [],

  stepAggregateStatus: "idle",
  stepAggregateError: null,
  stepAggregatedText: null,
  stepNeedsSources: false,
  stepInsufficientProducts: [],

  stepBuildStatus: "idle",
  stepBuildError: null,
  stepBuildResult: null,
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
    setBuildMode: (
      state,
      action: PayloadAction<{
        nodeId: string;
        direction: BuildDirection;
        mode: BuildMode;
      }>,
    ) => {
      const { nodeId, direction, mode } = action.payload;
      const key = sourcesKey(nodeId, direction);
      state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
      state.byNodeId[key].buildMode = mode;
    },
    clearStepState: (
      state,
      action: PayloadAction<{ nodeId: string; direction: BuildDirection }>,
    ) => {
      const { nodeId, direction } = action.payload;
      const key = sourcesKey(nodeId, direction);
      const s = state.byNodeId[key];
      if (!s) return;
      s.stepSourcesStatus = "idle";
      s.stepSourcesError = null;
      s.stepSources = [];
      s.stepAggregateStatus = "idle";
      s.stepAggregateError = null;
      s.stepAggregatedText = null;
      s.stepNeedsSources = false;
      s.stepInsufficientProducts = [];
      s.stepBuildStatus = "idle";
      s.stepBuildError = null;
      s.stepBuildResult = null;
    },
    resetStepBuild: (
      state,
      action: PayloadAction<{ nodeId: string; direction: BuildDirection }>,
    ) => {
      const { nodeId, direction } = action.payload;
      const key = sourcesKey(nodeId, direction);
      const s = state.byNodeId[key];
      if (!s) return;
      s.stepBuildStatus = "idle";
      s.stepBuildError = null;
      s.stepBuildResult = null;
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
      })
      // --------- STEP SOURCES (/step/sources) ----------
      .addCase(fetchStepSourcesV2.pending, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepSourcesStatus = "loading";
        state.byNodeId[key].stepSourcesError = null;
      })
      .addCase(fetchStepSourcesV2.fulfilled, (state, action) => {
        const { nodeId, direction, sources, product, maxItems } =
          action.payload;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepSourcesStatus = "succeeded";
        state.byNodeId[key].stepSourcesError = null;
        state.byNodeId[key].stepSources = sources;
        if (product) state.byNodeId[key].product = product;
        if (typeof maxItems === "number")
          state.byNodeId[key].maxItems = maxItems;
      })
      .addCase(fetchStepSourcesV2.rejected, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepSourcesStatus = "failed";
        state.byNodeId[key].stepSourcesError =
          (action.payload as string) || "Ошибка поиска step-источников";
      })
      // --------- STEP AGGREGATE (/step/aggregate) ----------
      .addCase(aggregateStepSources.pending, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepAggregateStatus = "loading";
        state.byNodeId[key].stepAggregateError = null;
      })
      .addCase(aggregateStepSources.fulfilled, (state, action) => {
        const { nodeId, direction, aggregatedText, insufficientProducts } =
          action.payload;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepAggregateStatus = "succeeded";
        state.byNodeId[key].stepAggregateError = null;
        const needsSources = aggregatedText === "needs-sources";
        state.byNodeId[key].stepNeedsSources = needsSources;
        state.byNodeId[key].stepAggregatedText = needsSources
          ? null
          : aggregatedText;
        state.byNodeId[key].stepInsufficientProducts =
          insufficientProducts ?? [];
      })
      .addCase(aggregateStepSources.rejected, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepAggregateStatus = "failed";
        state.byNodeId[key].stepAggregateError =
          (action.payload as string) || "Ошибка обобщения step-источников";
      })
      // --------- STEP BUILD (/step/build) ----------
      .addCase(buildStep.pending, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepBuildStatus = "loading";
        state.byNodeId[key].stepBuildError = null;
      })
      .addCase(buildStep.fulfilled, (state, action) => {
        const { nodeId, direction, chain } = action.payload;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepBuildStatus = "succeeded";
        state.byNodeId[key].stepBuildError = null;
        state.byNodeId[key].stepBuildResult = chain;
      })
      .addCase(buildStep.rejected, (state, action) => {
        const { nodeId, direction } = action.meta.arg;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepBuildStatus = "failed";
        state.byNodeId[key].stepBuildError =
          (action.payload as string) || "Ошибка построения step-шага";
      });
  },
});

export const { clearNodeSources, setBuildMode, clearStepState, resetStepBuild } =
  sourcesSlice.actions;
export default sourcesSlice.reducer;
