import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { FlowPanelProps } from "./types";
import {
  getDefaultFillCardSystemPrompt,
  getFieldsForNodeType,
  labelToKey,
  type FillCardField,
} from "../../utils/defaultFillCardPrompts";

import styles from "./FlowPanel.module.css";

export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  onDelete,
  descriptionValue,
  onChangeDescription,

  nodeType,
  buildDirection,
  onSetBuildDirection,
  onFindSources,
  sourcesLoading,
  sourcesError,
  sources,

  onAggregateSources,
  aggregateLoading,
  aggregateError,
  hasAggregated,

  chainLoading,
  chainError,

  chainReady,
  chainUiEnabled,
  isActiveChainRoot,

  canInitChainHere,
  initChainLabel,
  onInitChain,

  queueLen,
  chainPid,
  onSelectProducer,

  onExpandNext,

  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveNodeType = nodeType || "product";

  // ── field selection state ──
  const predefinedFields = useMemo(
    () => getFieldsForNodeType(effectiveNodeType),
    [effectiveNodeType],
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(predefinedFields.map((f) => f.key)),
  );
  const [customFields, setCustomFields] = useState<FillCardField[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  // all active fields = predefined (checked) + custom (checked)
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

  // all fields for checkbox rendering
  const allFields = useMemo(
    () => [...predefinedFields, ...customFields],
    [predefinedFields, customFields],
  );

  // ── prompt editor state ──
  const [promptOpen, setPromptOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);

  const autoPrompt = useMemo(
    () => getDefaultFillCardSystemPrompt(effectiveNodeType, activeFields),
    [effectiveNodeType, activeFields],
  );

  const displayedPrompt = manualPrompt ?? autoPrompt;
  const isPromptDirty = manualPrompt !== null;
  const fieldsReduced =
    activeFields.length !== predefinedFields.length ||
    customFields.length > 0;

  // reset when nodeType changes
  useEffect(() => {
    const fields = getFieldsForNodeType(effectiveNodeType);
    setSelectedKeys(new Set(fields.map((f) => f.key)));
    setCustomFields([]);
    setManualPrompt(null);
    setPromptOpen(false);
    setNewFieldLabel("");
  }, [effectiveNodeType]);

  // when checkboxes change → clear manual edits
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

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setManualPrompt(e.target.value);
  };

  const handleResetPrompt = () => {
    setManualPrompt(null);
  };

  const handleFillCard = () => {
    const needCustom = isPromptDirty || fieldsReduced;
    onBuildProductCard?.({
      customSystemPrompt: needCustom ? displayedPrompt : undefined,
      selectedFields: activeFields.map((f) => f.key),
    });
  };

  // ── click outside ──
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  const isProduct = nodeType === "product";
  const hasSources = Array.isArray(sources) && sources.length > 0;

  const queueHasWork = !!queueLen && queueLen > 0;
  const canQueue =
    !!chainReady &&
    !!chainUiEnabled &&
    !!isActiveChainRoot &&
    !!onExpandNext &&
    queueHasWork &&
    !chainLoading;

  if (!isOpen) return null;

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        {(sourcesLoading || aggregateLoading || chainLoading) && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner}></div>
            <p>
              {sourcesLoading
                ? "Поиск источников..."
                : aggregateLoading
                  ? "Обобщение источников..."
                  : "Построение chain..."}
            </p>
          </div>
        )}

        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Редактирование узла</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.panelContent}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Название узла:</label>
            <input
              value={value}
              onChange={onChangeValue}
              className={styles.formInput}
              placeholder="Введите название узла"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Описание:</label>
            <textarea
              value={descriptionValue}
              onChange={onChangeDescription}
              className={styles.formTextarea}
              placeholder="Введите описание узла"
              rows={4}
            />
          </div>

          {/* ── PRODUCT CARD ── */}
          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={() => setPromptOpen((v) => !v)}
              className={styles.promptToggle}
            >
              {promptOpen ? "Скрыть настройки промпта" : "Настроить промпт"}
            </button>

            {promptOpen && (
              <div className={styles.promptEditor}>
                {/* ── field checkboxes ── */}
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

                  {/* add custom field */}
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

                {/* ── prompt textarea ── */}
                <label className={styles.promptLabel}>Системный промпт:</label>
                <textarea
                  value={displayedPrompt}
                  onChange={handlePromptChange}
                  className={styles.promptTextarea}
                  rows={12}
                />
                {isPromptDirty && (
                  <button
                    type="button"
                    className={styles.promptResetBtn}
                    onClick={handleResetPrompt}
                  >
                    Сбросить промпт
                  </button>
                )}
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
                  ? "Заполнить (свой промпт)"
                  : "Заполнить карточку"}
            </button>

            {productCardStatus === "failed" && productCardError && (
              <div className={styles.errorText}>
                Ошибка: {productCardError}
              </div>
            )}

            {/* ── card result (dynamic) ── */}
            {productCardStatus === "succeeded" && productCard && (
              <div className={styles.sourcesBox}>
                <div className={styles.sourcesTitle}>Карточка</div>
                {allFields.map(({ key, label }) => {
                  const val = (productCard as Record<string, string>)[key];
                  if (!val) return null;
                  return (
                    <div key={key} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        <b>{label}</b>
                      </div>
                      <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                        {val}
                      </div>
                    </div>
                  );
                })}
                {/* fallback for unknown keys from server */}
                {Object.entries(productCard as Record<string, string>)
                  .filter(
                    ([k, v]) => v && !allFields.some((f) => f.key === k),
                  )
                  .map(([k, v]) => (
                    <div key={k} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        <b>{k}</b>
                      </div>
                      <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                        {v}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {isProduct && (
            <div className={styles.formGroup}>
              {/* 1) нет источников -> выбрать направление + поиск */}
              {!hasSources && (
                <>
                  <label className={styles.formLabel}>
                    Куда строить граф:
                  </label>

                  <div className={styles.inlineRow}>
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${
                        buildDirection === "down" ? styles.smallBtnActive : ""
                      }`}
                      onClick={() => onSetBuildDirection?.("down")}
                      disabled={sourcesLoading || aggregateLoading}
                    >
                      {buildDirection === "down"
                        ? "✅ Строим вниз"
                        : "⬇ Строить вниз"}
                    </button>

                    <button
                      type="button"
                      className={`${styles.smallBtn} ${
                        buildDirection === "up" ? styles.smallBtnActive : ""
                      }`}
                      onClick={() => onSetBuildDirection?.("up")}
                      disabled={sourcesLoading || aggregateLoading}
                    >
                      {buildDirection === "up"
                        ? "✅ Строим вверх"
                        : "⬆ Строить вверх"}
                    </button>
                  </div>

                  {buildDirection && (
                    <button
                      type="button"
                      onClick={onFindSources}
                      disabled={sourcesLoading || aggregateLoading}
                      className={styles.findSourcesButton}
                    >
                      🔎 Найти источники
                    </button>
                  )}

                  {sourcesError && (
                    <div className={styles.errorText}>
                      Ошибка: {sourcesError}
                    </div>
                  )}
                </>
              )}

              {/* 2) источники есть, но не обобщено -> ТОЛЬКО обобщить */}
              {hasSources && !hasAggregated && (
                <>
                  <div className={styles.sourcesTitle}>
                    Источники найдены: {sources.length}
                  </div>

                  <button
                    type="button"
                    onClick={onAggregateSources}
                    disabled={sourcesLoading || aggregateLoading}
                    className={styles.findSourcesButton}
                  >
                    🧩 Обобщить источники
                  </button>

                  {aggregateError && (
                    <div className={styles.errorText}>
                      Ошибка: {aggregateError}
                    </div>
                  )}
                </>
              )}

              {/* 3) обобщение готово -> можно получить chain / продолжить */}
              {hasSources && hasAggregated && (
                <>
                  {canInitChainHere && (
                    <button
                      type="button"
                      onClick={onInitChain}
                      disabled={
                        sourcesLoading || aggregateLoading || chainLoading
                      }
                      className={styles.findSourcesButton}
                    >
                      {initChainLabel || "🧬 Получить цепочку (chain)"}
                    </button>
                  )}

                  {chainReady && chainUiEnabled && (
                    <>
                      {!isActiveChainRoot && (
                        <div
                          className={styles.sourcesTitle}
                          style={{ fontSize: 12, opacity: 0.75 }}
                        >
                          Продолжение цепочки доступно только в корневом
                          продукте активной цепочки.
                        </div>
                      )}

                      {isActiveChainRoot && (
                        <>
                          <div className={styles.sourcesTitle}>
                            📌 Очередь: <b>{queueLen ?? 0}</b>
                          </div>

                          <div className={styles.sourcesTitle}>
                            Следующий продукт: <b>{chainPid || "—"}</b>
                          </div>

                          <button
                            type="button"
                            onClick={onExpandNext}
                            disabled={!canQueue}
                            className={styles.findSourcesButton}
                            title={
                              !queueHasWork
                                ? "Очередь пустая"
                                : !isActiveChainRoot
                                  ? "Доступно только в корне цепочки"
                                  : ""
                            }
                          >
                            {!queueHasWork
                              ? "✅ Цепочка завершена"
                              : "▶️ Раскрыть следующий (основная цепочка)"}
                          </button>

                          {!queueHasWork && (
                            <div
                              className={styles.sourcesTitle}
                              style={{ fontSize: 12, opacity: 0.75 }}
                            >
                              Цепочка закончилась. Можно выбрать другой продукт,
                              найти источники → обобщить → получить новую
                              цепочку.
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {chainError && (
                    <div className={styles.errorText}>
                      Ошибка: {chainError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isProduct && sources.length > 0 && (
            <div className={styles.sourcesBox}>
              <div className={styles.sourcesTitle}>
                Источники ({sources.length})
              </div>

              {sources.map((s) => (
                <details key={s.url} className={styles.sourceItem}>
                  <summary className={styles.sourceSummary}>
                    <span className={styles.sourceTitle}>{s.title}</span>
                  </summary>

                  <div className={styles.sourceBody}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.sourceLink}
                    >
                      {s.url}
                    </a>

                    <div className={styles.sourceDesc}>
                      {s.technology_description}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={handleDelete}
              className={styles.deleteButton}
            >
              Удалить узел
            </button>
          </div>
        </div>
      </div>
    </>
  );
};