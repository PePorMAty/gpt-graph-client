import { useEffect, useMemo, useRef, useState } from "react";

import type { SavedGraphFile, SavedGraphMeta } from "../../store/types";
import { sourcesPoolKey } from "../../store/slices/gptSlice";
import { collectGraphSources, type GraphSourcesSummary } from "../../utils/graphSources";
import { reconstructSourcesPool } from "../../utils/reconstructSourcesPool";
import { graphChainLength } from "../../utils/viewportStats";
import { exportGraphJson } from "../../utils/exportGraph";
import { showToast } from "../toast/toastStore";
import { Button } from "../ui/Button";
import { GraphPreview } from "./GraphPreview";
import { MergeGraphsTab } from "./MergeGraphsTab";
import { IndustryGraphPanel } from "../industry/IndustryGraphPanel";
import { codeOverridesByProduct } from "../industry/codeOverrides";
import { GraphSourcesList } from "../rail-panel/GraphSourcesList";
import {
  BranchIcon,
  ChainLengthIcon,
  DatabaseIcon,
  ExportIcon,
  GraphIcon,
  IndustryDataIcon,
  LinkIcon,
  NodesCountIcon,
  PencilIcon,
  TrashIcon,
} from "../icons";
import styles from "./LibraryScreen.module.css";

type Tab = "sources" | "industry" | "merge";

const EMPTY_SOURCES: GraphSourcesSummary = { rows: [], total: 0, products: 0, transformations: 0 };

