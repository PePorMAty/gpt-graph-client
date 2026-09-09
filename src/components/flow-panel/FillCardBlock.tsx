// src/components/flow-panel/FillCardBlock.tsx
//
// Блок «Заполнить карточку»: выбор полей, редактор системного промпта и вывод
// заполненной карточки.
//
// У продукта блок живёт внизу карточки и выводит поля списком (как раньше).
// У преобразования он переехал во вкладку «Технологическое описание» и выводит
// результат двумя блоками: краткое описание технологии и таблица «Основные
// параметры» из остальных полей.

import { useEffect, useMemo, useState, type FC } from "react";
import type { ProductCard } from "../../store/types";
import type { FillCardOptions } from "./types";
import {
  getDefaultFillCardSystemPrompt,
  getFieldsForNodeType,
  labelToKey,
  type FillCardField,
} from "../../prompts/fillCardPrompts";
import { AiModelSelect } from "../ai-model-select";

import styles from "./FlowPanel.module.css";

/** Поле, которое у преобразования показываем отдельным блоком-описанием. */
const TECH_DESCRIPTION_KEY = "technology_short_description";

export interface FillCardBlockProps {
  nodeType: string;
  onBuildProductCard?: (options?: FillCardOptions) => void;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCard?: ProductCard | null;
  /** Только просмотр: настройки и кнопку прячем, заполненную карточку показываем. */
  readOnly?: boolean;
  /** "list" — плоский список полей (продукт); "tech" — блоки карточки преобразования. */
  layout?: "list" | "tech";
}

export const FillCardBlock: FC<FillCardBlockProps> = ({
  nodeType,
  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,
  readOnly = false,
  layout = "list",
}) => {
  // ── выбор полей карточки ──
  const predefinedFields = useMemo(
    () => getFieldsForNodeType(nodeType),
    [nodeType],
  );

  // В карточке преобразования это не «карточка продукта», а описание шага —
  // подпись кнопки должна называть то, что реально произойдёт.
  const isTransformation = nodeType === "transformation";

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(predefinedFields.map((f) => f.key)),
  );
  const [customFields, setCustomFields] = useState<FillCardField[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const activeFields = useMemo(() => {
    const result: FillCardField[] = [];
    for (const f of predefinedFields) {
      if (selectedKeys.has(f.key)) result.push(f);
    }
    for (const f of customFields) {
      if (selectedKeys.has(f.key)) result.push(f);
    }
    return result;
  }, [predefinedFields, customFields, selectedKeys]);

  const allFields = useMemo(
    () => [...predefinedFields, ...customFields],
    [predefinedFields, customFields],
  );

  // ── редактор промпта ──
  const [promptOpen, setPromptOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);

  const autoPrompt = useMemo(
    () => getDefaultFillCardSystemPrompt(nodeType, activeFields),
    [nodeType, activeFields],
  );

  const displayedPrompt = manualPrompt ?? autoPrompt;
  const isPromptDirty = manualPrompt !== null;
  const fieldsReduced =
    activeFields.length !== predefinedFields.length || customFields.length > 0;

  // Смена типа узла меняет набор полей — сбрасываем выбор и правку промпта.
  useEffect(() => {
    const fields = getFieldsForNodeType(nodeType);
    setSelectedKeys(new Set(fields.map((f) => f.key)));
    setCustomFields([]);
    setManualPrompt(null);
    setPromptOpen(false);
    setNewFieldLabel("");
  }, [nodeType]);

  const handleToggleField = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setManualPrompt(null);
  };

  const handleSelectAll = () => {
    setSelectedKeys(new Set(allFields.map((f) => f.key)));
    setManualPrompt(null);
  };

  const handleDeselectAll = () => {
    setSelectedKeys(new Set());
    setManualPrompt(null);
  };

  const handleAddField = () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const key = labelToKey(label);
    if (!key || allFields.some((f) => f.key === key)) return;
    const field: FillCardField = { key, label, custom: true };
    setCustomFields((prev) => [...prev, field]);
    setSelectedKeys((prev) => new Set([...prev, key]));
    setNewFieldLabel("");
    setManualPrompt(null);
  };

  const handleRemoveCustomField = (key: string) => {
    setCustomFields((prev) => prev.filter((f) => f.key !== key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setManualPrompt(null);
  };

  const handleFillCard = () => {
    const needCustom = isPromptDirty || fieldsReduced;
    onBuildProductCard?.({
      customSystemPrompt: needCustom ? displayedPrompt : undefined,
      selectedFields: activeFields.map((f) => f.key),
      useWebSearch,
    });
  };

  const hasCard = productCardStatus === "succeeded" && !!productCard;

  return (
    <div className={styles.formGroup}>
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {promptOpen ? "Скрыть настройки промпта" : "Настроить промпт"}
          </button>

          {promptOpen && (
            <div className={styles.promptEditor}>
              {/* выбор полей карточки */}
              <div className={styles.fieldSection}>
                <div className={styles.fieldSectionHeader}>
                  <span className={styles.fieldSectionTitle}>
                    Поля карточки
                  </span>
                  <div className={styles.fieldBulkActions}>
                    <button
                      type="button"
                      className={styles.fieldBulkBtn}
                      onClick={handleSelectAll}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className={styles.fieldBulkBtn}
                      onClick={handleDeselectAll}
                    >
                      Ничего
                    </button>
                  </div>
                </div>

                <div className={styles.fieldGrid}>
                  {allFields.map((f) => (
                    <label key={f.key} className={styles.fieldCheckbox}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(f.key)}
                        onChange={() => handleToggleField(f.key)}
                      />
                      <span className={styles.fieldLabel}>{f.label}</span>
                      {f.custom && (
                        <button
                          type="button"
                          className={styles.fieldRemoveBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemoveCustomField(f.key);
                          }}
                          title="Удалить поле"
                        >
                          ×
                        </button>
                      )}
                    </label>
                  ))}
                </div>

                {/* своё поле */}
                <div className={styles.addFieldRow}>
                  <input
                    type="text"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddField();
                      }
                    }}
                    className={styles.addFieldInput}
                    placeholder="Новое поле..."
                  />
                  <button
                    type="button"
                    className={styles.addFieldBtn}
                    onClick={handleAddField}
                    disabled={!newFieldLabel.trim()}
                  >
                    +
                  </button>
                </div>
              </div>

              <AiModelSelect stage="card" />
              <label className={styles.promptLabel}>Системный промпт:</label>
              <textarea
                value={displayedPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}

              <label className={styles.webSearchToggle}>
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                />
                Искать в интернете (web search)
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={handleFillCard}
            disabled={
              !onBuildProductCard ||
              productCardStatus === "loading" ||
              activeFields.length === 0
            }
            className={styles.findSourcesButton}
          >
            {productCardStatus === "loading"
              ? "Заполняю карточку..."
              : isPromptDirty || fieldsReduced
                ? isTransformation
                  ? "Получить описание (свой промпт)"
                  : "Заполнить (свой промпт)"
                : isTransformation
                  ? "Получить описание"
                  : "Заполнить карточку"}
          </button>

          {productCardStatus === "failed" && productCardError && (
            <div className={styles.errorText}>Ошибка: {productCardError}</div>
          )}
        </>
      )}

      {readOnly && !hasCard && (
        <div className={styles.techHint}>Карточка не заполнена.</div>
      )}

      {hasCard &&
        (layout === "tech" ? (
          <TechCardView card={productCard!} fields={allFields} />
        ) : (
          <ListCardView card={productCard!} fields={allFields} />
        ))}
    </div>
  );
};

