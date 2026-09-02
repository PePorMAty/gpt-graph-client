// src/store/api/tech-description-api.ts
//
// POST /graphs/gpt/tech-description — краткое технологическое описание одного
// продуктового шага (существующий продукт ↔ дополнительный продукт) для
// карточки преобразования.

import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type { BuildDirection } from "../types";
import { getAiRequestFields } from "../../hooks/useAiConfig";

export type TechDescriptionApiResponse = {
  success: boolean;
  direction?: BuildDirection;
  currentProduct?: string;
  additionalProduct?: string;
  techDescription?: string;
  error?: string;
};

export interface FetchTechDescriptionArgs {
  /** Узел-преобразование, в карточку которого ляжет описание. */
  nodeId: string;
  direction: BuildDirection;
  /** Существующий продукт цепочки (<<<CURRENT_PRODUCT>>>). */
  currentProduct: string;
  /** Добавляемый продукт (<<<ADDITIONAL_PRODUCT>>>). */
  additionalProduct: string;
  /** Существующая цепочка текстом (<<<EXISTING_CHAIN>>>). */
  existingChain?: string;
  /** Текстовые сведения о технологии (<<<PROCESS_DESCRIPTION>>>). */
  processDescription?: string;
  /** Отредактированный шаблон промпта; пусто — серверный дефолт. */
  customPrompt?: string;
}

export const fetchTechDescription = createAsyncThunk<
  { nodeId: string; techDescription: string },
  FetchTechDescriptionArgs,
  { state: RootState; rejectValue: string }
>("graph/fetchTechDescription", async (args, thunkApi) => {
  try {
    const res = await axios.post<TechDescriptionApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/tech-description`,
      {
        ...getAiRequestFields({ stage: "card" }),
        direction: args.direction,
        currentProduct: args.currentProduct,
        additionalProduct: args.additionalProduct,
        ...(args.existingChain ? { existingChain: args.existingChain } : {}),
        ...(args.processDescription
          ? { processDescription: args.processDescription }
          : {}),
        ...(args.customPrompt ? { customPrompt: args.customPrompt } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !res.data?.techDescription) {
      return thunkApi.rejectWithValue(
        res.data?.error || "tech-description: success=false",
      );
    }

    return { nodeId: args.nodeId, techDescription: res.data.techDescription };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "tech-description: request error",
      );
    }
    return thunkApi.rejectWithValue("tech-description: request error");
  }
});
