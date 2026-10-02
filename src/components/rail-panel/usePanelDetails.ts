import { useEffect, useState, type ReactNode } from "react";

/** Выбор один на все вкладки «Базы данных» и переживает перезагрузку. */
const STORAGE_KEY = "rail-panel-details";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Сводка и отборы над списком в боковой панели: показаны или скрыты.
 *
 * На экране 1080p чипы, переключатели и пояснения занимали почти всю высоту
 * панели, и от списка продуктов оставалось три строки. Над списком остаётся
 * поиск, остальное — по кнопке рядом с ним (DetailsToggle). По умолчанию
 * скрыто.
 */
export function usePanelDetails(): [boolean, () => void] {
  const [open, setOpen] = useState(readStored);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // Хранилище недоступно (приватный режим) — просто не запомним.
    }
  }, [open]);
  return [open, () => setOpen((v) => !v)];
}

/**
 * Сводка вкладки, собранная выше списка: «База источников» отдаёт её виду
 * («Продукты» или «Документы»), а тот ставит под своей строкой поиска.
 */
export interface PanelDetailsSlot {
  open: boolean;
  toggle: () => void;
  /** Чипы и переключатель видов — что показать, когда сводка раскрыта. */
  content: ReactNode;
}