/** Пары «поле → значение» карточки: сначала известные поля, затем прочие ключи. */
function cardRows(
  card: ProductCard,
  fields: FillCardField[],
): Array<{ key: string; label: string; value: string }> {
  const record = card as Record<string, string>;
  const rows = fields
    .filter((f) => record[f.key])
    .map((f) => ({ key: f.key, label: f.label, value: record[f.key] }));

  for (const [key, value] of Object.entries(record)) {
    if (!value || fields.some((f) => f.key === key)) continue;
    rows.push({ key, label: key, value });
  }
  return rows;
}

/** Прежний вид карточки продукта: заголовок поля + значение под ним. */
const ListCardView: FC<{ card: ProductCard; fields: FillCardField[] }> = ({
  card,
  fields,
}) => (
  <div className={styles.sourcesBox}>
    <div className={styles.sourcesTitle}>Карточка</div>
    {cardRows(card, fields).map(({ key, label, value }) => (
      <div key={key} style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          <b>{label}</b>
        </div>
        <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
    ))}
  </div>
);

/** Карточка преобразования: описание технологии + таблица параметров. */
const TechCardView: FC<{ card: ProductCard; fields: FillCardField[] }> = ({
  card,
  fields,
}) => {
  const rows = cardRows(card, fields);
  const description = rows.find((r) => r.key === TECH_DESCRIPTION_KEY);
  const params = rows.filter((r) => r.key !== TECH_DESCRIPTION_KEY);

  return (
    <>
      {description && (
        <div className={styles.cardBlock}>
          <div className={styles.cardBlockTitle}>Технологическое описание</div>
          <div className={styles.cardBlockText}>{description.value}</div>
        </div>
      )}

      {params.length > 0 && (
        <div className={styles.cardBlock}>
          <div className={styles.cardBlockTitle}>Основные параметры</div>
          <dl className={styles.cardParams}>
            {params.map(({ key, label, value }) => (
              <div key={key} className={styles.cardParamRow}>
                <dt className={styles.cardParamName}>{label}</dt>
                <dd className={styles.cardParamValue}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
};
