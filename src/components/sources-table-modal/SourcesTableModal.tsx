import { useEffect, useMemo, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { SourceRow } from "../../utils/mockSources";
import { normalizeProductName } from "../../utils/normalizeProductName";
import styles from "./SourcesTableModal.module.css";

interface SourcesTableModalProps {
  rows: SourceRow[];
  /** Продукт, из карточки которого открыли таблицу — его источники выделяем. */
  currentProduct: string;
  onClose: () => void;
}

const DirBadge: FC<{ direction: BuildDirection }> = ({ direction }) => (
  <span
    className={`${styles.dirBadge} ${
      direction === "up" ? styles.dirUp : styles.dirDown
    }`}
    title={direction === "up" ? "Построение вверх" : "Построение вниз"}
  >
    {direction === "up" ? "↑ вверх" : "↓ вниз"}
  </span>
);

const Rows: FC<{ rows: SourceRow[]; highlight?: boolean }> = ({
  rows,
  highlight,
}) => (
  <>
    {rows.map((r) => (
      <tr
        key={r.id}
        className={highlight ? styles.rowHighlight : undefined}
      >
        <td className={styles.cellProduct}>{r.product}</td>
        <td className={styles.cellDir}>
          <DirBadge direction={r.direction} />
        </td>
        <td className={styles.cellTitle}>{r.title}</td>
        <td className={styles.cellLink}>
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.url}
          </a>
        </td>
      </tr>
    ))}
  </>
);

export const SourcesTableModal: FC<SourcesTableModalProps> = ({
  rows,
  currentProduct,
  onClose,
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentNorm = useMemo(
    () => normalizeProductName(currentProduct),
    [currentProduct],
  );

  const uniqueProducts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product))).sort(),
    [rows],
  );

  const { currentRows, otherRows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.product.toLowerCase().includes(q))
      : rows;
    const cur: SourceRow[] = [];
    const other: SourceRow[] = [];
    for (const r of filtered) {
      if (normalizeProductName(r.product) === currentNorm) cur.push(r);
      else other.push(r);
    }
    return { currentRows: cur, otherRows: other };
  }, [rows, query, currentNorm]);

  const header = (
    <tr>
      <th className={styles.cellProduct}>Продукт</th>
      <th className={styles.cellDir}>Направление</th>
      <th className={styles.cellTitle}>Название</th>
      <th className={styles.cellLink}>Ссылка</th>
    </tr>
  );

  const nothingFound = currentRows.length === 0 && otherRows.length === 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>Источники</h3>
            <div className={styles.subtitle}>
              Все источники: <b>{rows.length}</b> · продуктов:{" "}
              <b>{uniqueProducts.length}</b>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по продукту…"
            list="sources-products"
          />
          <datalist id="sources-products">
            {uniqueProducts.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {query && (
            <button
              className={styles.clearBtn}
              onClick={() => setQuery("")}
              type="button"
            >
              Сбросить
            </button>
          )}
        </div>

        <div className={styles.body}>
          {nothingFound && (
            <div className={styles.empty}>Ничего не найдено.</div>
          )}

          {currentRows.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Источники этого продукта — «{currentProduct}» ({currentRows.length})
              </div>
              <table className={styles.table}>
                <thead>{header}</thead>
                <tbody>
                  <Rows rows={currentRows} highlight />
                </tbody>
              </table>
            </div>
          )}

          {otherRows.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Другие продукты ({otherRows.length})
              </div>
              <table className={styles.table}>
                <thead>{header}</thead>
                <tbody>
                  <Rows rows={otherRows} />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
