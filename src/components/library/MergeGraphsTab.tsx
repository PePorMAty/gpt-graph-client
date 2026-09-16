import { useMemo, useState } from "react";

import type { SavedGraphFile, SavedGraphMeta } from "../../store/types";
import { loadSavedGraph } from "../../store/api/saved-graph-api";
import {
  computeMergeChain,
  useMergeGraph,
  type MergeGraphState,
} from "../../hooks/useMergeGraph";
import {
  applyPresentationRename,
  reconstructPresentationColors,
} from "../../utils/presentationColors";
import { reconstructSourcesPool } from "../../utils/reconstructSourcesPool";
import { useAppDispatch } from "../../store/hooks";
import { renamePresentation } from "../../store/slices/gptSlice";
import {
  MergePreviewModal,
  type MergePreviewResult,
} from "./MergePreviewModal";
import { showToast } from "../toast/toastStore";
import { Button } from "../ui/Button";
import { SearchIcon } from "../icons";
import {
  MergeReportModal,
  type MergeReportRow,
} from "../upload-graph/MergeReportModal";
import styles from "./LibraryScreen.module.css";

/**
 * Файл сохранённого графа → состояние, с которого начинается объединение.
 * Реестр цветов и пул источников на сервер не сохраняются целиком, поэтому
 * восстанавливаем их по узлам — так же, как при открытии графа на полотне.
 */
function fileToMergeState(
  file: SavedGraphFile,
  fallbackName: string,
): MergeGraphState {
  const nodes = file.graph.nodes;
  const sources = file.state.sources ?? reconstructSourcesPool(nodes);
  return {
    nodes,
    edges: file.graph.edges,
    presentationColors: reconstructPresentationColors(nodes),
    originalPrompt: file.meta.prompt?.trim() || fallbackName,
    sourcesPool: sources.pool,
    sourcesSeqCounter: sources.seqCounter,
  };
}

