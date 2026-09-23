import { useMemo, useState, type FC } from "react";

import type { TechnologySource } from "../../store/types";
import { AddSourceForm } from "./AddSourceForm";
import { ChevronDownIcon, DatabaseIcon, FileJsonIcon, SearchIcon } from "../icons";
import styles from "./StepWizard.module.css";

interface Props {
  sources: TechnologySource[];
  /** Адреса, снятые из обобщения (в нижнем регистре). */
  excluded: Set<string>;
  onToggle: (url: string) => void;
  onAddManualSource?: (src: {
    title: string;
    url: string;
    description?: string;
  }) => string | null;
  /** Кнопка повторного поиска — своя у каждой стадии, поэтому приходит извне. */
  rightAction?: React.ReactNode;
  disabled?: boolean;
}

/** Домен без www — короткая подпись справа от названия. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Список найденных источников с отбором для обобщения.
 *
 * Оценки качества здесь нет намеренно: поиск её не возвращает, и рисовать
 * «Высокая» / «Средняя» значило бы выдумать её на глазах у человека, который
 * станет по ней решать. Вместо неё — домен: он говорит о надёжности ровно
 * столько, сколько мы действительно знаем.
 *
 * Поле поиска фильтрует уже найденное, а не ищет заново: список из пяти строк
 * фильтровать незачем, но он вырастает, когда источники добирают повторно.
 */
export const StepSourcesList: FC<Props> = ({
  sources,
  excluded,
  onToggle,
  onAddManualSource,
  rightAction,
  disabled,
}) => {
  const [query, setQuery] = useState("");
  const [openUrls, setOpenUrls] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) =>
      [s.title, s.url, s.technology_description]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [sources, query]);

  const selected = sources.filter(
    (s) => !excluded.has((s.url || "").trim().toLowerCase()),
  ).length;

  const toggleOpen = (url: string) =>
    setOpenUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <div className={styles.sourcesBlock}>
      <div className={styles.searchRow}>
        <span className={styles.searchField}>
          <SearchIcon size={17} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Поиск по источникам (название, домен, тема…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        {rightAction}
      </div>

      <div className={styles.sourcesCard}>
        <div className={styles.sourcesHead}>
          <span className={styles.sourcesHeadIcon}>
            <DatabaseIcon size={20} />
          </span>
          <span className={styles.sourcesHeadText}>
            <span className={styles.sourcesTitle}>
              Источники ({sources.length})
            </span>
            <span className={styles.sourcesHint}>
              Выберите, какие пойдут в обобщение
            </span>
          </span>
          <span className={styles.sourcesCount}>
            Выбрано: <b>{selected}</b> из {sources.length}
          </span>
        </div>

        {shown.length === 0 ? (
          <div className={styles.sourcesEmpty}>
            По запросу «{query}» ничего не нашлось.
          </div>
        ) : (
          <ul className={styles.sourceList}>
            {shown.map((s) => {
              const key = (s.url || "").trim().toLowerCase();
              const open = openUrls.has(s.url);
              const domain = domainOf(s.url);
              return (
                <li key={s.url} className={styles.sourceRow}>
                  <div className={styles.sourceMain}>
                    <input
                      type="checkbox"
                      className={styles.sourceCheck}
                      checked={!excluded.has(key)}
                      onChange={() => onToggle(s.url)}
                      disabled={disabled}
                      title="Использовать этот источник при обобщении"
                    />
                    <span className={styles.sourceIcon}>
                      <FileJsonIcon size={17} />
                    </span>
                    <span className={styles.sourceName}>{s.title || s.url}</span>
                    {domain && <span className={styles.sourceDomain}>{domain}</span>}
                    <button
                      type="button"
                      className={`${styles.sourceMore} ${open ? styles.sourceMoreOpen : ""}`}
                      onClick={() => toggleOpen(s.url)}
                      aria-label={open ? "Свернуть" : "Подробнее"}
                      aria-expanded={open}
                    >
                      <ChevronDownIcon size={17} />
                    </button>
                  </div>

                  {open && (
                    <div className={styles.sourceBody}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.sourceLink}
                      >
                        {s.url}
                      </a>
                      {s.technology_description && (
                        <p className={styles.sourceDesc}>
                          {s.technology_description}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {onAddManualSource && (
          <div className={styles.addSource}>
            <AddSourceForm onAdd={onAddManualSource} />
          </div>
        )}
      </div>
    </div>
  );
};
