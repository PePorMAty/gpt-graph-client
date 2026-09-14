import { useMemo, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import type { IndustryMatch } from "../../store/api/industry-api";
import { IndustryDataIcon, ShieldCheckIcon } from "../icons";
import { IndustryProducers } from "./IndustryProducers";
import styles from "./Industry.module.css";

/**
 * Насколько уверенно название узла легло на запись реестра.
 *
 * Реестр дробный — 84 тысячи названий на сотню тысяч записей, — и точное
 * совпадение там редкость. Разницу показываем прямо: «нашлось по части слов» и
 * «нашлось целиком» — разные основания доверять числу производителей.
 */
const MATCH_LABELS: Record<IndustryMatch, string> = {
  exact: "точное совпадение названия",
  "all-words": "совпали все слова",
  "core-words": "совпали значимые слова",
  partial: "совпала часть слов",
  prefix: "совпало начало слова",
};

const STRONG: IndustryMatch[] = ["exact", "all-words"];

interface Props {
  /** Название продукта так, как оно записано в узле графа. */
  productName: string;
}

/** Промышленные данные по одному продукту — вкладка карточки. */
export const IndustryPanel: FC<Props> = ({ productName }) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );

  const name = String(productName ?? "").trim();
  const info = useMemo(
    () => (name ? results[industryKey(name)] : undefined),
    [results, name],
  );

  const loading = status === "loading";

  if (!name) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>У узла нет названия</div>
        <p className={styles.emptyText}>
          Искать по реестру нечего: сначала задайте название продукта.
        </p>
      </div>
    );
  }

  // Реестра на сервере нет — честно говорим почему, а не показываем пустоту.
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

  // Проверки ещё не было: слой включают тумблером, но в карточку могли зайти
  // и до этого — даём запустить проверку прямо отсюда.
  if (!info) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Проверка по ГИСП не выполнялась</div>
        <p className={styles.emptyText}>
          Посмотрим в реестре российской промышленной продукции, кто выпускает
          «{name}»: производители, ИНН, регионы и статус реестровой записи.
        </p>
        <button
          type="button"
          className={styles.checkBtn}
          disabled={loading}
          onClick={() => dispatch(checkIndustry([name]))}
        >
          <ShieldCheckIcon size={15} />
          {loading ? "Проверяем…" : "Проверить по ГИСП"}
        </button>
        {error && <p className={styles.note}>{error}</p>}
      </div>
    );
  }

  if (!info.found) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>В реестре не найдено</div>
        <p className={styles.emptyText}>
          Продукта «{name}» нет среди записей реестра. Это не значит, что его не
          выпускают: реестр ПП №719 охватывает продукцию, заявленную на
          подтверждение российского происхождения, и туда попадает не всё.
        </p>
      </div>
    );
  }

  const strong = info.match ? STRONG.includes(info.match) : false;
  const names = [...new Set(info.producers.map((p) => p.product).filter(Boolean))];
  const different = names.length > 1 || (names[0] && names[0] !== name);

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{info.producerCount}</span>
          <span className={styles.statLabel}>производителей</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{info.regionCount}</span>
          <span className={styles.statLabel}>регионов</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{info.entryCount}</span>
          <span className={styles.statLabel}>записей реестра</span>
        </div>
        {info.okpd2 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{info.okpd2}</span>
            <span className={styles.statLabel}>ОКПД2</span>
          </div>
        )}
      </div>

      {info.match && (
        <span
          className={`${styles.match} ${strong ? styles.matchStrong : styles.matchWeak}`}
        >
          <ShieldCheckIcon size={13} />
          {MATCH_LABELS[info.match]}
        </span>
      )}

      {different && (
        <>
          <p className={styles.note}>Нашлось по записям реестра:</p>
          <div className={styles.names}>
            {names.slice(0, 8).map((n) => (
              <span key={n} className={styles.nameChip}>
                {n}
              </span>
            ))}
            {names.length > 8 && (
              <span className={styles.nameChip}>и ещё {names.length - 8}</span>
            )}
          </div>
        </>
      )}

      <IndustryProducers producers={info.producers} compact />

      {actualAt && (
        <p className={styles.foot}>Выгрузка реестра актуальна на {actualAt}</p>
      )}
    </div>
  );
};
