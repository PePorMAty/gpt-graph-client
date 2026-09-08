import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { DirectionTabProps, FlowPanelProps } from "./types";
import { StepByStepContent } from "./StepByStepContent";
import { FillCardBlock } from "./FillCardBlock";
import { MarkdownEditor } from "../markdown-editor";
import { toTransformationRoutesView } from "../../utils/transformationRoutesView";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import { getDefaultAggregateFullPrompt, splitAggregatePrompt } from "../../prompts/aggregatePrompt";
import { getDefaultSourcesPrompt } from "../../prompts/sourcesPrompt";
import { SourcesTableModal } from "../sources-table-modal";
import { AddSourceForm } from "./AddSourceForm";
import { SearchPromptEditor } from "./SearchPromptEditor";
import { parseDomainsInput } from "../../utils/parseDomains";

import styles from "./FlowPanel.module.css";
import { AiModelSelect } from "../ai-model-select";

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
  stepChainInsufficientProducts,
  onUndoStep,

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
  onCancelStepSources,
  onAggregateStepSources,
  onBuildStep,
  onClearStepState,
  onForceStepPreview,
  onAcceptStep,
  onRejectStep,

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

  // ── белый список доменов поиска (3.3) ──
  const [domainsText, setDomainsText] = useState("");

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
          onCancelStepSources={onCancelStepSources}
          onAggregateStepSources={onAggregateStepSources}
          onAddManualSource={onAddManualSource}
          onBuildStep={onBuildStep}
          onClearStepState={onClearStepState}
          onForceStepPreview={onForceStepPreview}
          onAcceptStep={onAcceptStep}
          onRejectStep={onRejectStep}
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

          {/* редактор поиска: промпт + белый список доменов (3.3) */}
          <SearchPromptEditor
            open={sourcesPromptOpen}
            onToggle={() => setSourcesPromptOpen((v) => !v)}
            prompt={displayedSourcesPrompt}
            onChangePrompt={setManualSourcesPrompt}
            isDirty={isSourcesPromptDirty}
            onResetPrompt={() => setManualSourcesPrompt(null)}
            isEmpty={isSourcesPromptEmpty}
            domainsText={domainsText}
            onChangeDomains={setDomainsText}
          />

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
                  <AiModelSelect />
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
            <>
              <SearchPromptEditor
                open={sourcesPromptOpen}
                onToggle={() => setSourcesPromptOpen((v) => !v)}
                prompt={displayedSourcesPrompt}
                onChangePrompt={setManualSourcesPrompt}
                isDirty={isSourcesPromptDirty}
                onResetPrompt={() => setManualSourcesPrompt(null)}
                isEmpty={isSourcesPromptEmpty}
                domainsText={domainsText}
                onChangeDomains={setDomainsText}
              />
              <button
                type="button"
                onClick={handleFindSourcesClick}
                disabled={sourcesLoading || aggregateLoading || isSourcesPromptEmpty}
                className={styles.findSourcesButton}
              >
                {isSourcesPromptDirty
                  ? "Повторить поиск источников (свой промпт)"
                  : "Повторить поиск источников"}
              </button>
            </>
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
          {/* key по направлению: без него React переиспользует тот же
              экземпляр, и состояние вкладки (правленый промпт, домены,
              число источников) переезжает с «вверх» на «вниз». */}
          <DirectionContent key={dir} {...(dir === "down" ? downTab : upTab)} />
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
  linkedProducts = [],
  onFocusLinkedProduct,
  readOnly = false,
  nodeId,
  sourceGroups = [],
  sourcesCurrentProduct = "",
  isAltNode = false,
  isUnfilledUserProduct = false,
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
  // Вкладка описания в карточке преобразования: обычное описание ↔
  // технологическое описание шага ↔ обобщённое описание шага.
  const [descTab, setDescTab] = useState<"plain" | "tech" | "aggregated">(
    "plain",
  );
  // Сброс при смене выбранной ноды.
  useEffect(() => {
    setDBuildOpen(false);
    setSourcesOpen(false);
    setDescTab("plain");
  }, [nodeId]);

  const hasAggregatedDesc =
    typeof aggregatedDescription === "string" &&
    aggregatedDescription.trim().length > 0;

  // Обобщение шага несёт служебные разделы (раскрываемый продукт, примечания,
  // родословная) — они нужны построению шага, но в карточке лишние: прячем их
  // только на показ, сам текст в node.data остаётся полным.
  const aggregatedPreview = useMemo(
    () => toTransformationRoutesView(aggregatedDescription ?? ""),
    [aggregatedDescription],
  );

  // «Технологическое описание» — вкладка карточки преобразования (шаг «продукт
  // → преобразование → продукт»); у альтернатив её нет.
  const showTechTab = effectiveNodeType === "transformation" && !isAltNode;

  // Выбранная вкладка может стать недоступной (сменился узел, обобщение ещё не
  // пришло) — тогда показываем обычное описание, а не пустоту.
  const activeDescTab =
    (descTab === "tech" && !showTechTab) ||
    (descTab === "aggregated" && !hasAggregatedDesc)
      ? "plain"
      : descTab;

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

  // Карточка не перехватывает клики вне себя: граф остаётся живым, пока она
  // открыта (двигать полотно, выделять и открывать другие узлы). Закрытие —
  // только крестиком в шапке, поэтому ни оверлея, ни клика-снаружи здесь нет.

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
                ) : showTechTab || hasAggregatedDesc ? (
                  /* У преобразования описание разложено по вкладкам:
                     «Краткое описание» ↔ «Технологическое описание» (карточка
                     технологии) ↔ «Технологические маршруты» (обобщение шага,
                     markdown — если есть). */
                  <>
                    <div className={styles.modeToggleRow}>
                      <button
                        type="button"
                        className={`${styles.modeToggleBtn} ${activeDescTab === "plain" ? styles.modeToggleBtnActive : ""}`}
                        onClick={() => setDescTab("plain")}
                      >
                        Краткое описание
                      </button>
                      {showTechTab && (
                        <button
                          type="button"
                          className={`${styles.modeToggleBtn} ${activeDescTab === "tech" ? styles.modeToggleBtnActive : ""}`}
                          onClick={() => setDescTab("tech")}
                          title="Карточка технологии: описание и основные параметры"
                        >
                          Технологическое описание
                          {productCardStatus === "loading" && " …"}
                        </button>
                      )}
                      {hasAggregatedDesc && (
                        <button
                          type="button"
                          className={`${styles.modeToggleBtn} ${activeDescTab === "aggregated" ? styles.modeToggleBtnActive : ""}`}
                          onClick={() => setDescTab("aggregated")}
                        >
                          Технологические маршруты
                        </button>
                      )}
                    </div>
                    {activeDescTab === "plain" && (
                      <textarea
                        value={descriptionValue}
                        onChange={onChangeDescription}
                        onBlur={onFieldBlur}
                        className={styles.formTextarea}
                        placeholder="Введите описание узла"
                        rows={4}
                        readOnly={readOnly}
                      />
                    )}
                    {activeDescTab === "tech" && (
                      <FillCardBlock
                        key={nodeId ?? "tech"}
                        nodeType={effectiveNodeType}
                        layout="tech"
                        onBuildProductCard={onBuildProductCard}
                        productCardStatus={productCardStatus}
                        productCardError={productCardError}
                        productCard={productCard}
                        readOnly={readOnly}
                      />
                    )}
                    {activeDescTab === "aggregated" && (
                      <MarkdownEditor
                        value={aggregatedDescription ?? ""}
                        previewValue={aggregatedPreview}
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
                    {/* Ручной продукт из превью шага ждёт описания — говорим
                        об этом прямо у поля; заполнение снимет пометку с узла. */}
                    {isUnfilledUserProduct && (
                      <div className={styles.unfilledHint}>
                        ✎ Продукт добавлен вручную — описание не заполнено.
                        Заполните его здесь, и пометка с узла снимется.
                      </div>
                    )}
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

              {/* ── Связанные продукты: ссылки-соседи (напрямую или через
                  преобразование). Клик закрывает карточку и фокусирует полотно
                  на выбранной ноде. ── */}
              {effectiveNodeType === "product" &&
                linkedProducts.length > 0 && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Связанные продукты:
                    </label>
                    <div className={styles.linkedProducts}>
                      {linkedProducts.map((p) => (
                        <button
                          key={`${p.role}-${p.nodeId}`}
                          type="button"
                          className={styles.linkedProductBtn}
                          onClick={() => onFocusLinkedProduct?.(p.nodeId)}
                          title={
                            (p.screenDirection === "up"
                              ? "Выше по графу"
                              : "Ниже по графу") +
                            (p.viaTransformation
                              ? ` через «${p.viaTransformation}»`
                              : "") +
                            " — открыть карточку и показать на графе"
                          }
                        >
                          {/* Стрелка по РЕАЛЬНОМУ расположению соседа на
                              полотне (screenDirection), а не по роли ребра. */}
                          <span
                            className={styles.linkedProductArrow}
                            aria-hidden
                          >
                            {p.screenDirection === "up" ? "↑" : "↓"}
                          </span>
                          <span className={styles.linkedProductLabel}>
                            {p.label || p.nodeId}
                          </span>
                          {p.viaTransformation && (
                            <span className={styles.linkedProductVia}>
                              {p.viaTransformation}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* ── КАРТОЧКА УЗЛА (скрыта в режиме просмотра) ──
                  У преобразования блок живёт во вкладке «Технологическое
                  описание», поэтому здесь его не дублируем. */}
              {!readOnly && !showTechTab && (
                <FillCardBlock
                  nodeType={effectiveNodeType}
                  onBuildProductCard={onBuildProductCard}
                  productCardStatus={productCardStatus}
                  productCardError={productCardError}
                  productCard={productCard}
                />
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
