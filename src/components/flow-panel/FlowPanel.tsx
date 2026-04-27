import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { DirectionTabProps, FlowPanelProps } from "./types";
import { StepByStepContent } from "./StepByStepContent";
import {
  getDefaultFillCardSystemPrompt,
  getFieldsForNodeType,
  labelToKey,
  type FillCardField,
} from "../../prompts/fillCardPrompts";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import { getDefaultAggregateFullPrompt, splitAggregatePrompt } from "../../prompts/aggregatePrompt";
import { getDefaultSourcesPrompt } from "../../prompts/sourcesPrompt";

import styles from "./FlowPanel.module.css";

// ─────────────────────────────────────────────────
// DirectionContent — reusable block for "down" / "up" tab
// ─────────────────────────────────────────────────
const DirectionContent: FC<DirectionTabProps> = ({
  direction,

  onFindSources,
  sourcesLoading,
  sourcesError,
  sources,

  onAggregateSources,
  aggregateLoading,
  aggregateError,
  hasAggregated,
  aggregatedDescription,
  onChangeAggregatedDescription,

  productName,

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
  onExpandNext,

  buildMode,
  onChangeBuildMode,
  stepChainStatus,
  stepChainError,
  stepChainStepCount,
  stepChainCurrentProductLabel,
  stepChainCurrentProductNodeId,
  stepChainInsufficientProducts,
  onUndoStep,
  stepChainBranchOptions,
  onSelectBranch,

  // step v2
  stepSources,
  stepSourcesStatus,
  stepSourcesError,
  stepAggregatedText,
  stepAggregateStatus,
  stepAggregateError,
  stepNeedsSources,
  stepInsufficientProducts,
  stepBuildResult,
  stepBuildStatus,
  stepBuildError,
  pendingStep,
  onFetchStepSources,
  onAggregateStepSources,
  onBuildStep,
  onClearStepState,
  onAcceptStep,
  onRejectStep,
  onRetryStep,

  isAlternativeNode,
  altDescription,
}) => {
  const hasSources = Array.isArray(sources) && sources.length > 0;

  // Local state for textarea to avoid Redux dispatch on every keystroke
  const [localDesc, setLocalDesc] = useState(aggregatedDescription ?? "");
  useEffect(() => {
    setLocalDesc(aggregatedDescription ?? "");
  }, [aggregatedDescription]);

  // ── sources prompt + maxItems editor state ──
  const [maxItems, setMaxItems] = useState(5);
  const [sourcesPromptOpen, setSourcesPromptOpen] = useState(false);
  const [manualSourcesPrompt, setManualSourcesPrompt] = useState<string | null>(null);

  const autoSourcesPrompt = useMemo(
    () => getDefaultSourcesPrompt(direction, productName || "", maxItems),
    [direction, productName, maxItems],
  );
  const displayedSourcesPrompt = manualSourcesPrompt ?? autoSourcesPrompt;
  const isSourcesPromptDirty = manualSourcesPrompt !== null;
  const isSourcesPromptEmpty = displayedSourcesPrompt.trim() === "";

  const handleFindSourcesClick = () => {
    onFindSources?.({
      maxItems,
      customSystemPrompt: isSourcesPromptDirty ? displayedSourcesPrompt : undefined,
    });
  };

  // ── chain prompt editor state ──
  const [chainPromptOpen, setChainPromptOpen] = useState(false);
  const [manualChainPrompt, setManualChainPrompt] = useState<string | null>(null);

  const autoChainPrompt = useMemo(
    () => getDefaultChainSystemPrompt(productName || ""),
    [productName],
  );
  const displayedChainPrompt = manualChainPrompt ?? autoChainPrompt;
  const isChainPromptDirty = manualChainPrompt !== null;
  const isChainPromptEmpty = displayedChainPrompt.trim() === "";

  // ── aggregate prompt editor state ──
  const [aggPromptOpen, setAggPromptOpen] = useState(false);
  const [manualAggPrompt, setManualAggPrompt] = useState<string | null>(null);

  const autoAggPrompt = useMemo(
    () => getDefaultAggregateFullPrompt(direction, productName),
    [direction, productName],
  );
  const displayedAggPrompt = manualAggPrompt ?? autoAggPrompt;
  const isAggPromptDirty = manualAggPrompt !== null;
  const isAggPromptEmpty = displayedAggPrompt.trim() === "";

  const queueHasWork = !!queueLen && queueLen > 0;
  const canQueue =
    !!chainReady &&
    !!chainUiEnabled &&
    !!isActiveChainRoot &&
    !!onExpandNext &&
    queueHasWork &&
    !chainLoading;

  const isLoading = sourcesLoading || aggregateLoading || chainLoading;

  // buildMode может быть undefined (если компонент в card-режиме или проп не передан).
  // В build-режиме: null = пользователь ещё не выбрал, "whole"/"step" = выбран.
  const isBuildContext = typeof buildMode !== "undefined";

  return (
    <>
      {/* ── Build mode toggle (shown FIRST, before any requests) ── */}
      {isBuildContext && (
        <div className={styles.formGroup}>
          <div className={styles.modeToggleRow}>
            <button
              type="button"
              className={`${styles.modeToggleBtn} ${buildMode === "whole" ? styles.modeToggleBtnActive : ""}`}
              onClick={() => onChangeBuildMode?.("whole")}
            >
              Вся цепочка
            </button>
            <button
              type="button"
              className={`${styles.modeToggleBtn} ${buildMode === "step" ? styles.modeToggleBtnActive : ""}`}
              onClick={() => onChangeBuildMode?.("step")}
            >
              По шагам
            </button>
          </div>

          {buildMode === null && (
            <div
              className={styles.sourcesTitle}
              style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}
            >
              Выберите режим: «Вся цепочка» — один запрос → целая цепочка;
              «По шагам» — один запрос = один шаг с превью и возможностью
              откатить.
            </div>
          )}
        </div>
      )}

      {/* ── Step-by-step v2 flow (dedicated /step/* routes) ── */}
      {isBuildContext && buildMode === "step" && (
        <StepByStepContent
          stepChainStatus={stepChainStatus}
          stepChainError={stepChainError}
          stepChainStepCount={stepChainStepCount}
          stepChainCurrentProductLabel={stepChainCurrentProductLabel}
          stepChainInsufficientProducts={stepChainInsufficientProducts}
          onUndoStep={onUndoStep}
          stepSources={stepSources}
          stepSourcesStatus={stepSourcesStatus}
          stepSourcesError={stepSourcesError}
          stepAggregatedText={stepAggregatedText}
          stepAggregateStatus={stepAggregateStatus}
          stepAggregateError={stepAggregateError}
          stepNeedsSources={stepNeedsSources}
          stepInsufficientProducts={stepInsufficientProducts}
          stepBuildResult={stepBuildResult}
          stepBuildStatus={stepBuildStatus}
          stepBuildError={stepBuildError}
          pendingStep={pendingStep}
          onFetchStepSources={onFetchStepSources}
          onAggregateStepSources={onAggregateStepSources}
          onBuildStep={onBuildStep}
          onClearStepState={onClearStepState}
          onAcceptStep={onAcceptStep}
          onRejectStep={onRejectStep}
          onRetryStep={onRetryStep}
          isAlternativeNode={isAlternativeNode}
          altDescription={altDescription}
        />
      )}

      {/* ── Full-chain ("whole") flow — the original path, unchanged ── */}
      {(!isBuildContext || buildMode === "whole") && (
      <>
      {isLoading && (
        <div className={styles.tabLoader}>
          <div className={styles.tabSpinner} />
          <span>
            {sourcesLoading
              ? "Поиск источников..."
              : aggregateLoading
                ? "Обобщение источников..."
                : "Построение chain..."}
          </span>
        </div>
      )}

      {/* aggregated description textarea */}
      {hasAggregated && aggregatedDescription && (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Обобщённое описание:</label>
          <textarea
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={() => {
              if (localDesc !== (aggregatedDescription ?? "")) {
                onChangeAggregatedDescription?.({
                  target: { value: localDesc },
                } as React.ChangeEvent<HTMLTextAreaElement>);
              }
            }}
            className={styles.directionTextarea}
            rows={4}
          />
        </div>
      )}

      {/* 1) нет источников -> поиск */}
      {!hasSources && (
        <div className={styles.formGroup}>
          {/* maxItems stepper */}
          <div className={styles.maxItemsRow}>
            <label className={styles.formLabel}>Количество источников:</label>
            <input
              type="number"
              min={2}
              max={5}
              value={maxItems}
              onChange={(e) =>
                setMaxItems(Math.min(5, Math.max(2, Number(e.target.value) || 2)))
              }
              className={styles.maxItemsInput}
            />
          </div>

          {/* sources prompt editor */}
          <button
            type="button"
            onClick={() => setSourcesPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {sourcesPromptOpen ? "Скрыть промпт поиска" : "Редактировать промпт поиска"}
          </button>

          {sourcesPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>Промпт поиска источников:</label>
              <textarea
                value={displayedSourcesPrompt}
                onChange={(e) => setManualSourcesPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isSourcesPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualSourcesPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}
              {isSourcesPromptEmpty && (
                <div className={styles.errorText}>Промпт не может быть пустым</div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleFindSourcesClick}
            disabled={sourcesLoading || aggregateLoading || isSourcesPromptEmpty}
            className={styles.findSourcesButton}
          >
            {sourcesLoading
              ? "Поиск источников..."
              : isSourcesPromptDirty
                ? "Поиск источников (свой промпт)"
                : "Поиск источников"}
          </button>

          {sourcesError && (
            <div className={styles.errorText}>Ошибка: {sourcesError}</div>
          )}
        </div>
      )}

      {/* 2) источники есть, не обобщены */}
      {hasSources && !hasAggregated && (
        <div className={styles.formGroup}>
          <div className={styles.sourcesTitle}>
            Источники найдены: {sources.length}
          </div>

          {sources.length < 2 && (
            <div className={styles.warningText}>
              Найдено менее 2 источников — обобщение недоступно. Попробуйте
              повторить поиск.
            </div>
          )}

          {/* aggregate prompt editor */}
          {sources.length >= 2 && (
            <>
              <button
                type="button"
                onClick={() => setAggPromptOpen((v) => !v)}
                className={styles.promptToggle}
              >
                {aggPromptOpen ? "Скрыть промпт обобщения" : "Редактировать промпт обобщения"}
              </button>

              {aggPromptOpen && (
                <div className={styles.promptEditor}>
                  <label className={styles.promptLabel}>
                    Системный + пользовательский промпт обобщения:
                  </label>
                  <textarea
                    value={displayedAggPrompt}
                    onChange={(e) => setManualAggPrompt(e.target.value)}
                    className={styles.promptTextarea}
                    rows={12}
                  />
                  {isAggPromptDirty && (
                    <button
                      type="button"
                      className={styles.promptResetBtn}
                      onClick={() => setManualAggPrompt(null)}
                    >
                      Сбросить промпт
                    </button>
                  )}
                  {isAggPromptEmpty && (
                    <div className={styles.errorText}>
                      Промпт не может быть пустым
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (isAggPromptDirty) {
                const { system, user } = splitAggregatePrompt(displayedAggPrompt);
                onAggregateSources?.(system, user);
              } else {
                onAggregateSources?.();
              }
            }}
            disabled={sourcesLoading || aggregateLoading || sources.length < 2 || isAggPromptEmpty}
            className={styles.findSourcesButton}
          >
            {aggregateLoading
              ? "Обобщение источников..."
              : isAggPromptDirty
                ? "Обобщить источники (свой промпт)"
                : "Обобщить источники"}
          </button>

          {sources.length < 2 && (
            <button
              type="button"
              onClick={handleFindSourcesClick}
              disabled={sourcesLoading || aggregateLoading || isSourcesPromptEmpty}
              className={styles.findSourcesButton}
            >
              Повторить поиск источников
            </button>
          )}

          {sourcesError && (
            <div className={styles.errorText}>
              Ошибка поиска: {sourcesError}
            </div>
          )}

          {aggregateError && (
            <div className={styles.errorText}>Ошибка: {aggregateError}</div>
          )}
        </div>
      )}

      {/* 3) обобщено -> chain */}
      {hasSources && hasAggregated && (
        <div className={styles.formGroup}>
          {/* row: chain prompt toggle + re-aggregate toggle */}
          <div className={styles.promptToggleRow}>
            <button
              type="button"
              onClick={() => { setChainPromptOpen((v) => !v); setAggPromptOpen(false); }}
              className={styles.promptToggle}
            >
              {chainPromptOpen ? "Скрыть промпт цепочки" : "Редактировать промпт цепочки"}
            </button>
            <button
              type="button"
              onClick={() => { setAggPromptOpen((v) => !v); setChainPromptOpen(false); }}
              className={styles.promptToggle}
            >
              {aggPromptOpen ? "Скрыть промпт обобщения" : "Повторное обобщение"}
            </button>
          </div>

          {/* aggregate prompt editor (re-aggregate) */}
          {aggPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>
                Системный + пользовательский промпт обобщения:
              </label>
              <textarea
                value={displayedAggPrompt}
                onChange={(e) => setManualAggPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isAggPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualAggPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}
              {isAggPromptEmpty && (
                <div className={styles.errorText}>
                  Промпт не может быть пустым
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isAggPromptDirty) {
                    const { system, user } = splitAggregatePrompt(displayedAggPrompt);
                    onAggregateSources?.(system, user);
                  } else {
                    onAggregateSources?.();
                  }
                }}
                disabled={aggregateLoading || isAggPromptEmpty}
                className={styles.findSourcesButton}
              >
                {aggregateLoading
                  ? "Обобщение источников..."
                  : isAggPromptDirty
                    ? "Обобщить повторно (свой промпт)"
                    : "Обобщить повторно"}
              </button>
              {aggregateError && (
                <div className={styles.errorText}>Ошибка: {aggregateError}</div>
              )}
            </div>
          )}

          {/* chain prompt editor */}

          {chainPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>
                Системный промпт цепочки:
              </label>
              <textarea
                value={displayedChainPrompt}
                onChange={(e) => setManualChainPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isChainPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualChainPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}
              {isChainPromptEmpty && (
                <div className={styles.errorText}>
                  Промпт не может быть пустым
                </div>
              )}
            </div>
          )}

          {canInitChainHere && (
            <button
              type="button"
              onClick={() =>
                onInitChain?.(isChainPromptDirty ? displayedChainPrompt : undefined)
              }
              disabled={
                sourcesLoading || aggregateLoading || chainLoading || isChainPromptEmpty
              }
              className={styles.findSourcesButton}
            >
              {chainLoading
                ? "Построение chain..."
                : isChainPromptDirty
                  ? (initChainLabel || "Получить цепочку") + " (свой промпт)"
                  : initChainLabel || "Получить цепочку (chain)"}
            </button>
          )}

          {chainReady && chainUiEnabled && (
            <>
              {!isActiveChainRoot && (
                <div
                  className={styles.sourcesTitle}
                  style={{ fontSize: 12, opacity: 0.75 }}
                >
                  Продолжение цепочки доступно только в корневом продукте
                  активной цепочки.
                </div>
              )}

              {isActiveChainRoot && (
                <>
                  <div className={styles.sourcesTitle}>
                    Очередь: <b>{queueLen ?? 0}</b>
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
                      ? "Цепочка завершена"
                      : "Раскрыть следующий (основная цепочка)"}
                  </button>

                  {!queueHasWork && (
                    <div
                      className={styles.sourcesTitle}
                      style={{ fontSize: 12, opacity: 0.75 }}
                    >
                      Цепочка закончилась. Можно выбрать другой продукт, найти
                      источники → обобщить → получить новую цепочку.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {chainError && (
            <div className={styles.errorText}>Ошибка: {chainError}</div>
          )}
        </div>
      )}

      {/* sources list */}
      {hasSources && (
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
      </>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────
// FlowPanel — main component
// ─────────────────────────────────────────────────
export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  descriptionValue,
  onChangeDescription,

  nodeType,

  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,

  downTab,
  upTab,

  mode,
  buildDirection,
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

  // ── prompt editor state ──
  const [promptOpen, setPromptOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);

  const autoPrompt = useMemo(
    () => getDefaultFillCardSystemPrompt(effectiveNodeType, activeFields),
    [effectiveNodeType, activeFields],
  );

  const displayedPrompt = manualPrompt ?? autoPrompt;
  const isPromptDirty = manualPrompt !== null;
  const fieldsReduced =
    activeFields.length !== predefinedFields.length || customFields.length > 0;

  // reset when nodeType changes
  useEffect(() => {
    const fields = getFieldsForNodeType(effectiveNodeType);
    setSelectedKeys(new Set(fields.map((f) => f.key)));
    setCustomFields([]);
    setManualPrompt(null);
    setPromptOpen(false);
    setNewFieldLabel("");
  }, [effectiveNodeType]);

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
      useWebSearch,
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

  if (!isOpen) return null;

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>
            {mode === "build"
              ? buildDirection === "down"
                ? "Построить вниз"
                : "Построить вверх"
              : "Редактирование узла"}
          </h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.panelContent}>
          {/* Node name */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Название узла:</label>
            <input
              value={value}
              onChange={onChangeValue}
              className={styles.formInput}
              placeholder="Введите название узла"
            />
          </div>

          {/* ══════════ MODE: Card ══════════ */}
          {mode === "card" && (
            <>
              {productCardStatus === "loading" && (
                <div className={styles.tabLoader}>
                  <div className={styles.tabSpinner} />
                  <span>Заполняю карточку...</span>
                </div>
              )}

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
                    {/* field checkboxes */}
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

                    {/* prompt textarea */}
                    <label className={styles.promptLabel}>
                      Системный промпт:
                    </label>
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
                      ? "Заполнить (свой промпт)"
                      : "Заполнить карточку"}
                </button>

                {productCardStatus === "failed" && productCardError && (
                  <div className={styles.errorText}>
                    Ошибка: {productCardError}
                  </div>
                )}

                {/* card result */}
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
                    {/* fallback for unknown keys */}
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
            </>
          )}

          {/* ══════════ MODE: Build ══════════ */}
          {mode === "build" && buildDirection && (
            <>
              <div className={styles.buildHeader}>
                {buildDirection === "down"
                  ? `Построить вниз от «${value}»`
                  : `Построить вверх от «${value}»`}
              </div>
              <DirectionContent
                {...(buildDirection === "down" ? downTab : upTab)}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
};
