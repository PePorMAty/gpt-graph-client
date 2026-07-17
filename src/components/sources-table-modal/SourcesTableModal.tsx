import { useEffect, useMemo, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { SourceGroup } from "../../utils/sourceRows";
import { normalizeProductName } from "../../utils/normalizeProductName";
import styles from "./SourcesTableModal.module.css";

interface SourcesTableModalProps {
  groups: SourceGroup[];
  /** Продукт, из ноды которого открыли таблицу — его источники выделяем. */
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

/** Таблица источников для набора «своих» групп (у каждой — свои источники). */
const SourceTable: FC<{
  groups: SourceGroup[];
  showProduct?: boolean;
  highlight?: boolean;
}> = ({ groups, showProduct = true, highlight }) => (
  <table className={styles.table}>
    <thead>
      <tr>
        {showProduct && <th className={styles.cellProduct}>Продукт</th>}
        <th className={styles.cellDir}>Направление</th>
        <th className={styles.cellTitle}>Название</th>
        <th className={styles.cellLink}>Ссылка</th>
      </tr>
    </thead>
    <tbody>
      {groups.flatMap((g) =>
        g.sources.map((s, i) => (
          <tr
            key={`${g.id}::${i}`}
            className={highlight ? styles.rowHighlight : undefined}
          >
            {showProduct && (
              <td className={styles.cellProduct}>{g.product}</td>
            )}
            <td className={styles.cellDir}>
              <DirBadge direction={g.direction} />
            </td>
            <td className={styles.cellTitle}>{s.title}</td>
            <td className={styles.cellLink}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url}
              </a>
            </td>
          </tr>
        )),
      )}
    </tbody>
  </table>
);

export const SourcesTableModal: FC<SourcesTableModalProps> = ({
  groups,
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
    () => Array.from(new Set(groups.map((g) => g.product))).sort(),
    [groups],
  );

  const { currentGroups, otherOwnGroups, totalOwn } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (g: SourceGroup) =>
      !q || g.product.toLowerCase().includes(q);
    const cur: SourceGroup[] = [];
    let total = 0;
    for (const g of groups) {
      if (!g.inheritedFrom) total += g.sources.length;
      if (!matches(g)) continue;
      if (!!currentProduct && normalizeProductName(g.product) === currentNorm) {
        cur.push(g);
      }
    }
    // Наборы, уже показанные в секции текущего продукта как унаследованные:
    // их origin-группы не дублируем в «Другие продукты» (содержимое идентично).
    const shownOrigins = new Set(
      cur
        .filter((g) => g.inheritedFrom)
        .map((g) => `${normalizeProductName(g.inheritedFrom as string)}::${g.direction}`),
    );
    const other: SourceGroup[] = [];
    for (const g of groups) {
      if (!matches(g)) continue;
      if (!!currentProduct && normalizeProductName(g.product) === currentNorm)
        continue;
      if (g.inheritedFrom) continue; // унаследованные чужие не дублируем
      if (shownOrigins.has(`${normalizeProductName(g.product)}::${g.direction}`))
        continue;
      other.push(g);
    }
    return { currentGroups: cur, otherOwnGroups: other, totalOwn: total };
  }, [groups, query, currentNorm, currentProduct]);

  const currentOwn = currentGroups.filter((g) => !g.inheritedFrom);
  const currentInherited = currentGroups.filter((g) => g.inheritedFrom);

  const nothing = currentGroups.length === 0 && otherOwnGroups.length === 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>Источники</h3>
            <div className={styles.subtitle}>
              Все источники: <b>{totalOwn}</b> · продуктов:{" "}
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
          {nothing && <div className={styles.empty}>Ничего не найдено.</div>}

          {currentGroups.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Источники этого продукта — «{currentProduct}»
              </div>
              {currentInherited.map((g) => (
                <div key={g.id}>
                  <div className={styles.inheritNote}>
                    <DirBadge direction={g.direction} /> источники наследованы
                    от «{g.inheritedFrom}»
                  </div>
                  {/* Показываем сами унаследованные источники, чтобы не искать
                      продукт-предок на графе. */}
                  <SourceTable groups={[g]} showProduct={false} highlight />
                </div>
              ))}
              {currentOwn.length > 0 && (
                <SourceTable groups={currentOwn} showProduct={false} highlight />
              )}
            </div>
          )}

          {otherOwnGroups.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Другие продукты</div>
              <SourceTable groups={otherOwnGroups} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
