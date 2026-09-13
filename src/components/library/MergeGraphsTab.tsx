import { useMemo, useState } from "react";

import type { SavedGraphMeta } from "../../store/types";
import { loadSavedGraph } from "../../store/api/saved-graph-api";
import { useMergeGraph } from "../../hooks/useMergeGraph";
import { showToast } from "../toast/toastStore";
import { Button } from "../ui/Button";
import { SearchIcon } from "../icons";
import {
  MergeReportModal,
  type MergeReportRow,
} from "../upload-graph/MergeReportModal";
import styles from "./LibraryScreen.module.css";

interface MergeGraphsTabProps {
  /** Граф, к которому присоединяем остальные (уже открыт на полотне). */
  baseName: string;
  /** Все сохранённые графы; текущий из списка исключается. */
  items: SavedGraphMeta[];
  currentId: string;
  /** Открыть полотно после объединения. */
  onDone: () => void;
}

/**
 * Вкладка «Объединить графы»: к открытому графу присоединяются отмеченные
 * сохранённые. Сама логика слияния — общая с загрузкой из файла
 * (см. useMergeGraph), здесь только выбор и запуск.
 */
export const MergeGraphsTab = ({
  baseName,
  items,
  currentId,
  onDone,
}: MergeGraphsTabProps) => {
  const mergeSource = useMergeGraph();

  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{
    presentationName: string | null;
    commonNodes: MergeReportRow[];
    addedCount: number;
  } | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((g) => g.id !== currentId)
      .filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [items, currentId, query]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runMerge = async () => {
    const picked = items.filter((g) => checked.has(g.id));
    if (!picked.length) return;

    setBusy(true);
    try {
      // Графы присоединяются по очереди: каждый следующий сливается с уже
      // объединённым результатом, поэтому общие продукты схлопываются across
      // всех выбранных, а не только попарно.
      let last = null as Awaited<ReturnType<typeof mergeSource>> | null;
      for (const g of picked) {
        const file = await loadSavedGraph(g.id);
        last = await mergeSource(file, g.name);
      }
      if (last) setReport(last.report);
      showToast(
        "success",
        `Объединено графов: ${picked.length + 1}. Результат на полотне.`,
      );
      setChecked(new Set());
    } catch (e) {
      showToast(
        "error",
        "Не удалось объединить графы: " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.mergeTab}>
      <section className={styles.mergePicker}>
        <h3 className={styles.mergeTitle}>Выберите графы для объединения</h3>

        <div className={styles.listSearch}>
          <SearchIcon size={15} className={styles.listSearchIcon} />
          <input
            className={styles.listSearchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по графам…"
          />
        </div>

        {candidates.length === 0 ? (
          <div className={styles.listEmpty}>
            {items.length <= 1
              ? "Других сохранённых графов пока нет."
              : "Ничего не найдено."}
          </div>
        ) : (
          <ul className={styles.mergeList}>
            {candidates.map((g) => (
              <li key={g.id}>
                <label className={styles.mergeRow}>
                  <input
                    type="checkbox"
                    checked={checked.has(g.id)}
                    onChange={() => toggle(g.id)}
                  />
                  <span className={styles.mergeRowText}>
                    <span className={styles.mergeRowName}>{g.name}</span>
                    <span className={styles.mergeRowMeta}>
                      Узлов-листьев: {g.leafCount}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className={styles.mergeSummary}>
        <h3 className={styles.mergeTitle}>Сводка объединения</h3>

        <div className={styles.mergeNote}>
          <div className={styles.mergeNoteTitle}>Как это работает</div>
          Одинаковые продукты в графах находятся автоматически и сливаются в
          один узел. Источники и связи исходных графов сохраняются, а цвет
          показывает, из каких графов пришёл узел.
        </div>

        <div className={styles.mergeCount}>
          К графу «{baseName}» присоединится:{" "}
          <b>{checked.size}</b>
        </div>

        <Button
          variant="primary"
          block
          onClick={runMerge}
          disabled={busy || checked.size === 0}
        >
          {busy ? "Объединяю…" : "Объединить графы"}
        </Button>
        <Button block onClick={onDone} disabled={busy}>
          Перейти к графу
        </Button>
      </aside>

      {report && (
        <MergeReportModal
          presentationName={report.presentationName}
          commonNodes={report.commonNodes}
          addedCount={report.addedCount}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
};
