// src/store/api/end-use-api.ts
//
// POST /graphs/gpt/step/end-use — «что делают из продукта»: проверка, когда
// шаг «вниз» не нашёл продолжения. Тупик ещё не значит, что продукт конечный:
// сервер ищет в интернете химическую переработку и применение как есть и
// проверяет найденные страницы (routes/step/endUse.js в репозитории server).

import axios from "axios";

import type { DroppedSource, TechnologySource } from "../types";
import { getAiRequestFields } from "../../hooks/useAiConfig";

export type EndUseVerdict = "processed" | "end_product" | "unknown";

type ServerCheck = { status: "ok" | "unchecked"; reason?: string };

export interface EndUseResult {
  product: string;
  /** processed — есть переработка (шаг возможен), end_product — только применение как есть. */
  verdict: EndUseVerdict;
  summary: string;
  conversions: Array<{
    product: string;
    process: string;
    coReactants: string[];
    title: string;
    url: string;
    quote: string;
    server_check?: ServerCheck;
  }>;
  uses: Array<{ use: string; how: string; title: string; url: string; quote: string; server_check?: ServerCheck }>;
  /** Превращения — готовыми источниками шага «вниз». */
  sources: TechnologySource[];
  dropped: DroppedSource[];
}

export async function fetchEndUse(productName: string): Promise<EndUseResult> {
  try {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/end-use`,
      { productName, ...getAiRequestFields({ stage: "search" }) },
      { headers: { "Content-Type": "application/json" } },
    );
    if (!data?.success) throw new Error(data?.error || "проверка не удалась");
    return data as EndUseResult;
  } catch (e) {
    // Сервер старее клиента — проверки ещё нет.
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      throw new Error("сервер ещё не умеет эту проверку — нужна его новая версия");
    }
    if (axios.isAxiosError(e)) throw new Error(e.response?.data?.error || e.message);
    throw e;
  }
}
