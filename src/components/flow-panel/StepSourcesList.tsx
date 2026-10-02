import { useMemo, useState, type FC } from "react";

import type { TechnologySource } from "../../store/types";
import { sourceHref } from "../../store/api/local-sources-api";
import {
  isLocalSource,
  isSavedSource,
  localSourceTag,
} from "../../utils/sourceOrigin";
import { AddSourceForm } from "./AddSourceForm";
import {
  ChevronDownIcon,
  DatabaseIcon,
  FileJsonIcon,
  FilePdfIcon,
  SearchIcon,
} from "../icons";
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

function savedTitle(s: TechnologySource): string {
  const d = s.savedAt ? new Date(s.savedAt) : null;
  const when = d && !Number.isNaN(d.getTime()) ? ` ${d.toLocaleDateString("ru-RU")}` : "";
  return `Найден моделью раньше${when} и сохранён в базе сервера — повторно искать не пришлось`;
}

/**
 * Список найденных источников с отбором для обобщения.
 *
 * Источники из базы сервера помечены: разделы документов — «ИТС 18 · стр.
 * 14–42» (они стоят первыми и первыми идут в обобщение), найденные моделью
 * раньше — «из базы».
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
  const pdfCount = sources.filter((s) => isLocalSource(s)).length;

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
              {pdfCount > 0 && " · разделы документов из базы идут первыми"}
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
              const local = isLocalSource(s);
              const domain = local ? "" : domainOf(s.url);
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
                    <span
                      className={`${styles.sourceIcon} ${local ? styles.sourceIconPdf : ""}`}
                    >
                      {local ? <FilePdfIcon size={17} /> : <FileJsonIcon size={17} />}
                    </span>
                    <span className={styles.sourceName}>{s.title || s.url}</span>
                    {local && s.prospective && (
                      <span
                        className={styles.sourceSaved}
                        title="Процесс ещё не освоен промышленностью: обобщение поставит его альтернативой, а не основным путём"
                      >
                        перспективная
                      </span>
                    )}
                    {local && (
                      <span
                        className={styles.sourcePdf}
                        title="Раздел документа из базы источников на сервере"
                      >
                        {localSourceTag(s)}
                      </span>
                    )}
                    {!local && isSavedSource(s) && (
                      <span className={styles.sourceSaved} title={savedTitle(s)}>
                        из базы
                      </span>
                    )}
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
                        href={sourceHref(s.url)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.sourceLink}
                      >
                        {local ? "Открыть документ на этом разделе" : s.url}
                      </a>
                      {local && s.access_hint && (
                        <p className={styles.sourceHint}>{s.access_hint}</p>
                      )}
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