interface MergeGraphsTabProps {
  /** Граф-основа: выбранный в библиотеке. */
  base: SavedGraphMeta;
  /** Все сохранённые графы; граф-основа из списка исключается. */
  items: SavedGraphMeta[];
  /**
   * Положить граф-основу на полотно перед объединением. Библиотека может
   * сперва спросить про несохранённые правки; false — пользователь отменил.
   */
  onOpenBase: () => Promise<boolean>;
  /** Перейти на полотно и вписать результат в экран. */
  onDone: () => void;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Вкладка «Объединить с графами»: к выбранному в библиотеке графу присоединяются
 * отмеченные. Основа кладётся на полотно перед слиянием, результат остаётся
 * там же, и после объединения открывается вкладка «Граф».
 *
 * Сама логика слияния — общая с загрузкой из файла (см. useMergeGraph),
 * здесь только выбор и запуск.
 */
export const MergeGraphsTab = ({
  base,
  items,
  onOpenBase,
  onDone,
}: MergeGraphsTabProps) => {
  const mergeSource = useMergeGraph();
  const dispatch = useAppDispatch();

  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MergePreviewResult | null>(null);
  /**
   * Переименования источников, сделанные в превью.
   *
   * Настоящее объединение считается заново и от превью ничего не наследует,
   * поэтому правки легенды держим отдельным списком и повторяем их на полотне
   * после слияния. Список упорядочен: A→B, потом B→C дают C.
   */
  const [renames, setRenames] = useState<{ from: string; to: string }[]>([]);
  const [report, setReport] = useState<{
    presentationName: string | null;
    commonNodes: MergeReportRow[];
    addedCount: number;
  } | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((g) => g.id !== base.id)
      .filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [items, base.id, query]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickedNames = items
    .filter((g) => checked.has(g.id))
    .map((g) => g.name);

  /**
   * Посчитать объединение и показать его в окне превью. Стор не трогаем:
   * пользователь ещё не решил, объединять ли.
   */
  const openPreview = async () => {
    const picked = items.filter((g) => checked.has(g.id));
    if (!picked.length) return;

    setPreview(null);
    setPreviewError(null);
    setRenames([]);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const baseFile = await loadSavedGraph(base.id);
      const sources = await Promise.all(
        picked.map(async (g) => ({
          input: await loadSavedGraph(g.id),
          name: g.name,
        })),
      );
      const merged = await computeMergeChain(
        fileToMergeState(baseFile, base.name),
        sources,
      );
      setPreview({
        nodes: merged.state.nodes,
        edges: merged.state.edges,
        commonNodes: merged.commonNodes,
        addedCount: merged.addedCount,
        presentationColors: merged.state.presentationColors,
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * Переименовать источник в превью: цвет на схеме должен поехать за именем
   * сразу, поэтому правим и посчитанное состояние, и список для повтора.
   */
  const renameInPreview = (from: string, to: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = applyPresentationRename(
        prev.nodes,
        prev.presentationColors,
        from,
        to,
      );
      return {
        ...prev,
        nodes: next.nodes,
        presentationColors: next.colors,
        commonNodes: prev.commonNodes.map((row) => ({
          ...row,
          presentations: row.presentations.map((p) => (p === from ? to : p)),
        })),
      };
    });
    setRenames((prev) => [...prev, { from, to }]);
  };

  /** Имя источника после всех правок легенды, сделанных в превью. */
  const renamed = (name: string) =>
    renames.reduce((cur, r) => (cur === r.from ? r.to : cur), name);

  const runMerge = async () => {
    const picked = items.filter((g) => checked.has(g.id));
    if (!picked.length) return;

    setBusy(true);
    try {
      // Основа объединения — выбранный в библиотеке граф, а не то, что
      // случайно осталось на полотне: сначала кладём его туда. Отказ (отмена
      // в вопросе о несохранённых правках) объясняет себя сам — молча выходим.
      if (!(await onOpenBase())) return;

      // Графы присоединяются по очереди: каждый следующий сливается с уже
      // объединённым результатом, поэтому общие продукты схлопываются по
      // всем выбранным, а не только попарно.
      let last = null as Awaited<ReturnType<typeof mergeSource>> | null;
      for (const g of picked) {
        const file = await loadSavedGraph(g.id);
        last = await mergeSource(file, g.name);
      }

      // Слияние считалось заново, с исходными именами графов — повторяем
      // правки легенды, сделанные в превью.
      for (const r of renames) dispatch(renamePresentation(r));

      if (last) {
        setReport({
          ...last.report,
          presentationName: last.report.presentationName
            ? renamed(last.report.presentationName)
            : null,
          commonNodes: last.report.commonNodes.map((row) => ({
            ...row,
            presentations: row.presentations.map(renamed),
            labelsByPresentation: row.labelsByPresentation
              ? Object.fromEntries(
                  Object.entries(row.labelsByPresentation).map(([k, v]) => [
                    renamed(k),
                    v,
                  ]),
                )
              : undefined,
          })),
        });
      }
      setRenames([]);
      showToast(
        "success",
        `Объединено графов: ${picked.length + 1}. Результат на полотне.`,
      );
      setChecked(new Set());
      onDone();
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
                      Обновлён {formatDate(g.updatedAt || g.createdAt)}
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
          К графу «{base.name}» присоединится: <b>{checked.size}</b>
        </div>

        <div className={styles.mergeActions}>
          <Button
            variant="primary"
            block
            onClick={runMerge}
            disabled={busy || checked.size === 0}
          >
            {busy ? "Объединяю…" : "Объединить графы"}
          </Button>
          <Button block onClick={openPreview} disabled={busy || checked.size === 0}>
            Превью
          </Button>
        </div>
      </aside>

      <MergePreviewModal
        open={previewOpen}
        baseName={base.name}
        names={pickedNames}
        result={preview}
        loading={previewLoading}
        error={previewError}
        onRename={renameInPreview}
        onCancel={() => setPreviewOpen(false)}
        onConfirm={() => {
          // Окно закрываем до слияния: дальше может встать вопрос о
          // несохранённых правках, и две модалки друг на друге не нужны.
          setPreviewOpen(false);
          void runMerge();
        }}
      />

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
