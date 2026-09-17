import { useEffect, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateNodeData } from "../../store/slices/gptSlice";
import {
  PRODUCT_ID_SOURCE_LABELS,
  readProductId,
  readProductIdSource,
  type ProductIdSource,
} from "../../utils/productIdentity";
import { CollapsibleBlock } from "./CollapsibleBlock";
import styles from "./NodeCard.module.css";

interface Props {
  nodeId: string | null | undefined;
  readOnly?: boolean;
}

/**
 * Идентификатор продукта в карточке узла.
 *
 * Название продукта — плохой признак равенства: у вещества их несколько, и
 * «ИПБ», «Изопропилбензол», «Кумол» при объединении графов оставались тремя
 * узлами. Здесь продукту задаётся собственный идентификатор, по которому его и
 * сравнивают.
 *
 * Чем именно будет значение — решает человек: код ТН ВЭД, номер CAS или своя
 * пометка. Для сравнения важно одно — чтобы у одного вещества он был один.
 */
export const ProductIdBlock: FC<Props> = ({ nodeId, readOnly = false }) => {
  const dispatch = useAppDispatch();
  // Данные берём из стора по id: карточка получает поля узла по одному, и
  // тащить через неё ещё два ради одного блока незачем.
  const data = useAppSelector(
    (s) => s.graph.data.nodes.find((n) => n.id === nodeId)?.data,
  );
  const current = readProductId(data);
  const source = readProductIdSource(data);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current ?? "");
  const [open, setOpen] = useState(Boolean(current));

  // Карточка переиспользуется между узлами — черновик не должен переезжать
  // на соседний продукт.
  useEffect(() => {
    setEditing(false);
    setDraft(current ?? "");
    setOpen(Boolean(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Идентификатор может появиться у открытой карточки: при объединении графов
  // его проставляет справочник. Блок, свёрнутый пустым, тогда так и остался бы
  // свёрнутым — и человек не увидел бы, что у продукта появился канон.
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);

  if (!nodeId) return null;

  const save = (value: string, nextSource: ProductIdSource = "manual") => {
    const trimmed = value.trim();
    dispatch(
      updateNodeData({
        nodeId,
        // Снятие идентификатора — пустая строка, а не удаление поля: оно
        // переживает сохранение графа, и «нет значения» надо записать явно.
        data: trimmed
          ? { productId: trimmed, productIdSource: nextSource }
          : { productId: "", productIdSource: undefined },
      }),
    );
    setEditing(false);
  };

  return (
    <CollapsibleBlock title="Идентификатор" open={open} onOpenChange={setOpen}>
      {current && !editing ? (
        <div className={styles.idRow}>
          <span className={styles.idValue}>{current}</span>
          {source && (
            <span className={styles.idSource}>
              {PRODUCT_ID_SOURCE_LABELS[source]}
            </span>
          )}
          {!readOnly && (
            <>
              <button
                type="button"
                className={styles.blockAction}
                onClick={() => {
                  setDraft(current);
                  setEditing(true);
                }}
              >
                Изменить
              </button>
              <button
                type="button"
                className={styles.blockAction}
                onClick={() => save("")}
              >
                Убрать
              </button>
            </>
          )}
        </div>
      ) : readOnly ? (
        <div className={styles.blockEmpty}>Идентификатор не задан.</div>
      ) : (
        <div className={styles.idForm}>
          <input
            className={styles.idInput}
            value={draft}
            placeholder="Код ТН ВЭД, номер CAS или своя пометка"
            autoFocus={editing}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(draft);
              if (e.key === "Escape") {
                setDraft(current ?? "");
                setEditing(false);
              }
            }}
          />
          <button
            type="button"
            className={styles.idSave}
            disabled={!draft.trim() && !current}
            onClick={() => save(draft)}
          >
            {draft.trim() ? "Задать" : "Убрать"}
          </button>
        </div>
      )}

      <p className={styles.idHint}>
        Продукты с одинаковым идентификатором считаются одним и тем же и
        сливаются в один узел при объединении графов — как бы они ни были
        подписаны.
      </p>
    </CollapsibleBlock>
  );
};
