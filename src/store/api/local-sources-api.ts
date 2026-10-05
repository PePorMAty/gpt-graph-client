// База источников на сервере: разделы документов заказчика (PDF делится на
// разделы, модель разбирает каждый) и источники, которые модель находила
// раньше (сервер копит их сам). См. LOCAL-SOURCES.md сервера.

import axios from "axios";

import type { TechnologySource } from "../types";
import { getAiRequestFields } from "../../hooks/useAiConfig";
import { serverReason } from "./serverReason";

const base = () => import.meta.env.VITE_API_URL;

export interface LocalDocument {
  id: number;
  fileName: string;
  title: string;
  /** Краткое имя для подписей: «ИТС 18—202_». */
  shortTitle: string | null;
  pages: number;
  /** Страниц без текста (сканы, рисунки) — их содержимое в базу не попало. */
  textlessPages: number;
  chars: number;
  bytes: number;
  addedAt: string;
  addedVia: "ui" | "script";
  /** По чему разбит на разделы: закладки, содержание, заголовки, страницы. */
  structure: "outline" | "links" | "headings" | "pages" | null;
  /** Модель, которой разбираются разделы. */
  model: string | null;
  /** Разделы-источники и ход их разбора моделью. */
  sections: { total: number; done: number; failed: number; pending: number };
}

/** Раздел документа — запись-источник базы. */
export interface LocalSection {
  id: number;
  number: string | null;
  title: string;
  path: string;
  pageFrom: number;
  pageTo: number;
  /** «стр. 14–42» — печатными номерами документа. */
  pages: string;
  chars: number;
  status: "pending" | "working" | "done" | "failed";
  summary: string | null;
  model: string | null;
  error: string | null;
  /**
   * Вещества раздела. Для получаемых (целевые, попутные) раздел — источник
   * «вверх»: как их получают; для сырья — «вниз»: что из него делают.
   * Вспомогательное и отходы с продуктами не связаны — только видны.
   */
  products: {
    products: string[];
    byproducts: string[];
    intermediates: string[];
    raw: string[];
    auxiliaries: string[];
    wastes: string[];
  };
}

/**
 * Продукт базы — названия, сведённые в одно вещество («Пропилен» и «Пропен»).
 * Числа — сколько разделов раскроется по щелчку.
 */
export interface LocalProduct {
  id: string;
  label: string;
  /** Другие написания того же вещества в разделах. */
  names: string[];
  /** Ключи названий — по ним сервер отдаёт источники продукта. */
  keys: string[];
  /** Разделов «вверх»: где его получают. */
  up: number;
  /** Разделов «вниз»: где он сырьё. */
  down: number;
  /** Сохранённых источников из интернета. */
  web: { up: number; down: number };
  /** Каким узлам текущего графа отвечает. */
  onGraph: string[];
}

/** Роль продукта в разделе. */
export type LocalRole = "product" | "byproduct" | "intermediate" | "raw";

/** Раздел — источник продукта базы. */
export interface LocalProductSection {
  sectionId: number;
  docId: number;
  docTitle: string;
  title: string;
  /** «стр. 14–42» — печатными номерами документа. */
  pages: string;
  page: number;
  /** Путь относительно API — ссылку даёт sourceHref. */
  url: string;
  role: LocalRole;
  /** false — связь только по заголовку, модель раздел ещё не разобрала. */
  byModel: boolean;
  status: LocalSection["status"];
  summary: string | null;
}

export interface LocalProductSources {
  up: LocalProductSection[];
  down: LocalProductSection[];
  web: { up: TechnologySource[]; down: TechnologySource[] };
}

/**
 * Сколько источников у продукта: разделов документов (всего и по
 * направлениям) и сохранённых веб-источников.
 */
export interface LocalSourceCounts {
  local: number;
  localDir?: { up: number; down: number };
  web: { up: number; down: number };
}

export interface UploadResult {
  document: LocalDocument;
  /** Такой файл уже был в базе — повторно не добавлен. */
  duplicate: boolean;
  warnings: string[];
}

