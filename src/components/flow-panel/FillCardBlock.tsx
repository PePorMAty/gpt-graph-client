// src/components/flow-panel/FillCardBlock.tsx
//
// Вкладка «Технологическое описание»: настройка запроса к модели и результат.
//
// Настройки свёрнуты за кнопкой «Изменить промпт» — по умолчанию видно только
// действие. У продукта и преобразования набор полей разный, но форма одна.
//
// Параметры карточки преобразования («Оборудование», «Условия» и прочие)
// показывает блок «Ключевая информация» во вкладке «Краткое описание»: они
// приходят тем же запросом, но читают их в другом месте. Здесь остаётся
// собственно описание технологии, а у продукта — все поля списком.

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
import { PencilIcon } from "../icons";

import styles from "./FillCardBlock.module.css";

/** Поле, которое у преобразования показываем отдельным блоком-описанием. */
const TECH_DESCRIPTION_KEY = "technology_short_description";

/** Мягкий предел длины промпта — только для счётчика под полем. */
const PROMPT_LIMIT = 4000;

export interface FillCardBlockProps {
  nodeType: string;
  onBuildProductCard?: (options?: FillCardOptions) => void;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCard?: ProductCard | null;
  /** Только просмотр: настройки и кнопку прячем, заполненную карточку показываем. */
  readOnly?: boolean;
  /** "list" — плоский список полей (продукт); "tech" — описание технологии. */
  layout?: "list" | "tech";
}

const Hint: FC<{ text: string }> = ({ text }) => (
  <span className={styles.hint} title={text} aria-label={text}>
    i
  </span>
);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    setSettingsOpen(false);
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
  const isLoading = productCardStatus === "loading";

  return (
    <div className={styles.block}>
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={styles.promptToggle}
          >
            <PencilIcon size={15} />
            {settingsOpen ? "Скрыть настройки" : "Изменить промпт"}
          </button>

          {settingsOpen && (
            <div className={styles.settings}>
              {/* ── Поля карточки ── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionTitle}>
                    Поля карточки
                    <Hint text="Модель заполнит только отмеченные поля. Можно добавить своё." />
                  </span>
                  <div className={styles.sectionActions}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={handleSelectAll}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={handleDeselectAll}
                    >
                      Ничего
                    </button>
                  </div>
                </div>

                <div className={styles.fieldBox}>
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
                      placeholder="Своё поле…"
                    />
                    <button
                      type="button"
                      className={styles.addFieldBtn}
                      onClick={handleAddField}
                      disabled={!newFieldLabel.trim()}
                      aria-label="Добавить поле"
                    >
                      +
                    </button>
                  </div>
                </div>
              </section>

              {/* ── Модель ── */}
              <section className={styles.section}>
                <span className={styles.sectionTitle}>
                  Модель для запроса
                  <Hint text="Выбор действует на все запросы к модели в приложении." />
                </span>
                <AiModelSelect stage="card" label="" />
              </section>

              {/* ── Системный промпт ── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionTitle}>
                    Системный промпт
                    <Hint text="Инструкция модели. Собирается из выбранных полей; можно переписать." />
                  </span>
                  {isPromptDirty && (
                    <div className={styles.sectionActions}>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        onClick={() => setManualPrompt(null)}
                      >
                        Вставить шаблон
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.promptWrap}>
                  <textarea
                    value={displayedPrompt}
                    onChange={(e) => setManualPrompt(e.target.value)}
                    className={styles.promptTextarea}
                  />
                </div>
                <span
                  className={`${styles.counter} ${
                    displayedPrompt.length > PROMPT_LIMIT
                      ? styles.counterOver
                      : ""
                  }`}
                >
                  {displayedPrompt.length} / {PROMPT_LIMIT}
                </span>
              </section>

              {/* ── Веб-поиск ── */}
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                />
                <span
                  className={`${styles.switch} ${useWebSearch ? styles.switchOn : ""}`}
                  aria-hidden
                >
                  <span className={styles.switchKnob} />
                </span>
                Искать в интернете (web search)
                <Hint text="Модель дополнит ответ данными из сети. Запрос идёт дольше." />
              </label>
            </div>
          )}

          <div className={styles.actions}>
            {settingsOpen && (
              <button
                type="button"
                className={styles.actionSecondary}
                onClick={() => {
                  setManualPrompt(null);
                  handleSelectAll();
                }}
                disabled={!isPromptDirty && !fieldsReduced}
              >
                Сбросить к шаблону
              </button>
            )}
            <button
              type="button"
              onClick={handleFillCard}
              disabled={
                !onBuildProductCard || isLoading || activeFields.length === 0
              }
              className={styles.actionPrimary}
            >
              {isLoading
                ? "Получаю описание…"
                : hasCard
                  ? "Обновить описание"
                  : "Получить описание"}
            </button>
          </div>

          {productCardStatus === "failed" && productCardError && (
            <div className={styles.error}>Ошибка: {productCardError}</div>
          )}
        </>
      )}

      {readOnly && !hasCard && (
        <div className={styles.emptyHint}>Описание не заполнено.</div>
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

/** Карточка продукта: все поля таблицей «поле → значение». */
const ListCardView: FC<{ card: ProductCard; fields: FillCardField[] }> = ({
  card,
  fields,
}) => (
  <div className={styles.result}>
    <div className={styles.resultBlock}>
      <div className={styles.resultTitle}>Карточка продукта</div>
      <dl className={styles.params}>
        {cardRows(card, fields).map(({ key, label, value }) => (
          <div key={key} className={styles.paramRow}>
            <dt className={styles.paramName}>{label}</dt>
            <dd className={styles.paramValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
);

/**
 * Карточка преобразования: здесь только описание технологии — параметры
 * читаются в блоке «Ключевая информация» вкладки «Краткое описание».
 */
const TechCardView: FC<{ card: ProductCard; fields: FillCardField[] }> = ({
  card,
  fields,
}) => {
  const rows = cardRows(card, fields);
  const description = rows.find((r) => r.key === TECH_DESCRIPTION_KEY);

  if (!description) return null;

  return (
    <div className={styles.result}>
      <div className={styles.resultBlock}>
        <div className={styles.resultTitle}>Технологическое описание</div>
        <div className={styles.resultText}>{description.value}</div>
      </div>
    </div>
  );
};
