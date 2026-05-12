import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import type {
  TransformationBetweenPayload,
  TransformationBetweenResponse,
  TransformationGroup,
  TransformationsForNeighborsResponse,
} from "../types";

export type FetchTransformationBetweenArgs = {
  fromNodeId: string;
  toNodeId: string;
  edgeId: string;
  fromProduct: string;
  toProduct: string;
  customSystemPrompt?: string;
};

export type FetchTransformationBetweenResult = {
  fromNodeId: string;
  toNodeId: string;
  edgeId: string;
  transformation: TransformationBetweenPayload;
};

export const fetchTransformationBetween = createAsyncThunk<
  FetchTransformationBetweenResult,
  FetchTransformationBetweenArgs,
  { rejectValue: string }
>("graph/fetchTransformationBetween", async (args, thunkApi) => {
  try {
    const res = await axios.post<TransformationBetweenResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/transformation-between`,
      {
        fromProduct: args.fromProduct,
        toProduct: args.toProduct,
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !res.data?.transformation?.name) {
      return thunkApi.rejectWithValue(
        res.data?.error || "transformation-between: success=false",
      );
    }

    return {
      fromNodeId: args.fromNodeId,
      toNodeId: args.toNodeId,
      edgeId: args.edgeId,
      transformation: res.data.transformation,
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "transformation-between: request error",
      );
    }
    return thunkApi.rejectWithValue("transformation-between: request error");
  }
});

export type FetchTransformationsForNeighborsArgs = {
  anchorNodeId: string;
  fromProduct: string;
  toProducts: string[];
  customSystemPrompt?: string;
};

export type FetchTransformationsForNeighborsResult = {
  anchorNodeId: string;
  transformations: TransformationGroup[];
};

export const fetchTransformationsForNeighbors = createAsyncThunk<
  FetchTransformationsForNeighborsResult,
  FetchTransformationsForNeighborsArgs,
  { rejectValue: string }
>("graph/fetchTransformationsForNeighbors", async (args, thunkApi) => {
  try {
    const res = await axios.post<TransformationsForNeighborsResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/transformation-between`,
      {
        fromProduct: args.fromProduct,
        toProducts: args.toProducts,
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !Array.isArray(res.data?.transformations)) {
      return thunkApi.rejectWithValue(
        res.data?.error || "transformations-for-neighbors: success=false",
      );
    }

    return {
      anchorNodeId: args.anchorNodeId,
      transformations: res.data.transformations,
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "transformations-for-neighbors: request error",
      );
    }
    return thunkApi.rejectWithValue(
      "transformations-for-neighbors: request error",
    );
  }
});
