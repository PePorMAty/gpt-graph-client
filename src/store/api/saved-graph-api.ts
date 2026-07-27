import axios from "axios";
import type {
  SavedGraphFile,
  SavedGraphMeta,
  SaveGraphPayload,
} from "../types";

export async function saveGraph(payload: SaveGraphPayload) {
  const { data } = await axios.post(
    `${import.meta.env.VITE_API_URL}/graph-files/save`,
    payload
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

// Обновить (перезаписать содержимое) уже сохранённый граф — тот же файл/id.
export async function updateSavedGraph(
  id: string,
  payload: SaveGraphPayload,
): Promise<SavedGraphMeta> {
  const { data } = await axios.put(
    `${import.meta.env.VITE_API_URL}/graph-files/${id}`,
    payload,
  );
  return data.data;
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
