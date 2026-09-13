import type { AppDispatch } from "../store/store";
import { setGraphData } from "../store/slices/gptSlice";
import { clearOpenedGraph } from "../store/slices/savedGraphSlice";

/** Ключ автосейва текущей сессии (страховка от перезагрузки вкладки). */
export const AUTOSAVE_KEY = "autosave-graph";

/**
 * Полная очистка полотна: узлы, привязка к сохранённому файлу и автосейв.
 *
 * Привязку снимаем обязательно — иначе «Сохранить» предложил бы перезаписать
 * чужой сейв пустым или уже другим графом.
 */
export function clearCanvas(dispatch: AppDispatch) {
  dispatch(setGraphData({ nodes: [], edges: [] }));
  dispatch(clearOpenedGraph());
  try {
    localStorage.removeItem("saved-graph");
    sessionStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* приватный режим — хранилище недоступно, полотно всё равно очищено */
  }
}
