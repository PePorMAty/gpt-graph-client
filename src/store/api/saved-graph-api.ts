import axios from "axios";
import type {
  SavedGraphFile,
  SavedGraphMeta,
  SaveGraphPayload,
} from "../types";
import { sendCompressed } from "./compressedBody";

/** Граф на сервер — сжатым, если сервер это понимает (см. compressedBody.ts). */
function sendGraph(method: "post" | "put", url: string, payload: SaveGraphPayload) {
  return sendCompressed(payload, (body, contentType) =>
    axios.request({
      method,
      url,
      data: body,
      headers: contentType ? { "Content-Type": contentType } : undefined,
    }),
  );
}

export async function saveGraph(payload: SaveGraphPayload) {
  const { data } = await sendGraph(
    "post",
    `${import.meta.env.VITE_API_URL}/graph-files/save`,
    payload,
  );
  return data;
}

export async function fetchSavedGraphs(): Promise<SavedGraphMeta[]> {
  const { data } = await axios.get(
    `${import.meta.env.VITE_API_URL}/graph-files`
  );

  if (!data.success) {
    throw new Error("Failed to load saved graphs");
  }

  return data.data;
}

export async function loadSavedGraph(id: string): Promise<SavedGraphFile> {
  const { data } = await axios.get(
    `${import.meta.env.VITE_API_URL}/graph-files/${id}`
  );
  return data;
}

export async function deleteSavedGraph(id: string): Promise<void> {
  await axios.delete(`${import.meta.env.VITE_API_URL}/graph-files/${id}`);
}

/**
 * Граф сохранил кто-то другой, пока его правили: версия, с которой его
 * открыли, — не последняя. current — мета свежей версии (имя, когда).
 */
export class GraphConflictError extends Error {
  current: SavedGraphMeta;
  constructor(current: SavedGraphMeta) {
    super("граф изменили, пока вы работали");
    this.current = current;
  }
}

/**
 * Обновить (перезаписать содержимое) уже сохранённый граф — тот же файл/id.
 * payload.version — версия, с которой граф открыли: сервер с версиями
 * (с 2026-11-18) отвечает 409, если её уже перезаписали, — тогда
 * GraphConflictError. Без версии — сохраняет как раньше.
 */
export async function updateSavedGraph(
  id: string,
  payload: SaveGraphPayload,
): Promise<SavedGraphMeta> {
  try {
    const { data } = await sendGraph(
      "put",
      `${import.meta.env.VITE_API_URL}/graph-files/${id}`,
      payload,
    );
    return data.data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.current) {
      throw new GraphConflictError(e.response.data.current as SavedGraphMeta);
    }
    throw e;
  }
}

/** Понятный текст ошибки сохранения: «Network Error» человеку ничего не говорит. */
export function saveErrorText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return "сервер не ответил — проверьте связь и сохраните ещё раз";
    const msg = (e.response.data as { error?: string } | undefined)?.error;
    return `сервер ответил ошибкой ${e.response.status}${msg ? ` (${msg})` : ""}`;
  }
  return e instanceof Error ? e.message : String(e);
}

// Переименовать сохранённый граф (меняется только имя, id стабилен).
export async function renameSavedGraph(
  id: string,
  name: string,
): Promise<SavedGraphMeta> {
  const { data } = await axios.patch(
    `${import.meta.env.VITE_API_URL}/graph-files/${id}`,
    { name },
  );
  return data.data;
}

/**
 * Изменить описание графа («О графе» в библиотеке).
 *
 * Тот же PATCH, что и переименование: сервер обновляет только переданные поля.
 * Поле description на бэке появилось позже имени — если ответа с ним ещё нет,
 * возвращаем то, что пришло, а UI показывает свой текст (см. слайс).
 */
export async function updateGraphDescription(
  id: string,
  description: string,
): Promise<SavedGraphMeta> {
  const { data } = await axios.patch(
    `${import.meta.env.VITE_API_URL}/graph-files/${id}`,
    { description },
  );
  return data.data;
}
