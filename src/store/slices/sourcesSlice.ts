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
  /** Источники закончились (повторный поиск не дал новых сверх уже найденных). */
  stepSourcesExhausted: boolean;

  stepAggregateStatus: Status;
  stepAggregateError: string | null;
  stepAggregatedText: string | null;
  stepNeedsSources: boolean;
  stepInsufficientProducts: string[];

  stepBuildStatus: Status;
  stepBuildError: string | null;
  stepBuildResult: TechChain | null;
  /** Шаг уже построен+принят из ТЕКУЩЕГО обобщения — прячем кнопку «Построить
   *  шаг», пока пользователь не переобобщит/не найдёт источники заново (тогда
   *  снова false). Защита от повторного построения одного и того же шага. */
  stepBuiltFromAggregate: boolean;
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
  stepSourcesExhausted: false,

  stepAggregateStatus: "idle",
  stepAggregateError: null,
  stepAggregatedText: null,
  stepNeedsSources: false,
  stepInsufficientProducts: [],

  stepBuildStatus: "idle",
  stepBuildError: null,
  stepBuildResult: null,
  stepBuiltFromAggregate: false,
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
      s.stepSourcesExhausted = false;
      s.stepAggregateStatus = "idle";
      s.stepAggregateError = null;
      s.stepAggregatedText = null;
      s.stepNeedsSources = false;
      s.stepInsufficientProducts = [];
      s.stepBuildStatus = "idle";
      s.stepBuildError = null;
      s.stepBuildResult = null;
      s.stepBuiltFromAggregate = false;
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
      // Шаг построен+принят из текущего обобщения — прячем кнопку до переобобщения.
      s.stepBuiltFromAggregate = true;
    },
    /** Ручное редактирование обобщённого описания шага (правка markdown перед
     *  построением). handleBuild() читает stepAggregatedText из Redux, поэтому
     *  правка попадает в построение шага. */
    setStepAggregatedText: (
      state,
      action: PayloadAction<{
        nodeId: string;
        direction: BuildDirection;
        text: string;
      }>,
    ) => {
      const { nodeId, direction, text } = action.payload;
      const key = sourcesKey(nodeId, direction);
      state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
      state.byNodeId[key].stepAggregatedText = text;
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
        state.byNodeId[key].stepSourcesExhausted = false;
      })
      .addCase(fetchStepSourcesV2.fulfilled, (state, action) => {
        const { nodeId, direction, product, maxItems, exhausted, sources } =
          action.payload;
        const key = sourcesKey(nodeId, direction);
        state.byNodeId[key] = state.byNodeId[key] ?? makeNodeState();
        state.byNodeId[key].stepSourcesStatus = "succeeded";
        state.byNodeId[key].stepSourcesError = null;
        state.byNodeId[key].stepSourcesExhausted = !!exhausted;
        // Резервное хранилище по nodeId — страховка от рассинхрона ключа пула.
        state.byNodeId[key].sources = sources ?? [];
        if (product) state.byNodeId[key].product = product;
        if (typeof maxItems === "number")
          state.byNodeId[key].maxItems = maxItems;
        // Fetching more sources means the user wants to retry aggregation.
        // Clear needs-sources flags so the UI returns to the aggregate stage.
        state.byNodeId[key].stepNeedsSources = false;
        state.byNodeId[key].stepInsufficientProducts = [];
        state.byNodeId[key].stepAggregateStatus = "idle";
        state.byNodeId[key].stepAggregateError = null;
        // Свежие источники делают ПРЕЖНЕЕ обобщение неактуальным: чистим его и
        // флаг «построено», чтобы пользователь не построил шаг из устаревшего
        // обобщения, а заново нажал «Обобщить» уже на новых источниках.
        state.byNodeId[key].stepAggregatedText = null;
        state.byNodeId[key].stepBuiltFromAggregate = false;
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
        // Свежее обобщение → снова показываем кнопку «Построить шаг».
        state.byNodeId[key].stepBuiltFromAggregate = false;
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

export const {
  clearNodeSources,
  setBuildMode,
  clearStepState,
  resetStepBuild,
  setStepAggregatedText,
} = sourcesSlice.actions;
export default sourcesSlice.reducer;
