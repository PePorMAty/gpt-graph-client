import { useMemo, useState } from "react";
import type { FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearHistory,
  type HistoryEntry,
  type HistoryKind,
} from "../../store/slices/historySlice";
import { useFocusNode } from "../../hooks/useFocusNode";
import {
  BranchIcon,
  ChevronDownIcon,
  ClockIcon,
  DatabaseIcon,
  FilterIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  ResetCanvasIcon,
  SaveIcon,
  ChainLengthIcon,
  SearchIcon,
  TrashIcon,
  type IconProps,
} from "../icons";
import styles from "./PanelSection.module.css";

/** Иконка и подпись типа записи. */
const KIND_META: Record<HistoryKind, { Icon: FC<IconProps>; label: string }> = {
  create: { Icon: PlusIcon, label: "Создание" },
  open: { Icon: DatabaseIcon, label: "Открытие" },
  merge: { Icon: BranchIcon, label: "Объединение" },
  add: { Icon: PlusIcon, label: "Добавление" },
  remove: { Icon: TrashIcon, label: "Удаление" },
  edit: { Icon: PencilIcon, label: "Правка" },
  step: { Icon: ChainLengthIcon, label: "Шаг" },
  link: { Icon: LinkIcon, label: "Связь" },
  save: { Icon: SaveIcon, label: "Сохранение" },
  clear: { Icon: ResetCanvasIcon, label: "Очистка" },
};

type Group = "all" | "structure" | "steps" | "edits";

const GROUP_LABEL: Record<Group, string> = {
  all: "Все действия",
  structure: "Структура графа",
  steps: "Построение шагов",
  edits: "Правки и сохранения",
};

const GROUP_KINDS: Record<Exclude<Group, "all">, HistoryKind[]> = {
  structure: ["add", "remove", "link", "merge", "clear"],
  steps: ["step"],
  edits: ["edit", "save", "create", "open"],
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** «Сегодня» / «Вчера» / дата — заголовок группы записей за день. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Сегодня";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Раздел «История»: что делали с текущим графом — по порядку, свежее сверху.
 *
 * Записи собирает historyMiddleware, здесь только показ. Если у записи есть
 * узлы, клик подводит к ним камеру, как в закладках. История привязана к
 * полотну: открытие или создание другого графа её обнуляет.
 */
export const HistorySection = () => {
  const dispatch = useAppDispatch();
  const focusNode = useFocusNode();

  const entries = useAppSelector((s) => s.history.entries);
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const originalPrompt = useAppSelector((s) => s.graph.originalPrompt);
  const title = graphName || originalPrompt || "без названия";

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("all");
  const [groupOpen, setGroupOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (group !== "all" && !GROUP_KINDS[group].includes(e.kind)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.details ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, group]);

  // Записи разбиты по дням: «Сегодня», «Вчера», дата.
  const days = useMemo(() => {
    const out: { day: string; items: HistoryEntry[] }[] = [];
    for (const e of filtered) {
      const day = formatDay(e.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [filtered]);

  /** Узлы записи, которые ещё есть на полотне: к удалённым камеру не подвести. */
  const aliveIds = (entry: HistoryEntry) =>
    (entry.nodeIds ?? []).filter((id) => nodes.some((n) => n.id === id));

  if (entries.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.empty}>
          История пуста. Здесь появятся построенные шаги, добавленные и
          удалённые узлы, правки и сохранения — всё, что делали с этим графом.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.summaryCard}>
        <ClockIcon size={20} className={styles.summaryIcon} />
        <span className={styles.summaryValue}>{entries.length}</span>
        <span className={styles.summaryLabel}>
          {entries.length === 1 ? "действие с графом" : "действий с графом"}
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.search}>
          <SearchIcon size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по истории…"
          />
        </div>

        <div className={styles.filter}>
          <button
            type="button"
            className={`${styles.filterBtn} ${group !== "all" ? styles.filterBtnActive : ""}`}
            onClick={() => setGroupOpen((v) => !v)}
            aria-expanded={groupOpen}
          >
            <FilterIcon size={15} className={styles.filterIcon} />
            {GROUP_LABEL[group]}
            <ChevronDownIcon size={14} className={styles.filterCaret} />
          </button>
          {groupOpen && (
            <div className={styles.filterMenu}>
              {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`${styles.filterItem} ${
                    group === g ? styles.filterItemActive : ""
                  }`}
                  onClick={() => {
                    setGroup(g);
                    setGroupOpen(false);
                  }}
                >
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>Ничего не найдено.</div>
      ) : (
        <div className={styles.historyScroll}>
          {days.map(({ day, items }) => (
            <section key={day} className={styles.historyDay}>
              <h3 className={styles.historyDayTitle}>{day}</h3>
              <ol className={styles.historyList}>
                {items.map((e) => {
                  const { Icon, label } = KIND_META[e.kind];
                  const ids = aliveIds(e);
                  return (
                    <li key={e.id} className={styles.historyItem}>
                      <span
                        className={`${styles.historyIcon} ${
                          styles[`historyIcon_${e.kind}`] ?? ""
                        }`}
                        title={label}
                      >
                        <Icon size={15} />
                      </span>
                      <div className={styles.historyText}>
                        <div className={styles.historyTitle}>{e.title}</div>
                        {e.details && (
                          <div className={styles.historyDetails}>{e.details}</div>
                        )}
                        {ids.length > 0 && (
                          <button
                            type="button"
                            className={styles.historyGoto}
                            onClick={() => focusNode(ids[0])}
                          >
                            Показать на полотне
                          </button>
                        )}
                      </div>
                      <time className={styles.historyTime} dateTime={e.at}>
                        {formatTime(e.at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <span>
          История графа «{title}». Всего записей: {entries.length}
        </span>
        <button
          type="button"
          className={styles.footerBtn}
          onClick={() => dispatch(clearHistory())}
        >
          Очистить историю
        </button>
      </div>
    </div>
  );
};