/** Понятная причина отказа сервера (или прокси перед ним). */
function reason(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    // Ответа нет вовсе: оборвалась связь или браузер не пропустил ответ
    // (CORS) — axios называет это «Network Error», что ничего не объясняет.
    if (!e.response && e.code !== "ERR_CANCELED") {
      return "Сервер не ответил: оборвалась связь или браузер не пропустил ответ (CORS). Если повторяется — проверьте, что сервер обновлён и запущен.";
    }
    // 413 от nginx приходит HTML-страницей, без нашего JSON: прокси отрезал
    // файл раньше, чем он дошёл до сервера.
    if (e.response?.status === 413 && !serverReason(e.response.data)) {
      return "Файл больше, чем пропускает прокси-сервер (nginx). Нужно поднять client_max_body_size — см. LOCAL-SOURCES.md на сервере.";
    }
    // 404 без нашего JSON: такого адреса на сервере нет вовсе — он ещё не
    // обновлён до версии с базой источников.
    if (e.response?.status === 404 && !serverReason(e.response.data)) {
      return "Сервер пока не знает о базе источников — его нужно обновить: git pull, npm install, pm2 restart (см. LOCAL-SOURCES.md на сервере).";
    }
    return serverReason(e.response?.data) || e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export async function listLocalDocuments(): Promise<LocalDocument[]> {
  try {
    const { data } = await axios.get(`${base()}/local-sources/documents`);
    return data.documents ?? [];
  } catch (e) {
    throw new Error(reason(e, "Не удалось получить список документов"));
  }
}

/**
 * Кусок загрузки. Перед сервером стоит nginx: запрос больше
 * client_max_body_size (по умолчанию 1 МБ) он обрывает, не спросив сервер, —
 * и без CORS-заголовков, так что браузер видит только «CORS error».
 */
const CHUNK_BYTES = 512 * 1024;

/**
 * Номер загрузки. crypto.randomUUID есть только на https и localhost, а
 * getRandomValues — везде.
 */
function newUploadId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Загрузить PDF — кусками по 512 КБ: так файл любого размера проходит через
 * nginx с настройками по умолчанию. Имя и модель — в адресе, а не своими
 * заголовками: nginx ставит CORS сам и пропускает только заголовки из
 * своего списка. Сервер собирает куски и, получив последний, добавляет
 * документ — его и возвращает.
 */
export async function uploadLocalDocument(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  if (!file.size) throw new Error("Файл пустой.");
  // Модель разбора — выбранная в приложении (разбор раздела — такая же
  // выжимка в JSON, как заполнение карточки).
  const { provider, model } = getAiRequestFields({ stage: "card" });
  const id = newUploadId();
  const params = {
    size: file.size,
    name: file.name,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
  let offset = 0;
  // Обрывы связи и несовпадения с сервером — подряд, без удачного куска.
  let retries = 0;
  try {
    for (;;) {
      const chunk = file.slice(offset, Math.min(file.size, offset + CHUNK_BYTES));
      try {
        const { data } = await axios.post(`${base()}/local-sources/uploads/${id}`, chunk, {
          params: { ...params, offset },
          headers: { "Content-Type": "application/octet-stream" },
          onUploadProgress: (ev) =>
            onProgress?.(Math.min(1, (offset + (ev.loaded ?? 0)) / file.size)),
        });
        // Последний кусок: документ добавлен.
        if (data?.document) return data as UploadResult;
        offset = typeof data?.received === "number" ? data.received : offset + chunk.size;
        retries = 0;
      } catch (e) {
        if (!axios.isAxiosError(e) || retries >= 3) throw e;
        const got = (e.response?.data as { received?: unknown } | undefined)?.received;
        if (e.response?.status === 409 && typeof got === "number") {
          // Сервер получил другое, чем мы думали, — продолжаем с его места.
          offset = got;
        } else if (e.response) {
          throw e;
        } else {
          // Связь оборвалась — тот же кусок ещё раз, чуть погодя.
          await pause(1000 * (retries + 1));
        }
        retries++;
      }
    }
  } catch (e) {
    throw new Error(reason(e, "Не удалось загрузить PDF"));
  }
}

export async function deleteLocalDocument(id: number): Promise<void> {
  try {
    await axios.delete(`${base()}/local-sources/documents/${id}`);
  } catch (e) {
    throw new Error(reason(e, "Не удалось удалить документ"));
  }
}

/** Разделы документа с продуктами и ходом разбора. */
export async function listLocalSections(docId: number): Promise<LocalSection[]> {
  try {
    const { data } = await axios.get(`${base()}/local-sources/documents/${docId}/sections`);
    return data.sections ?? [];
  } catch (e) {
    throw new Error(reason(e, "Не удалось получить разделы документа"));
  }
}

/**
 * Разобрать разделы заново — упавшие или все — выбранной сейчас моделью.
 * Возвращает, сколько разделов ушло в очередь.
 */
export async function redecodeLocalDocument(
  docId: number,
  only: "failed" | "all",
): Promise<number> {
  try {
    const { data } = await axios.post(`${base()}/local-sources/documents/${docId}/decode`, {
      only,
      ...getAiRequestFields({ stage: "card" }),
    });
    return data.queued ?? 0;
  } catch (e) {
    throw new Error(reason(e, "Не удалось поставить разбор в очередь"));
  }
}

/** Сколько источников у продуктов — пачкой, как опознание. */
export async function lookupLocalSources(
  products: string[],
): Promise<Record<string, LocalSourceCounts>> {
  const { data } = await axios.post(`${base()}/local-sources/lookup`, {
    products,
  });
  return data.products ?? {};
}

/** Источники продукта из базы: разделы документов и найденные моделью раньше. */
export async function fetchBaseSources(
  product: string,
  direction: "up" | "down",
): Promise<{ local: TechnologySource[]; web: TechnologySource[] }> {
  const { data } = await axios.post(`${base()}/local-sources/for-product`, {
    product,
    direction,
  });
  return { local: data.local ?? [], web: data.web ?? [] };
}

/**
 * Продукты базы, по алфавиту. graph — продукты графа: у продуктов базы
 * сервер отметит, каким узлам они отвечают.
 */
export async function listLocalProducts(
  graph: string[],
): Promise<{ products: LocalProduct[]; hidden: { intermediates: number } }> {
  try {
    const { data } = await axios.post(`${base()}/local-sources/products`, { graph });
    return { products: data.products ?? [], hidden: data.hidden ?? { intermediates: 0 } };
  } catch (e) {
    throw new Error(reason(e, "Не удалось получить продукты базы"));
  }
}

/** Все источники продукта базы: разделы вверх и вниз, найденное в интернете. */
export async function fetchLocalProductSources(keys: string[]): Promise<LocalProductSources> {
  try {
    const { data } = await axios.post(`${base()}/local-sources/product-sources`, { keys });
    return {
      up: data.up ?? [],
      down: data.down ?? [],
      web: { up: data.web?.up ?? [], down: data.web?.down ?? [] },
    };
  } catch (e) {
    throw new Error(reason(e, "Не удалось получить источники продукта"));
  }
}

/** Ссылка, по которой открыть PDF документа (на странице, если указана). */
export function localDocumentHref(id: number, page?: number): string {
  return `${base()}/local-sources/documents/${id}/file${page ? `#page=${page}` : ""}`;
}

/**
 * Адрес источника для ссылки. У документа из базы адрес — путь относительно
 * API сервера («local-sources/documents/12/file?section=40#page=24»): сервер
 * не знает, по какому адресу его видит браузер, и дописываем его здесь.
 */
export function sourceHref(url: string): string {
  const u = String(url || "").trim();
  return u.startsWith("local-sources/") ? `${base()}/${u}` : u;
}
