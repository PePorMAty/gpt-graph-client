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
