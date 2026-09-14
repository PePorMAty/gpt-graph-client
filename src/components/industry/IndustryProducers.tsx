import type { FC } from "react";

import type { IndustryProducer } from "../../store/api/industry-api";
import styles from "./Industry.module.css";

interface Props {
  producers: IndustryProducer[];
  /**
   * Список вместо таблицы.
   *
   * В карточке узла ширины около 420 пикселей, и четыре колонки там ломают
   * название предприятия на четыре строки: «АКЦИОНЕРНОЕ / ОБЩЕСТВО /
   * МЕТАФРАКС / КЕМИКАЛС». В библиотеке места вдоволь, и таблица читается лучше.
   */
  compact?: boolean;
}

const regionTitle = (p: IndustryProducer) =>
  p.regionFromInn
    ? "Определён по ИНН — это регион учёта организации, а не обязательно место производства"
    : undefined;

const statusTitle = (p: IndustryProducer) =>
  p.status === "archived" && p.endedAt ? `Прекращена ${p.endedAt}` : undefined;

const StatusChip: FC<{ p: IndustryProducer }> = ({ p }) => (
  <span
    className={`${styles.status} ${
      p.status === "active" ? styles.statusActive : styles.statusArchived
    }`}
    title={statusTitle(p)}
  >
    {p.statusLabel}
  </span>
);

const Region: FC<{ p: IndustryProducer }> = ({ p }) =>
  p.region ? (
    <span
      className={p.regionFromInn ? styles.regionGuess : undefined}
      title={regionTitle(p)}
    >
      {p.region}
    </span>
  ) : (
    <>—</>
  );

/**
 * Производители продукта по реестру.
 *
 * Название из реестра показываем рядом с предприятием: реестр очень дробный
 * («Метанол технический ГОСТ 2222-95», «Метанол технический марка А»), и по
 * какой именно записи нашлось совпадение — существенно.
 */
export const IndustryProducers: FC<Props> = ({ producers, compact = false }) => {
  if (compact) {
    return (
      <ul className={styles.cards}>
        {producers.map((p) => (
          <li key={`${p.inn ?? p.producer}-${p.regNumber ?? p.product}`} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.producer}>{p.producer}</span>
              <StatusChip p={p} />
            </div>
            {p.product && <span className={styles.product}>{p.product}</span>}
            <div className={styles.cardMeta}>
              {p.inn && <span className={styles.inn}>ИНН {p.inn}</span>}
              <span className={styles.region}>
                <Region p={p} />
              </span>
              {p.regNumber && <span className={styles.region}>№ {p.regNumber}</span>}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Производитель</th>
            <th>ИНН</th>
            <th>Регион</th>
            <th>Запись</th>
          </tr>
        </thead>
        <tbody>
          {producers.map((p) => (
            <tr key={`${p.inn ?? p.producer}-${p.regNumber ?? p.product}`}>
              <td>
                <span className={styles.producer}>{p.producer}</span>
                {p.product && <span className={styles.product}>{p.product}</span>}
              </td>
              <td className={styles.inn}>{p.inn ?? "—"}</td>
              <td className={styles.region}>
                <Region p={p} />
              </td>
              <td>
                <StatusChip p={p} />
                {p.regNumber && <span className={styles.product}>№ {p.regNumber}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
