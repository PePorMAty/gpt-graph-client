import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import type {
  TransformationBetweenPayload,
  TransformationBetweenResponse,
  TransformationGroup,
  TransformationsForNeighborsResponse,
  ChainLink,
} from "../types";
import type {
  ChainProductNode,
  ChainTransformNode,
} from "../../utils/chainToFlow";
import { pickPid } from "../../utils/pickPid";

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
  chain: ChainProductNode[];
  links: ChainLink[];
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
        "Цепочка": args.chain,
        "Связи": args.links,
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const chain = res.data?.["Цепочка"];
    if (!Array.isArray(chain)) {
      return thunkApi.rejectWithValue(
        res.data?.error || "transformations-for-neighbors: пустой ответ",
      );
    }

    const transformations: TransformationGroup[] = chain
      .filter(
        (n): n is ChainTransformNode & { "Источники"?: string[] } =>
          (n as { "Тип узла"?: string })?.["Тип узла"] === "Преобразование",
      )
      .map((t) => {
        const inputNodeIds = (t["Входы"] ?? [])
          .map((o) => pickPid(o))
          .filter((x): x is string => !!x);
        const outputNodeIds = (t["Выходы"] ?? [])
          .map((o) => pickPid(o))
          .filter((x): x is string => !!x);
        const rawSources = (t as { "Источники"?: unknown })["Источники"];
        const sources = Array.isArray(rawSources)
          ? rawSources.filter((u): u is string => typeof u === "string")
          : [];
        return {
          name: t["Название технологии"] || "Преобразование",
          description: t["Описание технологии"],
          sources,
          inputNodeIds,
          outputNodeIds,
        };
      });

    return { anchorNodeId: args.anchorNodeId, transformations };
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
