import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { updateNodeData } from "../slices/gptSlice";
import { sourcesKey } from "../slices/sourcesSlice";
import type {
  BuildDirection,
  SourcesSearchResponse,
  TechnologySource,
} from "../types";
import { getAiRequestFields } from "../../hooks/useAiConfig";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  headers: { "Content-Type": "application/json" },
});

export const fetchSources = createAsyncThunk<
  { nodeId: string; data: SourcesSearchResponse },
  {
    nodeId: string;
    productName: string;
    maxItems?: number;
    direction: BuildDirection;
    customSystemPrompt?: string;
    /** Whitelist доменов для web_search (3.3); пусто = искать везде. */
    allowedDomains?: string[];
  }
>("sources/fetchSources", async (payload, thunkApi) => {
  try {
    const res = await api.post<SourcesSearchResponse>(`/graphs/gpt/sources`, {
      ...getAiRequestFields({ stage: "search" }),
      productName: payload.productName,
      maxItems: payload.maxItems ?? 5,
      direction: payload.direction,
      ...(payload.customSystemPrompt ? { customSystemPrompt: payload.customSystemPrompt } : {}),
      ...(payload.allowedDomains?.length
        ? { allowedDomains: payload.allowedDomains }
        : {}),
    });

    if (!res.data?.success) {
      return thunkApi.rejectWithValue("sources: server returned success=false");
    }

    // сохраняем источники в node.data per-direction
    const dirField =
      payload.direction === "up" ? "sourcesUp" : "sourcesDown";
    const aggField =
      payload.direction === "up"
        ? "sourcesAggregatedUp"
        : "sourcesAggregatedDown";

    // Найденное заменяет прошлую выдачу, но ручные источники сохраняем:
    // иначе добавленная пользователем ссылка исчезала из списка (оставаясь
    // в пуле, из-за чего повторный ввод ловил «URL уже есть»).
    const state = thunkApi.getState() as {
      graph: { data: { nodes: Array<{ id: string; data?: Record<string, unknown> }> } };
    };
    const prevSources =
      (state.graph.data.nodes.find((n) => n.id === payload.nodeId)?.data?.[
        dirField
      ] as TechnologySource[] | undefined) ?? [];
    const found = res.data.sources ?? [];
    const foundUrls = new Set(
      found.map((s) => String(s.url || "").trim().toLowerCase()),
    );
    const keptManual = prevSources.filter(
      (s) =>
        s.isManual &&
        !foundUrls.has(String(s.url || "").trim().toLowerCase()),
    );
    const nextSources = [...found, ...keptManual];

    thunkApi.dispatch(
      updateNodeData({
        nodeId: payload.nodeId,
        data: {
          [dirField]: nextSources,
          [aggField]: false,
          sources_meta: {
            product: res.data.product,
            maxItems: res.data.maxItems,
            fetchedAt: new Date().toISOString(),
          },
        },
      }),
    );

    // возвращаем составной ключ для sourcesSlice; список — с сохранёнными
    // ручными источниками, чтобы они не пропадали и из панели источников
    return {
      nodeId: sourcesKey(payload.nodeId, payload.direction),
      data: { ...res.data, sources: nextSources },
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error || e.message || "sources: request error",
      );
    }
    return thunkApi.rejectWithValue("sources: request error");
  }
});

export type AggregateSourcesArgs = {
  nodeId: string;
  productName: string;
  sources: TechnologySource[];
  direction: BuildDirection;
  customSystemPrompt?: string;
  customUserPrompt?: string;
};

export type AggregateSourcesResponse = {
  success: boolean;
  product: string;
  aggregated_description: string;
  [key: string]: unknown;
  aggregated_markdown: string;
};

export const aggregateSources = createAsyncThunk<
  { nodeId: string; data: AggregateSourcesResponse },
  AggregateSourcesArgs,
  { rejectValue: string }
>("sources/aggregateSources", async (args, thunkApi) => {
  try {
    const { nodeId, productName, sources, direction, customSystemPrompt, customUserPrompt } = args;

    const { data } = await api.post<AggregateSourcesResponse>(
      "/graphs/gpt/sources/aggregate",
      {
        ...getAiRequestFields(),
        productName,
        sources,
        direction,
        ...(customSystemPrompt ? { customSystemPrompt } : {}),
        ...(customUserPrompt ? { customUserPrompt } : {}),
      },
    );

    // сохраняем агрегированное описание per-direction в node.data
    const descField =
      direction === "up" ? "upDescription" : "downDescription";
    const aggField =
      direction === "up" ? "sourcesAggregatedUp" : "sourcesAggregatedDown";

    const desc = String(data?.aggregated_description ?? "").trim();
    const safeDesc = desc.startsWith("{") ? "" : desc;

    thunkApi.dispatch(
      updateNodeData({
        nodeId,
        data: {
          [descField]: safeDesc,
          [aggField]: true,
        },
      }),
    );

    // возвращаем составной ключ для sourcesSlice
    return { nodeId: sourcesKey(nodeId, direction), data };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error ||
          e.message ||
          "Ошибка запроса обобщения источников",
      );
    }
    return thunkApi.rejectWithValue("Ошибка запроса обобщения источников");
  }
});