interface GraphDetailsProps {
  meta: SavedGraphMeta;
  file: SavedGraphFile | null;
  isLoading: boolean;
  error: string | null;
  items: SavedGraphMeta[];
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Положить выбранный граф на полотно, не уходя из библиотеки. */
  onOpenBase: () => Promise<boolean>;
  /** Перейти на полотно (после объединения). */
  onGoToCanvas: () => void;
  /** Сохранить описание графа на сервере. */
  onSaveDescription: (text: string) => Promise<boolean>;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Правая часть библиотеки: превью выбранного графа, сводка и вкладки —
 * источники, промышленные данные и объединение с другими графами.
 *
 * Содержимое считается из самого файла графа: сервер отдаёт в списке только
 * имя и даты, поэтому при выборе графа догружаем его целиком.
 */
export const GraphDetails = ({
  meta,
  file,
  isLoading,
  error,
  items,
  onOpen,
  onRename,
  onDelete,
  onOpenBase,
  onGoToCanvas,
  onSaveDescription,
}: GraphDetailsProps) => {
  const [tab, setTab] = useState<Tab>("sources");
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState("");
  const [savingAbout, setSavingAbout] = useState(false);
  const aboutRef = useRef<HTMLTextAreaElement>(null);

  const nodes = useMemo(() => file?.graph.nodes ?? [], [file]);

  // Названия продуктов графа — по ним вкладка спрашивает реестр. Берём из
  // сохранённого файла: библиотеку открывают, не открывая сам граф.
  const productNames = useMemo(
    () => [
      ...new Set(
        nodes
          .filter((n) => n.type === "product")
          .map((n) => String(n.data?.label ?? "").trim())
          .filter(Boolean),
      ),
    ],
    [nodes],
  );
  const edges = useMemo(() => file?.graph.edges ?? [], [file]);
  // Коды, заданные продуктам вручную, — из того же файла.
  const codeOverrides = useMemo(() => codeOverridesByProduct(nodes), [nodes]);

  const stats = useMemo(
    () => ({
      nodes: nodes.length,
      edges: edges.length,
      levels: nodes.length ? graphChainLength(nodes, edges) : 0,
    }),
    [nodes, edges],
  );

  const sources = useMemo(() => {
    if (!nodes.length) return null;
    // Пул источников берём из сейва, а для старых файлов реконструируем по узлам.
    const pool =
      file?.state.sources?.pool ?? reconstructSourcesPool(nodes).pool;
    return collectGraphSources(nodes, pool, sourcesPoolKey);
  }, [file, nodes]);

  // Описание правится отдельно от промта; у графов, сохранённых до появления
  // поля, его нет — там показываем исходный промт, как и раньше.
  const description = (
    meta.description ??
    file?.meta.description ??
    file?.meta.prompt ??
    ""
  ).trim();

  useEffect(() => {
    if (!editingAbout) return;
    setAboutDraft(description);
    // Курсор сразу в поле, каретка — в конец текста.
    requestAnimationFrame(() => {
      const el = aboutRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    // description намеренно не в зависимостях: черновик берётся один раз, при
    // входе в правку, иначе ответ сервера затирал бы набранное.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAbout]);

  const saveAbout = async () => {
    setSavingAbout(true);
    const ok = await onSaveDescription(aboutDraft.trim());
    setSavingAbout(false);
    if (ok) setEditingAbout(false);
  };

  /**
   * Выгрузить выбранный граф файлом.
   *
   * Отдаём файл ровно в том виде, в каком он лежит на сервере: это тот же
   * формат, что понимает «Загрузить из файла», — выгруженный граф можно
   * вернуть обратно без потерь.
   */
  const exportGraph = () => {
    if (!file) return;
    exportGraphJson(file, meta.name);
    showToast("success", `Файл графа «${meta.name}» сохранён`);
  };

  return (
    <div className={styles.details}>
      {/* ── Шапка ── */}
      <header className={styles.detailsHead}>
        <div className={styles.detailsTitleWrap}>
          <div className={styles.detailsTitleRow}>
            <h1 className={styles.detailsTitle}>{meta.name}</h1>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onRename}
              aria-label="Переименовать граф"
              title="Переименовать граф"
            >
              <PencilIcon size={17} />
            </button>
          </div>
          <div className={styles.detailsDate}>
            Обновлён {formatDateTime(meta.updatedAt || meta.createdAt)}
          </div>
        </div>

        <div className={styles.detailsActions}>
          <Button
            variant="primary"
            onClick={onOpen}
            disabled={isLoading}
            icon={<GraphIcon size={16} />}
          >
            Открыть граф
          </Button>
          <Button
            onClick={exportGraph}
            disabled={isLoading || !file}
            icon={<ExportIcon size={16} />}
          >
            Экспорт
          </Button>
          <Button
            variant="ghost"
            onClick={onDelete}
            icon={<TrashIcon size={16} />}
          >
            Удалить
          </Button>
        </div>
      </header>

      {error && <div className={styles.detailsError}>Ошибка: {error}</div>}

      {/* ── Превью и сводка ── */}
      <div className={styles.detailsTop}>
        <div className={styles.previewCard}>
          {isLoading ? (
            <div className={styles.previewEmpty}>Загружаю граф…</div>
          ) : (
            <GraphPreview nodes={nodes} edges={edges} />
          )}
        </div>

        <section className={styles.about}>
          <div className={styles.aboutHead}>
            <h2 className={styles.aboutTitle}>О графе</h2>
            {!editingAbout && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setEditingAbout(true)}
                aria-label="Изменить описание графа"
                title="Изменить описание графа"
              >
                <PencilIcon size={16} />
              </button>
            )}
          </div>

          {editingAbout ? (
            <>
              <textarea
                ref={aboutRef}
                className={styles.aboutInput}
                value={aboutDraft}
                onChange={(e) => setAboutDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingAbout(false);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveAbout();
                }}
                placeholder="Чем полезен этот граф, что он описывает, на что обратить внимание…"
                rows={4}
              />
              <div className={styles.aboutActions}>
                <Button
                  size="s"
                  variant="primary"
                  onClick={saveAbout}
                  disabled={savingAbout}
                >
                  {savingAbout ? "Сохраняю…" : "Сохранить"}
                </Button>
                <Button
                  size="s"
                  variant="ghost"
                  onClick={() => setEditingAbout(false)}
                  disabled={savingAbout}
                >
                  Отмена
                </Button>
              </div>
            </>
          ) : (
            <p className={styles.aboutText}>
              {description || "Описание не задано."}
            </p>
          )}
          <div className={styles.aboutStats}>
            <span className={styles.aboutStat}>
              <NodesCountIcon size={16} className={styles.aboutStatIcon} />
              Узлов: <b>{stats.nodes}</b>
            </span>
            <span className={styles.aboutStat}>
              <LinkIcon size={16} className={styles.aboutStatIcon} />
              Связей: <b>{stats.edges}</b>
            </span>
            <span className={styles.aboutStat}>
              <ChainLengthIcon size={16} className={styles.aboutStatIcon} />
              Уровней: <b>{stats.levels}</b>
            </span>
          </div>
        </section>
      </div>

      {/* ── Вкладки ── */}
      <nav className={styles.detailsTabs}>
        <button
          type="button"
          className={`${styles.detailsTab} ${tab === "sources" ? styles.detailsTabActive : ""}`}
          onClick={() => setTab("sources")}
        >
          <DatabaseIcon size={16} />
          Источники
        </button>
        <button
          type="button"
          className={`${styles.detailsTab} ${tab === "industry" ? styles.detailsTabActive : ""}`}
          onClick={() => setTab("industry")}
        >
          <IndustryDataIcon size={16} />
          Промышленные данные
        </button>
        <button
          type="button"
          className={`${styles.detailsTab} ${tab === "merge" ? styles.detailsTabActive : ""}`}
          onClick={() => setTab("merge")}
        >
          <BranchIcon size={16} />
          Объединить с графами
        </button>
      </nav>

      <div className={styles.detailsBody}>
        {tab === "sources" && (
          <GraphSourcesList
            summary={sources ?? EMPTY_SOURCES}
            emptyText="В этом графе источников нет."
          />
        )}

        {tab === "industry" && (
          <IndustryGraphPanel
            productNames={productNames}
            codeOverrides={codeOverrides}
          />
        )}

        {tab === "merge" && (
          <MergeGraphsTab
            base={meta}
            items={items}
            onOpenBase={onOpenBase}
            onDone={onGoToCanvas}
          />
        )}
      </div>
    </div>
  );
};
