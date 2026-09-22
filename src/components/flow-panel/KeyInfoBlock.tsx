import { useMemo, type ReactNode } from "react";

import type { ProductCard } from "../../store/types";
import { TRANSFORMATION_FIELDS } from "../../prompts/fillCardPrompts";
import { useAppSelector } from "../../store/hooks";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { FocusIcon, GearIcon, IndustryDataIcon, PencilIcon } from "../icons";
import styles from "./NodeCard.module.css";

/** Поле, которое показывается отдельным описанием, а не строкой таблицы. */
const SHORT_DESCRIPTION_KEY = "technology_short_description";

const ICON_SIZE = 15;

interface Row {
  label: string;
  value: string;
  icon?: ReactNode;
}

interface KeyInfoBlockProps {
  card?: ProductCard | null;
  /** Узел преобразования — из него берутся отрасль и назначение. */
  nodeId?: string | null;
  /** Переход к заполнению — во вкладку «Технологическое описание». */
  onEdit: () => void;
}

/**
 * «Ключевая информация» в карточке преобразования: чем процесс является и
 * какими параметрами описан — оборудование, условия, ограничения и прочее.
 *
 * Строки двух разных происхождений. Отрасль и назначение приходят сразу с
 * построением шага и лежат в самом узле: чтобы их увидеть, ничего заполнять не
 * надо. Остальное — поля карточки технологии, из того же запроса, что и
 * технологическое описание; поэтому правка отправляет на соответствующую
 * вкладку, а не дублирует форму.
 *
 * Отрасль и назначение стоят первыми: они отвечают «что это за процесс», а
 * параметры — «как он устроен», и второе без первого читается хуже.
 */
export const KeyInfoBlock = ({ card, nodeId, onEdit }: KeyInfoBlockProps) => {
  // Поля узла берём из стора по id: карточка получает свойства по одному, и
  // тащить через неё ещё два ради двух строк незачем.
  const nodeData = useAppSelector(
    (s) => s.graph.data.nodes.find((n) => n.id === nodeId)?.data,
  );

  const rows = useMemo<Row[]>(() => {
    const fromNode: Row[] = [
      {
        label: "Отрасль",
        value: String(nodeData?.industry ?? "").trim(),
        icon: <IndustryDataIcon size={ICON_SIZE} />,
      },
      {
        label: "Основное назначение",
        value: String(nodeData?.mainPurpose ?? "").trim(),
        icon: <FocusIcon size={ICON_SIZE} />,
      },
    ].filter((row) => row.value.length > 0);

    const source = (card ?? {}) as Record<string, unknown>;
    const fromCard: Row[] = card
      ? TRANSFORMATION_FIELDS.filter((f) => f.key !== SHORT_DESCRIPTION_KEY)
          .map((f) => ({
            label: f.label,
            value: String(source[f.key] ?? "").trim(),
          }))
          .filter((row) => row.value.length > 0)
      : [];

    // Сказать нечего — «Тип» не добавляем. Одна строка «Тип: Технология» это
    // не «ключевая информация», а видимость её: человек узнал бы из неё ровно
    // то, что и так написано в шапке карточки. Пусть лучше блок объяснит,
    // почему пусто и откуда возьмётся.
    if (!fromNode.length && !fromCard.length) return [];

    return [
      { label: "Тип", value: "Технология", icon: <GearIcon size={ICON_SIZE} /> },
      ...fromNode,
      ...fromCard,
    ];
  }, [card, nodeData?.industry, nodeData?.mainPurpose]);

  return (
    <CollapsibleBlock
      title="Ключевая информация"
      actions={
        <button type="button" className={styles.blockAction} onClick={onEdit}>
          <PencilIcon size={15} />
          Редактировать
        </button>
      }
    >
      {rows.length === 0 ? (
        <div className={styles.blockEmpty}>
          Пока пусто. Отрасль и основное назначение проставляются при построении
          шага, у узлов, созданных раньше, их нет. Остальные параметры приходят
          вместе с технологическим описанием — его можно получить на соседней
          вкладке.
        </div>
      ) : (
        <dl className={styles.keyInfo}>
          {rows.map((row) => (
            <div key={row.label} className={styles.keyInfoRow}>
              <dt className={styles.keyInfoLabel}>
                {row.icon && (
                  <span className={styles.keyInfoIcon} aria-hidden="true">
                    {row.icon}
                  </span>
                )}
                {row.label}
              </dt>
              <dd className={styles.keyInfoValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </CollapsibleBlock>
  );
};
