// src/store/api/industry-api.ts
//
// Слой промышленных данных: проверка продуктов графа по реестру российской
// промышленной продукции (ГИСП, ПП №719).
//
// Сервер ищет по собственной копии реестра, без обращения к модели, поэтому
// ответ приходит сразу и его можно запрашивать на каждое включение слоя.

import axios from "axios";

/** Насколько уверенно название продукта легло на запись реестра. */
export type IndustryMatch =
  | "exact"
  | "all-words"
  | "core-words"
  | "partial"
  | "prefix";

export interface IndustryProducer {
  producer: string;
  inn: string | null;
  region: string | null;
  /** Название продукта так, как оно записано в реестре. */
  product: string;
  okpd2: string | null;
  status: "active" | "archived";
  statusLabel: string;
  regNumber: string | null;
  regDate: string | null;
  url: string | null;
}

export interface IndustryProductInfo {
  found: boolean;
  match: IndustryMatch | null;
  /** Строк реестра (один производитель может иметь их несколько). */
  entryCount: number;
  producerCount: number;
  regionCount: number;
  status: "active" | "archived" | null;
  okpd2: string | null;
  producers: IndustryProducer[];
}

export interface IndustryLookupResponse {
  success: boolean;
  /** false — база реестра на сервере не подключена. */
  ready: boolean;
  reason?: string;
  /** Дата, на которую актуальна выгрузка. */
  actualAt?: string | null;
  results: Record<string, IndustryProductInfo>;
}

export interface IndustryStatus {
  ready: boolean;
  reason?: string;
  entries?: number;
  products?: number;
  producers?: number;
  actualAt?: string | null;
}

const base = () => import.meta.env.VITE_API_URL;

export async function fetchIndustryStatus(): Promise<IndustryStatus> {
  const { data } = await axios.get(`${base()}/industry/status`);
  return data;
}

export async function lookupIndustry(
  products: string[],
): Promise<IndustryLookupResponse> {
  const { data } = await axios.post(`${base()}/industry/lookup`, { products });
  return data;
}
