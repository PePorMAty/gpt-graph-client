import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { updateNodeData } from "../slices/gptSlice";
import type {
  BuildDirection,
  SourcesSearchResponse,
  TechnologySource,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "", // как у тебя сделано в других api-файлах
  headers: { "Content-Type": "application/json" },
});

export const fetchSources = createAsyncThunk<
  { nodeId: string; data: SourcesSearchResponse },
  {
    nodeId: string;
    productName: string;
    maxItems?: number;
    direction?: BuildDirection;
  }
>("sources/fetchSources", async (payload, thunkApi) => {
  try {
    const res = await api.post<SourcesSearchResponse>(`/graphs/gpt/sources`, {
      productName: payload.productName,
      maxItems: payload.maxItems ?? 5,
      direction: payload.direction ?? "down",
    });

    if (!res.data?.success) {
      return thunkApi.rejectWithValue("sources: server returned success=false");
    }

    // ✅ сохраняем источники в карточку (node.data), чтобы они жили вместе с графом
    thunkApi.dispatch(
      updateNodeData({
        nodeId: payload.nodeId,
        data: {
          sources: res.data.sources,
          sources_meta: {
            product: res.data.product,
            maxItems: res.data.maxItems,
            fetchedAt: new Date().toISOString(),
          },
        },
      }),
    );

    return { nodeId: payload.nodeId, data: res.data };
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
  sources: TechnologySource[]; // те же, что пришли с /gpt/sources
};

export type AggregateSourcesResponse = {
  success: boolean;
  product: string;
  aggregated_description: string; // предполагаемая форма ответа
  [key: string]: unknown;
  aggregated_markdown: string;
};

export const aggregateSources = createAsyncThunk<
  { nodeId: string; data: AggregateSourcesResponse },
  AggregateSourcesArgs,
  { rejectValue: string }
>("sources/aggregateSources", async (args, thunkApi) => {
  try {
    const { nodeId, productName, sources } = args;

    const { data } = await api.post<AggregateSourcesResponse>(
      "/graphs/gpt/sources/aggregate",
      { productName, sources },
    );

    return { nodeId, data };
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
