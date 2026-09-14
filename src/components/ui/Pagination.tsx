import { useEffect, useMemo, useState, type FC } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import styles from "./Pagination.module.css";

/** Сколько строк на странице по умолчанию. */
export const PAGE_SIZE = 20;

/**
 * Разбить список на страницы.
 *
 * Таблицы источников и реестровых записей вырастают до сотен строк, и сплошная
 * прокрутка в них бесполезна: до нужного места не долистать, а положение
 * теряется при каждом возврате. Возвращает текущий срез и то, что нужно
 * подвалу со страницами.
 *
 * Страница сбрасывается при смене самого списка — иначе после поиска можно
 * оказаться на девятой странице пустого результата.
 */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => {
    setPage(0);
  }, [items.length]);

  // Список мог укоротиться, пока мы стояли на дальней странице.
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(
    () => items.slice(safe * size, safe * size + size),
    [items, safe, size],
  );

  return {
    slice,
    page: safe,
    pages,
    setPage,
    total: items.length,
    from: items.length ? safe * size + 1 : 0,
    to: Math.min((safe + 1) * size, items.length),
  };
}

interface Props {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
  /** Чего считаем: «источников», «записей». */
  unit?: string;
}

/** Подвал со страницами. На одной странице не показывается. */
export const Pagination: FC<Props> = ({
  page,
  pages,
  from,
  to,
  total,
  onChange,
  unit = "строк",
}) => {
  if (pages <= 1) return null;

  // Окно из пяти номеров вокруг текущего: на двадцати страницах весь ряд
  // не помещается, а первая и последняя нужны всегда.
  const around = [page - 1, page, page + 1].filter((p) => p > 0 && p < pages - 1);
  const numbers = [...new Set([0, ...around, pages - 1])].sort((a, b) => a - b);

  return (
    <div className={styles.wrap}>
      <span className={styles.info}>
        {from}–{to} из {total} {unit}
      </span>

      <div className={styles.pages}>
        <button
          type="button"
          className={styles.arrow}
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
          aria-label="Предыдущая страница"
        >
          <ChevronLeftIcon size={14} />
        </button>

        {numbers.map((n, i) => (
          <span key={n} className={styles.pageSlot}>
            {i > 0 && n - numbers[i - 1] > 1 && (
              <span className={styles.gap}>…</span>
            )}
            <button
              type="button"
              className={`${styles.page} ${n === page ? styles.pageActive : ""}`}
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
            >
              {n + 1}
            </button>
          </span>
        ))}

        <button
          type="button"
          className={styles.arrow}
          disabled={page === pages - 1}
          onClick={() => onChange(page + 1)}
          aria-label="Следующая страница"
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
};
