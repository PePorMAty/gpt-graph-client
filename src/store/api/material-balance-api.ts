// src/store/api/material-balance-api.ts
//
// Материальный баланс преобразования: расчёт моделью с веб-поиском на
// сервере (routes/material-balance, MATERIAL-BALANCE.md в репозитории
// сервера).
//
// Вопрос к модели — сколько продукта получится из сырья. Модель всегда
// считает на 1 т сырья, а пересчёт на любое количество и единицу делает
// клиент (utils/materialBalance.ts): массы пропорциональны. Расчёт идёт
// минуты, поэтому сервер считает в фоне, а клиент спрашивает ход по номеру
// задачи.

import axios from "axios";

const API = () => `${import.meta.env.VITE_API_URL}/graphs/material-balance`;

/** Число или диапазон; approx — «≈», оценка. */
export interface BalanceAmount {
  min: number;
  max: number;
  approx: boolean;
}

export type BalanceStatus =
  | "calculated"
  | "partial"
  | "insufficient"
  | "invalid_selection"
  | "invalid_basis"
  | "unknown";

/**
 * Обозначения узлов в запросе к модели: P1 — сырьё, P2 — продукт, P3… —
 * остальные входы и выходы, T1 — преобразование.
 */
export interface BalanceRef {
  ref: string;
  name: string;
  role: "basis" | "target" | "input" | "output" | "transformation";
}

/** Строка «Результатов по продуктам»: масса на 1 т сырья. */
export interface BalanceProduct {
  ref: string | null;
  name: string;
  massKg: BalanceAmount | null;
  massText: string;
  label: string;
  basis: string;
}

/** Коэффициент стадии — как он определён в источнике. */
export interface BalanceCoefficient {
  transformationRef: string | null;
  fromRef: string | null;
  toRef: string | null;
  indicator: string;
  value: BalanceAmount | null;
  valueText: string;
  unit: string;
  source: string;
}

/** Внешний поток участка: вход или выход, масса на 1 т сырья. */
export interface BalanceFlow {
  name: string;
  direction: "in" | "out" | "";
  massKg: BalanceAmount | null;
  massText: string;
  basis: string;
}

export interface BalanceSource {
  id: string;
  url: string;
  title: string;
  org: string;
  type: string;
  usedFor: string;
  /** Блок источника из ответа целиком (Markdown). */
  block: string;
}

/** Краткая запись базы — для подсказок «есть в базе». */
export interface BalanceSummary {
  id: number;
  createdAt: string;
  model: string | null;
  transformation: string;
  /** Сырьё пары (P1). */
  basis: string;
  /** Продукт пары (P2). */
  target: string;
  status: BalanceStatus;
  statusLabel: string;
}

/** Расчёт целиком: разбор ответа модели и сам ответ. */
export interface BalanceRecord extends BalanceSummary {
  provider?: string | null;
  knownData?: string;
  customPrompt?: boolean;
  tookMs?: number | null;
  refs: BalanceRef[];
  chain: string | null;
  basisText: string | null;
  nature: string | null;
  products: BalanceProduct[];
  coefficients: BalanceCoefficient[];
  flows: BalanceFlow[];
  totals: {
    input: string | null;
    output: string | null;
    accumulation: string | null;
    residual: string | null;
    conclusion: string | null;
  };
  sources: BalanceSource[];
  sections: { transitions: string; balance: string; notes: string };
  /** Ответ модели целиком (Markdown). */
  answer: string;
}

export interface BalanceNodeRef {
  id: string;
  name: string;
  description?: string;
}

export interface StartBalanceBody {
  transformation: BalanceNodeRef;
  /** Сырьё пары (P1). */
  basis: BalanceNodeRef;
  /** Продукт пары (P2). */
  target: BalanceNodeRef;
  inputs: BalanceNodeRef[];
  outputs: BalanceNodeRef[];
  knownData?: string;
  system?: string;
  template?: string;
  provider?: string;
  model?: string;
  force?: boolean;
}

export type StartBalanceResult =
  | { fromCache: true; result: BalanceRecord }
  | { fromCache?: false; jobId: string; startedAt: string };

export interface BalanceJob {
  id: string;
  /** cancelled — расчёт отменили: запрос к модели оборван, в базе ничего нет. */
  status: "running" | "done" | "failed" | "cancelled";
  startedAt: string;
  elapsedMs: number;
  result?: BalanceRecord;
  error?: string;
}

export interface BalancePrompt {
  system: string;
  template: string;
  placeholders: string[];
  basisKg: number;
}

/** Текст ошибки сервера, если он есть, — он объясняет, что не так. */
function serverError(e: unknown, fallback: string): Error {
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { error?: string } | undefined)?.error;
    if (msg) return new Error(msg);
    if (!e.response) return new Error("Сервер не ответил");
  }
  return e instanceof Error ? e : new Error(fallback);
}

export async function fetchBalancePrompt(): Promise<BalancePrompt> {
  try {
    const { data } = await axios.get(`${API()}/prompt`);
    return data as BalancePrompt;
  } catch (e) {
    throw serverError(e, "Не удалось получить промпт");
  }
}

/** Готовые расчёты пары в базе: точное совпадение и похожие. */
export async function lookupBalance(body: {
  transformation: string;
  basis: string;
  target: string;
}): Promise<{ exact: BalanceSummary | null; similar: BalanceSummary[] }> {
  try {
    const { data } = await axios.post(`${API()}/lookup`, body);
    return { exact: data.exact ?? null, similar: data.similar ?? [] };
  } catch (e) {
    throw serverError(e, "Не удалось спросить базу расчётов");
  }
}

export async function startBalance(
  body: StartBalanceBody,
): Promise<StartBalanceResult> {
  try {
    const { data } = await axios.post(API(), body);
    return data.fromCache
      ? { fromCache: true, result: data.result as BalanceRecord }
      : { jobId: data.jobId as string, startedAt: data.startedAt as string };
  } catch (e) {
    throw serverError(e, "Не удалось запустить расчёт");
  }
}

export async function fetchBalanceJob(jobId: string): Promise<BalanceJob> {
  try {
    const { data } = await axios.get(`${API()}/jobs/${encodeURIComponent(jobId)}`);
    return data.job as BalanceJob;
  } catch (e) {
    throw serverError(e, "Не удалось узнать ход расчёта");
  }
}

/** Отменить расчёт: сервер обрывает запрос к модели, ответ в базу не пишет. */
export async function cancelBalanceJob(jobId: string): Promise<void> {
  try {
    await axios.post(`${API()}/jobs/${encodeURIComponent(jobId)}/cancel`);
  } catch (e) {
    throw serverError(e, "Не удалось отменить расчёт");
  }
}

export async function fetchBalanceRecord(id: number): Promise<BalanceRecord> {
  try {
    const { data } = await axios.get(`${API()}/${id}`);
    return data.result as BalanceRecord;
  } catch (e) {
    throw serverError(e, "Не удалось получить расчёт");
  }
}
