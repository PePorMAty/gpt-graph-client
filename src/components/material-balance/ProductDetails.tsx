import type { FC } from "react";

import {
  computeBalance,
  formatBasisAmount,
  formatMass,
  formatPercent,
  massYield,
  mentionsProduct,
  productExcerpts,
  shareOfAllInputs,
  stepField,
  type BalanceInputAmount,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import { readableRecord } from "../../utils/readableModelText";
import type { CustomNode } from "../../types";
import { ChevronLeftIcon } from "../icons";
import { Markdown, SourceItem, Status } from "./CalcDetails";
import { CalcScheme } from "./TransformationScheme";
import styles from "./MaterialBalance.module.css";

interface Props {
  transformation: CustomNode;
  calc: MaterialBalanceCalc;
  /** id узла продукта. */
  productId: string;
  labelOf: (id: string | undefined) => string;
  onAmount: (ref: string, value: BalanceInputAmount) => void;
  onBack: () => void;
  /** Название расчёта для «← К расчёту»: продукты через запятую. */
  calcTitle: string;
  readOnly?: boolean;
}

/**
 * Расчёт одного продукта: всё сырьё преобразования → этот продукт. Модель
 * считает преобразование целиком, а здесь — то, что относится к продукту:
 * его масса и выход, строки расчёта, где он упомянут, и источники, на
 * которые модель для него сослалась.
 */
export const ProductDetails: FC<Props> = ({
  transformation,
  calc,
  productId,
  labelOf,
  onAmount,
  onBack,
  calcTitle,
  readOnly,
}) => {
  const record = readableRecord(calc.record);
  const readable = { ...calc, record };
  const result = computeBalance(readable);
  const target = result.targets.find((f) => f.nodeId === productId);
  if (!target) return null;
  const name = labelOf(target.nodeId) || target.name;
  const names = [...new Set([name, target.name])];
  const row = record.products.find((p) => p.ref === target.ref);
  const basis = result.inputs[0];
  const basisName = basis ? labelOf(basis.nodeId) || basis.name : "";
  const yieldOnBasis = basis ? massYield(record, target.ref, basis.ref) : null;
  const yieldOnAll =
    result.inputs.length > 1 ? shareOfAllInputs(record, target.ref) : null;
  const excerpts = productExcerpts(record, target.ref, names);
  const conditions = stepField(record, "Источник и условия");
  const mention = (s: string) => mentionsProduct(s, target.ref, names);
  const ownSources = record.sources.filter((s) =>
    mention(`${s.usedFor}\n${s.title}`),
  );
  const sources = ownSources.length ? ownSources : record.sources;
  const notes = (record.sections.notes ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l && mention(l));

  return (
    <>
      <button
        type="button"
        className={`${styles.linkBtn} ${styles.back}`}
        onClick={onBack}
      >
        <ChevronLeftIcon size={12} /> К расчёту «→ {calcTitle}»
      </button>
      <div className={styles.detailsHead}>
        <h4 className={styles.productTitle}>
          {result.inputs.map((f) => labelOf(f.nodeId) || f.name).join(" + ")} →{" "}
          {name}
        </h4>
        <div className={styles.itemTitle}>
          Расчёт преобразования <Status status={record.status} />
        </div>
      </div>

      <CalcScheme
        transformation={transformation}
        result={result}
        labelOf={labelOf}
        onAmount={onAmount}
        only={target.ref}
        readOnly={readOnly}
      />

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>{name}</h4>
        <table className={styles.flows}>
          <tbody>
            <tr>
              <td>Получится</td>
              <td>{formatMass(target.mass, target.unit)}</td>
            </tr>
            {yieldOnBasis && (
              <tr>
                <td>Выход на «{basisName}»</td>
                <td>{formatPercent(yieldOnBasis)}</td>
              </tr>
            )}
            {yieldOnAll && (
              <tr>
                <td>Доля от всего сырья</td>
                <td>{formatPercent(yieldOnAll)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {row?.basis && <p className={styles.note}>Основание: {row.basis}.</p>}
        {!target.mass && (
          <p className={styles.reason}>
            Массы этого продукта в расчёте нет: модель не нашла его выход.
            Причина — в примечаниях ниже и в общем расчёте.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Как посчитано</h4>
        <p className={styles.muted}>
          Строки из ответа модели — числа в них на {formatBasisAmount(record)} «
          {basisName}», с которыми она считала. На ваше количество пересчитаны
          схема и подписи на узлах.
        </p>
        {excerpts.length ? (
          excerpts.map((e) => (
            <div key={e.label} className={styles.excerpt}>
              <span className={styles.fieldLabel}>{e.label}</span>
              <ul className={styles.coef}>
                {e.items.map((item, i) => (
                  <li key={i}>
                    <Markdown text={item} inline />
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className={styles.muted}>
            Отдельных строк про этот продукт в расчёте модели нет — смотрите
            общий расчёт преобразования.
          </p>
        )}
        {conditions.length > 0 && (
          <div className={styles.excerpt}>
            <span className={styles.fieldLabel}>Источник и условия</span>
            {conditions.map((c, i) => (
              <Markdown key={i} text={c} />
            ))}
          </div>
        )}
      </section>

      {notes.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Примечания о продукте</h4>
          <ul className={styles.coef}>
            {notes.map((n, i) => (
              <li key={i}>
                <Markdown text={n} inline />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Источники ({sources.length})</h4>
        {!ownSources.length && record.sources.length > 0 && (
          <p className={styles.muted}>
            Модель не отметила, какие источники — для этого продукта; показаны
            все.
          </p>
        )}
        {sources.length ? (
          sources.map((src) => <SourceItem key={src.id} source={src} />)
        ) : (
          <p className={styles.muted}>Модель не указала рабочих источников.</p>
        )}
      </section>
    </>
  );
};
