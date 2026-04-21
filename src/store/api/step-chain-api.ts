// src/store/api/step-chain-api.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type {
  BuildDirection,
  SourcesSearchResponse,
  StepChainApiResponse,
  TechnologySource,
} from "../types";

export const fetchChainStep = createAsyncThunk<
  { sessionKey: string; response: StepChainApiResponse },
  {
    sessionKey: string;
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    techText: string;
    existingSources?: TechnologySource[];
    customSystemPrompt?: string;
  },
  { state: RootState; rejectValue: string }
>("graph/fetchChainStep", async (args, thunkApi) => {
  try {
    const state = thunkApi.getState().graph;

    const existingProducts = state.data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label || "").trim())
      .filter(Boolean);

    const res = await axios.post<StepChainApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/chain/step`,
      {
        productName: args.productName,
        direction: args.direction,
        techText: args.techText,
        existingProducts,
        ...(args.existingSources?.length
          ? { existingSources: args.existingSources }
          : {}),
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        res.data?.error || "step chain: success=false",
      );
    }

    return { sessionKey: args.sessionKey, response: res.data };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "step chain: request error",
      );
    }
    return thunkApi.rejectWithValue("step chain: request error");
  }
});

export const fetchStepSources = createAsyncThunk<
  { sessionKey: string; sources: TechnologySource[] },
  {
    sessionKey: string;
    productName: string;
    direction: BuildDirection;
    maxItems?: number;
  },
  { rejectValue: string }
>("graph/fetchStepSources", async (args, thunkApi) => {
  try {
    const res = await axios.post<SourcesSearchResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/sources`,
      {
        productName: args.productName,
        maxItems: args.maxItems ?? 5,
        direction: args.direction,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue("sources: server returned success=false");
    }

    return { sessionKey: args.sessionKey, sources: res.data.sources };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error || e.message || "sources: request error",
      );
    }
    return thunkApi.rejectWithValue("sources: request error");
  }
});
