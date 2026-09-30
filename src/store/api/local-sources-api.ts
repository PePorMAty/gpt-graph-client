// Локальная база источников на сервере: PDF заказчика и источники, которые
// модель находила раньше (сервер копит их сам). См. LOCAL-SOURCES.md сервера.

import axios from "axios";

import type { TechnologySource } from "../types";
import { serverReason } from "./serverReason";

const base = () => import.meta.env.VITE_API_URL;

export interface LocalDocument {
  id: number;
  fileName: string;
  title: string;
  pages: number;
  /** Страниц без текста (сканы, рисунки) — их содержимое в поиск не попало. */
  textlessPages: number;
  chars: number;
  bytes: number;
  chunks?: number;
  addedAt: string;
  addedVia: "ui" | "script";
}

/** Сколько источников у продукта: PDF (без направления) и сохранённых веб. */
export interface LocalSourceCounts {
  local: number;
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
 * Загрузить PDF. Тело запроса — сам файл, имя — заголовком (кириллицу
 * кодируем: в заголовках она не ходит).
 */
export async function uploadLocalDocument(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  try {
    const { data } = await axios.post(`${base()}/local-sources/documents`, file, {
      headers: {
        "Content-Type": "application/pdf",
        "X-File-Name": encodeURIComponent(file.name),
      },
      onUploadProgress: (ev) => {
        if (ev.total) onProgress?.(ev.loaded / ev.total);
      },
    });
    return data;
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

/** Сколько источников у продуктов — пачкой, как опознание. */
export async function lookupLocalSources(
  products: string[],
): Promise<Record<string, LocalSourceCounts>> {
  const { data } = await axios.post(`${base()}/local-sources/lookup`, {
    products,
  });
  return data.products ?? {};
}

/** Источники продукта из базы: PDF и найденные моделью раньше. */
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

/** Ссылка, по которой открыть PDF документа (на странице, если указана). */
export function localDocumentHref(id: number, page?: number): string {
  return `${base()}/local-sources/documents/${id}/file${page ? `#page=${page}` : ""}`;
}

/**
 * Адрес источника для ссылки. У PDF из локальной базы адрес — путь
 * относительно API сервера («local-sources/documents/12/file#page=3»): сервер
 * не знает, по какому адресу его видит браузер, и дописываем его здесь.
 */
export function sourceHref(url: string): string {
  const u = String(url || "").trim();
  return u.startsWith("local-sources/") ? `${base()}/${u}` : u;
}
