// src/store/api/product-codes-api.ts
//
// Коды ОКПД2 и ТН ВЭД продукта моделью по файлам классификаторов
// (routes/industry/codes.js в репозитории server). Сервер ищет по файлам
// сам, модель выбирает код из найденного, код сверяется с файлом; найденное
// сохраняется на сервере и дальше приходит в ответе /industry/lookup.

import axios from "axios";

import { getAiRequestFields } from "../../hooks/useAiConfig";

export type ProductCodeKind = "okpd2" | "tnved";

/** Код, определённый моделью и сохранённый на сервере. */
export interface ModelCode {
  /** ОКПД2 — «20.14.61.110», ТН ВЭД — 10 цифр «2912110000». */
  code: string;
  /** ТН ВЭД — как пишут: «2912 11 000 0». */
  display?: string;
  name: string | null;
  /** ТН ВЭД: цепочка уровней — «прочие» понятны только с ней. */
  path?: string | null;
  subgroup: string;
  subgroupName?: string | null;
  model?: string | null;
  /** Когда определён (ISO). */
  at?: string;
  /** Определён своим промптом, а не промптом по умолчанию. */
  customPrompt?: boolean;
}

export type ModelCodes = Partial<Record<ProductCodeKind, ModelCode>>;

/** Итог по одному виду кода. */
export type ProductCodeResult =
  | ({ status: "found" } & ModelCode)
  | { status: "none"; reason: string; subgroup?: string; subgroupName?: string | null };

export interface ProductCodesResponse {
  name: string;
  okpd2?: ProductCodeResult;
  tnved?: ProductCodeResult;
  /** Что записано на сервере. */
  saved: ModelCodes;
  /** Запросов к модели на этот продукт. */
  requests: number;
}

/** Сервер старее клиента: определения кодов ещё нет (404). */
export class ProductCodesUnsupported extends Error {}

const base = () => import.meta.env.VITE_API_URL;

export async function determineProductCodes(
  body: {
    name: string;
    description?: string;
    kinds: ProductCodeKind[];
    current?: Partial<Record<ProductCodeKind, string>>;
    prompts?: Partial<Record<ProductCodeKind, string>>;
  },
  signal?: AbortSignal,
): Promise<ProductCodesResponse> {
  try {
    const { data } = await axios.post(
      `${base()}/graphs/gpt/product-codes`,
      { ...body, ...getAiRequestFields({ stage: "graph" }) },
      { headers: { "Content-Type": "application/json" }, signal },
    );
    if (!data?.success) throw new Error(data?.error || "коды не определены");
    return data as ProductCodesResponse;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      throw new ProductCodesUnsupported("сервер ещё не умеет определять коды — нужна его новая версия");
    }
    if (axios.isAxiosError(e)) throw new Error(e.response?.data?.error || e.message);
    throw e;
  }
}

/** Промпты по умолчанию; сервер старее — null (окно покажет, что текст на сервере). */
export async function fetchCodePrompts(): Promise<Record<ProductCodeKind, string> | null> {
  try {
    const { data } = await axios.get(`${base()}/industry/codes/prompts`);
    return data?.prompts ?? null;
  } catch {
    return null;
  }
}
