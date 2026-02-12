import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { updateNodeData } from "../slices/gptSlice";
import type { SourcesSearchResponse } from "../types";

export const fetchSources = createAsyncThunk<
  { nodeId: string; data: SourcesSearchResponse },
  { nodeId: string; productName: string; maxItems?: number }
>("sources/fetchSources", async (payload, thunkApi) => {
  try {
    const res = await axios.post<SourcesSearchResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/sources`,
      {
        productName: payload.productName,
        maxItems: payload.maxItems ?? 5,
      },
      { headers: { "Content-Type": "application/json" } },
    );

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
  } catch (e: any) {
    return thunkApi.rejectWithValue(
      e?.response?.data?.error || e?.message || "sources: request error",
    );
  }
});
