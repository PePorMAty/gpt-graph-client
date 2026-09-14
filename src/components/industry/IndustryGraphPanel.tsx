import { useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import { IndustryDataIcon, ShieldCheckIcon, ChevronDownIcon, ChevronRightIcon } from "../icons";
import { IndustryProducers } from "./IndustryProducers";
import styles from "./Industry.module.css";

interface Props {
  /** Названия продуктов текущего графа. */
  productNames: string[];
}

/**
 * Промышленные данные по всему графу — вкладка библиотеки.
 *
 * Карточка отвечает на вопрос об одном продукте, а здесь нужен другой ответ:
 * сколько продуктов графа вообще подтверждено реестром и у кого их брать.
 * Поэтому список свёрнут — производители раскрываются по продукту.
 */
export const IndustryGraphPanel: FC<Props> = ({ productNames }) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );
  const [open, setOpen] = useState<string | null>(null);

  const names = useMemo(
    () => [...new Set(productNames.map((n) => String(n ?? "").trim()).filter(Boolean))],
    [productNames],
  );

  const rows = useMemo(
    () => names.map((name) => ({ name, info: results[industryKey(name)] })),
    [names, results],
  );

  const checked = rows.filter((r) => r.info).length;
  const confirmed = rows.filter((r) => r.info?.found).length;
  const producers = useMemo(() => {
    const inns = new Set<string>();
    for (const r of rows) {
      for (const p of r.info?.producers ?? []) inns.add(p.inn ?? p.producer);
    }
    return inns.size;
  }, [rows]);

  const loading = status === "loading";

  if (!names.length) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>В графе нет продуктов</div>
        <p className={styles.emptyText}>
          Проверять по реестру нечего: промышленные данные собираются по узлам
          продуктов.
        </p>
      </div>
    );
  }

  if (ready === false) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Реестр не подключён</div>
        <p className={styles.emptyText}>
          {reason ??
            "База ГИСП на сервере не найдена. Пока её нет, проверять продукты не по чему."}
        </p>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Проверка по ГИСП не выполнялась</div>
        <p className={styles.emptyText}>
          В графе {names.length} продуктов. Посмотрим по реестру российской
          промышленной продукции, какие из них выпускаются в России и кем.
        </p>
        <button
          type="button"
          className={styles.checkBtn}
          disabled={loading}
          onClick={() => dispatch(checkIndustry(names))}
        >
          <ShieldCheckIcon size={15} />
          {loading ? "Проверяем…" : `Проверить ${names.length} продуктов`}
        </button>
        {error && <p className={styles.note}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {confirmed} из {names.length}
          </span>
          <span className={styles.statLabel}>подтверждено в реестре</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{producers}</span>
          <span className={styles.statLabel}>производителей всего</span>
        </div>
      </div>

      {checked < names.length && (
        <button
          type="button"
          className={styles.checkBtn}
          disabled={loading}
          onClick={() => dispatch(checkIndustry(names))}
        >
          <ShieldCheckIcon size={15} />
          {loading
            ? "Проверяем…"
            : `Проверить остальные ${names.length - checked}`}
        </button>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Продукт графа</th>
              <th>Производителей</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, info }) => {
              const count = info?.producerCount ?? 0;
              const isOpen = open === name;
              return (
                <tr key={name}>
                  <td colSpan={2} style={{ padding: 0 }}>
                    <button
                      type="button"
                      className={styles.productRow}
                      style={{
                        width: "100%",
                        padding: "var(--s-2)",
                        background: "none",
                        border: "none",
                        cursor: count ? "pointer" : "default",
                        textAlign: "left",
                      }}
                      onClick={() => count && setOpen(isOpen ? null : name)}
                    >
                      {count ? (
                        isOpen ? (
                          <ChevronDownIcon size={13} />
                        ) : (
                          <ChevronRightIcon size={13} />
                        )
                      ) : (
                        <span style={{ width: 13 }} />
                      )}
                      <span className={styles.productName}>{name}</span>
                      <span
                        className={`${styles.count} ${count ? "" : styles.countZero}`}
                      >
                        {info ? count : "—"}
                      </span>
                    </button>

                    {isOpen && info?.producers.length ? (
                      <div style={{ padding: "0 var(--s-2) var(--s-2)" }}>
                        <IndustryProducers producers={info.producers} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {actualAt && (
        <p className={styles.foot}>Выгрузка реестра актуальна на {actualAt}</p>
      )}
    </div>
  );
};
