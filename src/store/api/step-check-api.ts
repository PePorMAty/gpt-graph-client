// src/store/api/step-check-api.ts
//
// POST /graphs/gpt/step/check — проверка шага моделью: реально ли из этого
// сырья этим преобразованием получают эти продукты (routes/step/check.js в
// репозитории server). Один короткий запрос без поиска; исправление —
// переименованиями. Зовут превью построенного шага и отказ расчёта баланса.

import axios from "axios";

import { getAiRequestFields } from "../../hooks/useAiConfig";

/** ok — шаг верен, fix — исправим переименованием, wrong — не исправить. */
export type StepCheckVerdict = "ok" | "fix" | "wrong";

export interface StepCheckRename {
  /** Название продукта в шаге — как его прислали. */
  from: string;
  to: string;
  description?: string;
}

export interface StepCheckResult {
  verdict: StepCheckVerdict;
  summary: string;
  renames: StepCheckRename[];
  /** Новое название и описание преобразования; не меняется — null. */
  transformation: { name: string; description?: string } | null;
}

type Product = { name: string; description?: string };

export interface StepCheckBody {
  transformation: Product;
  inputs: Product[];
  outputs: Product[];
  byproducts?: Product[];
  direction?: "up" | "down";
  /** Продукт, от которого строили шаг: его не переименовывать. */
  anchor?: string;
  /** Стоят на графе в других шагах — тоже не переименовывать. */
  fixed?: string[];
  /** Замечание — примечания отказа баланса. */
  remark?: string;
}

/** Сервер старее клиента: проверки ещё нет (404). */
export class StepCheckUnsupported extends Error {}

export async function checkStep(body: StepCheckBody, signal?: AbortSignal): Promise<StepCheckResult> {
  try {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/check`,
      { ...body, ...getAiRequestFields({ stage: "graph" }) },
      { headers: { "Content-Type": "application/json" }, signal },
    );
    if (!data?.success) throw new Error(data?.error || "проверка не удалась");
    return {
      verdict: data.verdict,
      summary: String(data.summary ?? ""),
      renames: Array.isArray(data.renames) ? data.renames : [],
      transformation: data.transformation ?? null,
    };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      throw new StepCheckUnsupported("сервер ещё не умеет проверять шаг");
    }
    if (axios.isAxiosError(e)) throw new Error(e.response?.data?.error || e.message);
    throw e;
  }
}
