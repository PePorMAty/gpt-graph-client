import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateNodeData } from "../../store/slices/gptSlice";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { FocusIcon, IndustryDataIcon, PencilIcon } from "../icons";
import styles from "./NodeCard.module.css";

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
  /** Узел — из него берутся и в него пишутся отрасль с назначением. */
  nodeId?: string | null;
  readOnly?: boolean;
}

/**
 * «Ключевая информация»: чем узел является — отрасль и основное назначение.
 *
 * Они приходят с построением шага и лежат в самом узле — есть и у продукта,
 * и у преобразования. Параметры технологии (оборудование, условия…) сюда не
 * выводятся: они приходят с технологическим описанием и живут на его
 * вкладке — раньше они показывались здесь, и технологическое описание
 * читалось в «Кратком описании».
 *
 * Правка идёт ЗДЕСЬ ЖЕ. Раньше карандаш отправлял на вкладку
 * «Технологическое описание» — и это была неправда: отрасль с назначением там
 * не правятся, их там нет.
 */
export const KeyInfoBlock = ({
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

  const rows: Row[] = nodeRows;
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
