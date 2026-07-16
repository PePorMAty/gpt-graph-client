import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { DirectionTabProps, FlowPanelProps } from "./types";
import { StepByStepContent } from "./StepByStepContent";
import { MarkdownEditor } from "../markdown-editor";
import {
  getDefaultFillCardSystemPrompt,
  getFieldsForNodeType,
  labelToKey,
  type FillCardField,
} from "../../prompts/fillCardPrompts";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import { getDefaultAggregateFullPrompt, splitAggregatePrompt } from "../../prompts/aggregatePrompt";
import { getDefaultSourcesPrompt } from "../../prompts/sourcesPrompt";
import { SourcesTableModal } from "../sources-table-modal";
import { AddSourceForm } from "./AddSourceForm";
import { SearchDomainsInput } from "./SearchDomainsInput";
import { parseDomainsInput } from "../../utils/parseDomains";

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
  onChangeStepAggregatedText,
  onAddManualSource,

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
  stepSourcesOrigin,
  stepSourcesExhausted,
  stepNeedsFreshSources,
  stepAggregatedText,
  stepAggregateStatus,
  stepAggregateError,
  stepNeedsSources,
  stepInsufficientProducts,
  stepBuildResult,
  stepBuildStatus,
  stepBuildError,
  stepBuiltFromAggregate,
  pendingStep,
  onFetchStepSources,
  onAggregateStepSources,
  onBuildStep,
  onClearStepState,
  onForceStepPreview,
  onAcceptStep,
  onRejectStep,
  onRetryStep,

  isAlternativeNode,
  altDescription,
}) => {
  const hasSources = Array.isArray(sources) && sources.length > 0;

  // ── Выбор источников для обобщения (3.1): чекбоксы, по умолчанию все ──
  const [excludedUrls, setExcludedUrls] = useState<Set<string>>(new Set());
  // Сбрасываем выбор, когда реально меняется НАБОР источников (а не ссылка на массив).
  const sourcesUrlsKey = useMemo(
    () =>
      sources
        .map((s) => (s.url || "").trim().toLowerCase())
        .sort()
        .join("|"),
    [sources],
  );
  useEffect(() => {
    setExcludedUrls(new Set());
  }, [sourcesUrlsKey]);
  const selectedSources = useMemo(
    () =>
      sources.filter(
        (s) => !excludedUrls.has((s.url || "").trim().toLowerCase()),
      ),
    [sources, excludedUrls],
  );
  const toggleSourceSelected = (url: string) => {
    const key = (url || "").trim().toLowerCase();
    setExcludedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── sources prompt + maxItems editor state ──
  const [maxItems, setMaxItems] = useState(5);
  const [sourcesPromptOpen, setSourcesPromptOpen] = useState(false);
  const [manualSourcesPrompt, setManualSourcesPrompt] = useState<string | null>(null);

  // ── ограничение доменов поиска (3.3) ──
  const [domainsText, setDomainsText] = useState("");
  const [domainsOpen, setDomainsOpen] = useState(false);

  const autoSourcesPrompt = useMemo(
    () => getDefaultSourcesPrompt(direction, productName || "", maxItems),
    [direction, productName, maxItems],
  );
  const displayedSourcesPrompt = manualSourcesPrompt ?? autoSourcesPrompt;
  const isSourcesPromptDirty = manualSourcesPrompt !== null;
  const isSourcesPromptEmpty = displayedSourcesPrompt.trim() === "";

  const handleFindSourcesClick = () => {
    const allowedDomains = parseDomainsInput(domainsText);
    onFindSources?.({
      maxItems,
      customSystemPrompt: isSourcesPromptDirty ? displayedSourcesPrompt : undefined,
      ...(allowedDomains.length ? { allowedDomains } : {}),
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
          direction={direction}
          stepChainStatus={stepChainStatus}
          stepChainError={stepChainError}
          stepChainStepCount={stepChainStepCount}
          stepChainCurrentProductLabel={stepChainCurrentProductLabel}
          stepChainInsufficientProducts={stepChainInsufficientProducts}
          onUndoStep={onUndoStep}
          stepSources={stepSources}
          stepSourcesStatus={stepSourcesStatus}
          stepSourcesError={stepSourcesError}
          stepSourcesOrigin={stepSourcesOrigin}
          stepSourcesExhausted={stepSourcesExhausted}
          stepNeedsFreshSources={stepNeedsFreshSources}
          stepAggregatedText={stepAggregatedText}
          stepAggregateStatus={stepAggregateStatus}
          stepAggregateError={stepAggregateError}
          stepNeedsSources={stepNeedsSources}
          stepInsufficientProducts={stepInsufficientProducts}
          stepBuildResult={stepBuildResult}
          stepBuildStatus={stepBuildStatus}
          stepBuildError={stepBuildError}
          stepBuiltFromAggregate={stepBuiltFromAggregate}
          pendingStep={pendingStep}
          onFetchStepSources={onFetchStepSources}
          onAggregateStepSources={onAggregateStepSources}
          onAddManualSource={onAddManualSource}
          onBuildStep={onBuildStep}
          onClearStepState={onClearStepState}
          onForceStepPreview={onForceStepPreview}
          onAcceptStep={onAcceptStep}
          onRejectStep={onRejectStep}
          onRetryStep={onRetryStep}
          onChangeStepAggregatedText={onChangeStepAggregatedText}
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

      {/* aggregated description — markdown render + edit */}
      {hasAggregated && aggregatedDescription && (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Обобщённое описание:</label>
          <MarkdownEditor
            value={aggregatedDescription ?? ""}
            onChange={(v) =>
              onChangeAggregatedDescription?.({
                target: { value: v },
              } as React.ChangeEvent<HTMLTextAreaElement>)
            }
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

          {/* ограничение доменов поиска (3.3) */}
          <SearchDomainsInput
            value={domainsText}
            onChange={setDomainsText}
            open={domainsOpen}
            onToggle={() => setDomainsOpen((v) => !v)}
          />

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

          {/* Ручное добавление источников доступно и ДО поиска (3.2). */}
          <AddSourceForm onAdd={onAddManualSource} />
        </div>
      )}

      {/* 2) источники есть, не обобщены */}
      {hasSources && !hasAggregated && (
        <div className={styles.formGroup}>
          <div className={styles.sourcesTitle}>
            Источники найдены: {sources.length}{" "}
            <span className={styles.selectedCounter}>
              (для обобщения выбрано: {selectedSources.length})
            </span>
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
                onAggregateSources?.(system, user, selectedSources);
              } else {
                onAggregateSources?.(undefined, undefined, selectedSources);
              }
            }}
            disabled={
              sourcesLoading ||
              aggregateLoading ||
              selectedSources.length < 2 ||
              isAggPromptEmpty
            }
            className={styles.findSourcesButton}
            title={
              selectedSources.length < 2
                ? "Для обобщения нужно выбрать минимум 2 источника"
                : ""
            }
          >
            {aggregateLoading
              ? "Обобщение источников..."
              : isAggPromptDirty
                ? "Обобщить источники (свой промпт)"
                : `Обобщить источники (${selectedSources.length})`}
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
                    onAggregateSources?.(system, user, selectedSources);
                  } else {
                    onAggregateSources?.(undefined, undefined, selectedSources);
                  }
                }}
                disabled={
                  aggregateLoading ||
                  isAggPromptEmpty ||
                  selectedSources.length < 2
                }
                className={styles.findSourcesButton}
              >
                {aggregateLoading
                  ? "Обобщение источников..."
                  : isAggPromptDirty
                    ? "Обобщить повторно (свой промпт)"
                    : `Обобщить повторно (${selectedSources.length})`}
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
            Источники ({sources.length}){" "}
            <span className={styles.selectedCounter}>
              · выбрано: {selectedSources.length}
            </span>
          </div>

          {sources.map((s) => (
            <details key={s.url} className={styles.sourceItem}>
              <summary className={styles.sourceSummary}>
                <span className={styles.sourceSelectRow}>
                  {/* Чекбокс выбора источника для обобщения (3.1).
                      stopPropagation — чтобы клик не раскрывал details. */}
                  <input
                    type="checkbox"
                    checked={
                      !excludedUrls.has((s.url || "").trim().toLowerCase())
                    }
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSourceSelected(s.url)}
                    title="Использовать этот источник при обобщении"
                  />
                  <span className={styles.sourceTitle}>{s.title}</span>
                </span>
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

          {/* Ручное добавление источников ПОСЛЕ поиска (3.2). */}
          <AddSourceForm onAdd={onAddManualSource} />
        </div>
      )}
      </>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────
// PanelBuildView — build-view внутри панели (варианты B и C).
// Сначала выбор направления (вверх/вниз), затем существующий DirectionContent.
// ─────────────────────────────────────────────────
const PanelBuildView: FC<{
  productName: string;
  downTab: DirectionTabProps;
  upTab: DirectionTabProps;
  onBack?: () => void;
}> = ({ productName, downTab, upTab, onBack }) => {
  const [dir, setDir] = useState<BuildDirection | null>(null);

  return (
    <>
      {onBack && (
        <button
          type="button"
          className={styles.promptToggle}
          onClick={onBack}
          style={{ marginBottom: 8 }}
        >
          ‹ Назад к карточке
        </button>
      )}

      <div className={styles.formGroup}>
        <div className={styles.modeToggleRow}>
          <button
            type="button"
            className={`${styles.modeToggleBtn} ${dir === "up" ? styles.modeToggleBtnActive : ""}`}
            onClick={() => setDir("up")}
          >
            Построить вверх
          </button>
          <button
            type="button"
            className={`${styles.modeToggleBtn} ${dir === "down" ? styles.modeToggleBtnActive : ""}`}
            onClick={() => setDir("down")}
          >
            Построить вниз
          </button>
        </div>
        {dir === null && (
          <div
            className={styles.sourcesTitle}
            style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}
          >
            Выберите направление построения.
          </div>
        )}
      </div>

      {dir && (
        <>
          <div className={styles.buildHeader}>
            {dir === "down"
              ? `Построить вниз от «${productName}»`
              : `Построить вверх от «${productName}»`}
          </div>
          <DirectionContent {...(dir === "down" ? downTab : upTab)} />
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
  onFieldBlur,

  nodeType,
  transformationSources,

  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,

  downTab,
  upTab,

  hasOutgoingProductNeighbors = false,
  onFetchTransformations,
  readOnly = false,
  nodeId,
  sourceGroups = [],
  sourcesCurrentProduct = "",
  isAltNode = false,
  altDirection,
  aggregatedDescription,
  onCommitDescription,
  onCommitAggregatedDescription,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveNodeType = nodeType || "product";

  // Построение и таблица источников открываются в модальных окнах.
  const [dBuildOpen, setDBuildOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Вкладка описания в карточке преобразования: обычное описание ↔ обобщённое.
  const [descTab, setDescTab] = useState<"plain" | "aggregated">("plain");
  // Сброс при смене выбранной ноды.
  useEffect(() => {
    setDBuildOpen(false);
    setSourcesOpen(false);
    setDescTab("plain");
  }, [nodeId]);

  const hasAggregatedDesc =
    typeof aggregatedDescription === "string" &&
    aggregatedDescription.trim().length > 0;

  // Счётчик на кнопке «Источники» — всего источников в таблице (по «своим»
  // группам; унаследованные не считаем, чтобы не задваивать набор предка).
  const totalSourceCount = useMemo(
    () =>
      sourceGroups.reduce(
        (n, g) => n + (g.inheritedFrom ? 0 : g.sources.length),
        0,
      ),
    [sourceGroups],
  );

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
      // Пока открыта модалка варианта D (построение/источники) — клики
      // обрабатывает сама модалка; панель не закрываем (модалки рендерятся вне
      // panelRef, иначе любой клик по ним закрыл бы панель).
      if (dBuildOpen || sourcesOpen) return;
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
  }, [isOpen, onClose, dBuildOpen, sourcesOpen]);

  // Esc закрывает модалку построения (вариант D). У таблицы источников —
  // собственный обработчик Esc.
  useEffect(() => {
    if (!dBuildOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDBuildOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dBuildOpen]);

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
            {readOnly ? "Просмотр узла" : "Редактирование узла"}
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
              onBlur={onFieldBlur}
              className={styles.formInput}
              placeholder="Введите название узла"
              readOnly={readOnly}
            />
          </div>

          {/* ══════════ Карточка ══════════ */}
          {(
            <>
              {productCardStatus === "loading" && (
                <div className={styles.tabLoader}>
                  <div className={styles.tabSpinner} />
                  <span>Заполняю карточку...</span>
                </div>
              )}

              <div className={styles.formGroup}>
                {isAltNode ? (
                  /* Задача №1: описание альтернативы рендерим как markdown. */
                  <>
                    <label className={styles.formLabel}>Описание:</label>
                    <MarkdownEditor
                      value={descriptionValue}
                      onChange={readOnly ? undefined : onCommitDescription}
                      placeholder="Введите описание (Markdown)"
                    />
                  </>
                ) : hasAggregatedDesc ? (
                  /* Задача №2: у преобразования есть обобщённое описание —
                     переключатель «Описание ↔ Обобщённое» (обобщённое = markdown). */
                  <>
                    <div className={styles.modeToggleRow}>
                      <button
                        type="button"
                        className={`${styles.modeToggleBtn} ${descTab === "plain" ? styles.modeToggleBtnActive : ""}`}
                        onClick={() => setDescTab("plain")}
                      >
                        Описание
                      </button>
                      <button
                        type="button"
                        className={`${styles.modeToggleBtn} ${descTab === "aggregated" ? styles.modeToggleBtnActive : ""}`}
                        onClick={() => setDescTab("aggregated")}
                      >
                        Обобщённое
                      </button>
                    </div>
                    {descTab === "plain" ? (
                      <textarea
                        value={descriptionValue}
                        onChange={onChangeDescription}
                        onBlur={onFieldBlur}
                        className={styles.formTextarea}
                        placeholder="Введите описание узла"
                        rows={4}
                        readOnly={readOnly}
                      />
                    ) : (
                      <MarkdownEditor
                        value={aggregatedDescription ?? ""}
                        onChange={
                          readOnly ? undefined : onCommitAggregatedDescription
                        }
                        placeholder="Обобщённое описание (Markdown)"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <label className={styles.formLabel}>Описание:</label>
                    <textarea
                      value={descriptionValue}
                      onChange={onChangeDescription}
                      onBlur={onFieldBlur}
                      className={styles.formTextarea}
                      placeholder="Введите описание узла"
                      rows={4}
                      readOnly={readOnly}
                    />
                  </>
                )}
                {Array.isArray(transformationSources) &&
                  transformationSources.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.8,
                          marginBottom: 4,
                        }}
                      >
                        Источники:
                      </div>
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 20,
                          fontSize: 13,
                          lineHeight: 1.4,
                        }}
                      >
                        {transformationSources.map((url, i) => (
                          <li key={`${i}-${url}`}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "#1565c0",
                                wordBreak: "break-all",
                              }}
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
              </div>

              {/* ── PRODUCT CARD (скрыто в режиме просмотра) ── */}
              {!readOnly && (
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
              )}

              {/* Кнопки действий: построение (продукт/альтернатива),
                  преобразования к соседям (продукт), источники (все ноды). */}
              {!readOnly && (
                <div className={styles.formGroup}>
                  {effectiveNodeType === "product" && (
                    <button
                      type="button"
                      className={styles.buildEntryButton}
                      onClick={() => setDBuildOpen(true)}
                    >
                      ⚙ Построение ▸
                    </button>
                  )}
                  {isAltNode && altDirection && (
                    <button
                      type="button"
                      className={styles.buildEntryButton}
                      onClick={() => setDBuildOpen(true)}
                    >
                      ⚙ Построить альтернативу
                    </button>
                  )}
                  {effectiveNodeType === "product" &&
                    hasOutgoingProductNeighbors &&
                    onFetchTransformations && (
                      <button
                        type="button"
                        className={styles.transformEntryButton}
                        onClick={onFetchTransformations}
                      >
                        🔗 Получить преобразования к соседним продуктам
                      </button>
                    )}
                  <button
                    type="button"
                    className={styles.sourcesEntryButton}
                    onClick={() => setSourcesOpen(true)}
                  >
                    📚 Источники ({totalSourceCount})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══════════ Построение в модальном окне ══════════ */}
      {dBuildOpen && !readOnly && (
        <div className={styles.modalOverlay} onClick={() => setDBuildOpen(false)}>
          <div
            className={styles.modalWindow}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {isAltNode
                  ? `Построение альтернативы — «${value}»`
                  : `Построение — «${value}»`}
              </h3>
              <button
                className={styles.modalClose}
                onClick={() => setDBuildOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {isAltNode && altDirection ? (
                /* Альтернатива: направление фиксировано (stepAltDirection),
                   селектор не нужен; downTab/upTab уже несут alt-overrides. */
                <DirectionContent
                  {...(altDirection === "down" ? downTab : upTab)}
                />
              ) : (
                <PanelBuildView
                  productName={value}
                  downTab={downTab}
                  upTab={upTab}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ Таблица источников ══════════ */}
      {sourcesOpen && !readOnly && (
        <SourcesTableModal
          groups={sourceGroups}
          currentProduct={sourcesCurrentProduct}
          onClose={() => setSourcesOpen(false)}
        />
      )}
    </>
  );
};
