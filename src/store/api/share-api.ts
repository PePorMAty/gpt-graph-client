import axios from "axios";
import type { SaveGraphPayload, SavedGraphFile } from "../types";

interface ShareGraphResponse {
  success: boolean;
  id: string;
}

/** Сохраняет текущий граф как шарный снапшот и возвращает короткий id для ссылки. */
export async function shareGraph(
  payload: SaveGraphPayload,
): Promise<{ id: string }> {
  const { data } = await axios.post<ShareGraphResponse>(
    `${import.meta.env.VITE_API_URL}/graphs/share`,
    payload,
  );
  if (!data?.success || !data.id) {
    throw new Error("Failed to share graph");
  }
  return { id: data.id };
}

/** Загружает шарный граф по короткому id (форма SavedGraphFile). */
export async function loadSharedGraph(id: string): Promise<SavedGraphFile> {
  const { data } = await axios.get<SavedGraphFile>(
    `${import.meta.env.VITE_API_URL}/graphs/share/${id}`,
  );
  return data;
}
