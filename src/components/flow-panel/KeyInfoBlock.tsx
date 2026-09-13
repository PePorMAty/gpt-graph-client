import { useMemo } from "react";

import type { ProductCard } from "../../store/types";
import { TRANSFORMATION_FIELDS } from "../../prompts/fillCardPrompts";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { PencilIcon } from "../icons";
import styles from "./NodeCard.module.css";

/** Поле, которое показывается отдельным описанием, а не строкой таблицы. */
const SHORT_DESCRIPTION_KEY = "technology_short_description";

interface KeyInfoBlockProps {
  card?: ProductCard | null;
  /** Переход к заполнению — во вкладку «Технологическое описание». */
  onEdit: () => void;
}

/**
 * «Ключевая информация» в карточке преобразования: параметры из карточки
 * технологии — оборудование, условия, ограничения и прочее.
 *
 * Значения приходят из того же запроса, что и технологическое описание,
 * поэтому правка отправляет на соответствующую вкладку, а не дублирует форму.
 */
export const KeyInfoBlock = ({ card, onEdit }: KeyInfoBlockProps) => {
  const rows = useMemo(() => {
    if (!card) return [];
    const source = card as Record<string, unknown>;
    return TRANSFORMATION_FIELDS.filter(
      (f) => f.key !== SHORT_DESCRIPTION_KEY,
    )
      .map((f) => ({ label: f.label, value: String(source[f.key] ?? "").trim() }))
      .filter((row) => row.value.length > 0);
  }, [card]);

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
          Параметры не заполнены. Получите технологическое описание — они
          придут вместе с ним.
        </div>
      ) : (
        <dl className={styles.keyInfo}>
          {rows.map((row) => (
            <div key={row.label} className={styles.keyInfoRow}>
              <dt className={styles.keyInfoLabel}>{row.label}</dt>
              <dd className={styles.keyInfoValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </CollapsibleBlock>
  );
};
