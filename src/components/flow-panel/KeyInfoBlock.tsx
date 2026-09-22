import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ProductCard } from "../../store/types";
import { TRANSFORMATION_FIELDS } from "../../prompts/fillCardPrompts";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateNodeData } from "../../store/slices/gptSlice";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { FocusIcon, IndustryDataIcon, PencilIcon } from "../icons";
import styles from "./NodeCard.module.css";

/** Поле, которое показывается отдельным описанием, а не строкой таблицы. */
const SHORT_DESCRIPTION_KEY = "technology_short_description";

const ICON_SIZE = 15;

/** Поля самого узла: их правит человек прямо здесь. */
const NODE_FIELDS = [
  {
    key: "industry" as const,
    label: "Отрасль",
    icon: <IndustryDataIcon size={ICON_SIZE} />,
    placeholder: "Например: Нефтехимия",
  },
  {
    key: "mainPurpose" as const,
    label: "Основное назначение",
    icon: <FocusIcon size={ICON_SIZE} />,
    placeholder: "Одним предложением: зачем нужен",
  },
];

interface Row {
  label: string;
  value: string;
  icon?: ReactNode;
}

interface KeyInfoBlockProps {
  card?: ProductCard | null;
  /** Узел — из него берутся и в него пишутся отрасль с назначением. */
  nodeId?: string | null;
  readOnly?: boolean;
}

/**
 * «Ключевая информация»: чем узел является и какими параметрами описан.
 *
 * Строки двух разных происхождений. Отрасль и назначение приходят с
 * построением шага и лежат в самом узле — они есть и у продукта, и у
 * преобразования. Остальное — поля карточки технологии, которых у продукта
 * нет вовсе.
 *
 * Правка идёт ЗДЕСЬ ЖЕ. Раньше карандаш отправлял на вкладку
 * «Технологическое описание» — и это была неправда: отрасль с назначением там
 * не правятся, их там нет. Поля карточки технологии остаются на своей
 * вкладке: они приходят одним запросом и по одному не редактируются.
 */
export const KeyInfoBlock = ({
  card,
  nodeId,
  readOnly = false,
}: KeyInfoBlockProps) => {
  const dispatch = useAppDispatch();
  // Поля узла берём из стора по id: карточка получает свойства по одному, и
  // тащить через неё ещё два ради двух строк незачем.
  const nodeData = useAppSelector(
    (s) => s.graph.data.nodes.find((n) => n.id === nodeId)?.data,
  );

  const stored = useMemo(
    () => ({
      industry: String(nodeData?.industry ?? ""),
      mainPurpose: String(nodeData?.mainPurpose ?? ""),
    }),
    [nodeData?.industry, nodeData?.mainPurpose],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);

  // Сменился узел или пришли новые значения — черновик за ними. Правку при
  // этом закрываем: продолжать её в чужих полях бессмысленно.
  useEffect(() => {
    setDraft(stored);
    setEditing(false);
  }, [nodeId, stored]);

  const cardRows = useMemo<Row[]>(() => {
    if (!card) return [];
    const source = card as Record<string, unknown>;
    return TRANSFORMATION_FIELDS.filter((f) => f.key !== SHORT_DESCRIPTION_KEY)
      .map((f) => ({
        label: f.label,
        value: String(source[f.key] ?? "").trim(),
      }))
      .filter((row) => row.value.length > 0);
  }, [card]);

  const nodeRows = NODE_FIELDS.map((f) => ({
    label: f.label,
    value: stored[f.key].trim(),
    icon: f.icon,
  })).filter((row) => row.value.length > 0);

  const save = () => {
    if (!nodeId) return;
    dispatch(
      updateNodeData({
        nodeId,
        data: {
          industry: draft.industry.trim() || undefined,
          mainPurpose: draft.mainPurpose.trim() || undefined,
        },
      }),
    );
    setEditing(false);
  };

  const rows = [...nodeRows, ...cardRows];
  const canEdit = !readOnly && Boolean(nodeId);

  return (
    <CollapsibleBlock
      title="Ключевая информация"
      actions={
        canEdit && !editing ? (
          <button
            type="button"
            className={styles.blockAction}
            onClick={() => setEditing(true)}
          >
            <PencilIcon size={15} />
            Редактировать
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className={styles.keyInfoForm}>
          {NODE_FIELDS.map((f) => (
            <label key={f.key} className={styles.keyInfoField}>
              <span className={styles.keyInfoLabel}>
                <span className={styles.keyInfoIcon} aria-hidden="true">
                  {f.icon}
                </span>
                {f.label}
              </span>
              <textarea
                className={styles.keyInfoInput}
                value={draft[f.key]}
                placeholder={f.placeholder}
                rows={f.key === "industry" ? 1 : 3}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
              />
            </label>
          ))}

          {cardRows.length > 0 && (
            <p className={styles.keyInfoNote}>
              Остальные параметры приходят вместе с технологическим описанием и
              правятся там же, целиком.
            </p>
          )}

          <div className={styles.keyInfoActions}>
            <button
              type="button"
              className={styles.blockAction}
              onClick={() => {
                setDraft(stored);
                setEditing(false);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className={styles.keyInfoSave}
              onClick={save}
            >
              Сохранить
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.blockEmpty}>
          Пока пусто. Отрасль и основное назначение проставляются при
          построении шага — у узлов, созданных раньше, их нет, но их можно
          вписать самому.
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
