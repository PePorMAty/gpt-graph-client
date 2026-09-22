import { useEffect, useMemo, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { DirectionTabProps, FlowPanelProps } from "./types";
import { StepByStepContent } from "./StepByStepContent";
import { MarkdownEditor } from "../markdown-editor";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import { getDefaultAggregateFullPrompt, splitAggregatePrompt } from "../../prompts/aggregatePrompt";
import { getDefaultSourcesPrompt } from "../../prompts/sourcesPrompt";
import { AddSourceForm } from "./AddSourceForm";
import { SearchPromptEditor } from "./SearchPromptEditor";
import { parseDomainsInput } from "../../utils/parseDomains";
import { getAiRequestFields } from "../../hooks/useAiConfig";
import { StepWizardSteps, type WizardStep } from "./StepWizardSteps";
import { ArrowDownIcon, ArrowUpIcon, FlaskIcon, HelpIcon } from "../icons";

import styles from "./FlowPanel.module.css";
import wiz from "./StepWizard.module.css";
import { AiModelSelect } from "../ai-model-select";
import { NodeCard } from "./NodeCard";

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
      {/* ── Build mode toggle (shown FIRST, before any requests) ──
          Только пока режим не выбран. Выбранный переключатель повторял бы тот,
          что стоит на первом экране мастера, — два одинаковых ряда кнопок
          подряд в одном окне. Вернуться к выбору можно по номеру «1» в полосе
          шагов. Для узла-альтернативы мастера нет, и здесь по-прежнему всё. */}
      {isBuildContext && buildMode === null && (
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

/** Сколько источников просить, когда поиск запускают с первого экрана. */
const DEFAULT_MAX_SOURCES = 5;

/**
 * На каком шаге мастера мы находимся.
 *
 * Шаг не хранится отдельным состоянием, а выводится из того, что уже есть:
 * иначе счётчик и содержимое разошлись бы при первом же откате шага или
 * дозаказе источников, и полоса показывала бы «Превью» там, где превью уже нет.
 */
function wizardStepOf(tab: DirectionTabProps): WizardStep {
  if (tab.pendingStep && tab.stepBuildStatus === "succeeded") return 3;
  const hasSources = (tab.stepSources?.length ?? 0) > 0;
  if (hasSources && !tab.stepNeedsFreshSources) return 2;
  return 1;
}

// ─────────────────────────────────────────────────
// PanelBuildView — мастер построения шага.
// Экран 1 — направление, дальше существующий DirectionContent.
// ─────────────────────────────────────────────────
const PanelBuildView: FC<{
  productName: string;
  downTab: DirectionTabProps;
  upTab: DirectionTabProps;
  onBack?: () => void;
}> = ({ productName, downTab, upTab, onBack }) => {
  const [dir, setDir] = useState<BuildDirection | null>(null);
  const tab = dir === "up" ? upTab : downTab;

  // Мастер описывает построение ПО ШАГАМ: «Построение → Источники → Превью»
  // — это его стадии. Режим «вся цепочка» идёт одним запросом, превью у него
  // нет, и полоса шагов к нему не относится — тогда её не показываем вовсе.
  const byStep = tab.buildMode !== "whole";

  // Пока направление не выбрано, мастер стоит на первом шаге независимо от
  // того, что лежит в направлениях: выбирать ещё нечего.
  const step: WizardStep = dir === null ? 1 : wizardStepOf(tab);
  const searching = tab.stepSourcesStatus === "loading";

  // Возврат на первый экран по номеру «1» в полосе шагов. Отдельным признаком,
  // а не вычислением: найденные источники никуда не делись, и выводить из них
  // «мы снова на первом шаге» было бы неправдой.
  const [backToIntro, setBackToIntro] = useState(false);

  // Первый экран держим, пока направление не выбрано и пока по нему ничего не
  // нашли. В режиме «вся цепочка» шагов нет — там сразу отдаём прежний вид.
  const showIntro = dir === null || backToIntro || (byStep && step === 1);
  // Источники уже есть — значит, с первого экрана не ищут заново, а просто
  // возвращаются к ним. Искать по кнопке «назад» было бы потерей найденного.
  const hasSources = (tab.stepSources?.length ?? 0) > 0 && !tab.stepNeedsFreshSources;
  const introGoesForward = backToIntro && hasSources;

  const chooseDirection = (value: BuildDirection) => {
    setDir(value);
    setBackToIntro(false);
    // Режим хранится на пару «узел + направление», и у только что выбранного
    // направления он пуст. Ставим «по шагам» сами: мастер ведёт именно по
    // ним, а пустой режим означал бы, что второй экран встретит вопросом о
    // режиме вместо найденных источников.
    const next = value === "up" ? upTab : downTab;
    if (!next.buildMode) next.onChangeBuildMode?.("step");
  };

  const DIRECTIONS = [
    {
      value: "up" as const,
      name: "Построить вверх",
      hint: "Найти, из чего производится текущий продукт",
      icon: <ArrowUpIcon size={20} />,
    },
    {
      value: "down" as const,
      name: "Построить вниз",
      hint: "Найти, что получается из текущего продукта",
      icon: <ArrowDownIcon size={20} />,
    },
  ];

  // Поиск с первого экрана идёт настройками по умолчанию. Тонкая настройка —
  // промпт, домены, число источников — ждёт на втором экране, у кнопки «Найти
  // источники заново»: на первом она только мешала бы выбору направления.
  const startSearch = () => {
    if (!dir) return;
    setBackToIntro(false);
    if (introGoesForward) return; // источники уже есть — просто идём дальше
    tab.onFetchStepSources?.({
      maxItems: DEFAULT_MAX_SOURCES,
      ...getAiRequestFields({ stage: "search" }),
    });
  };

  return (
    <div className={wiz.pane}>
      {byStep && (
        <StepWizardSteps
          current={showIntro ? 1 : step}
          onGoTo={(n) => setBackToIntro(n === 1)}
        />
      )}

      {showIntro ? (
        <>
          <h4 className={wiz.paneTitle}>Направление построения</h4>
          <div className={wiz.dirRow}>
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`${wiz.dir} ${dir === d.value ? wiz.dirOn : ""}`}
                onClick={() => chooseDirection(d.value)}
              >
                <span className={wiz.dirIcon}>{d.icon}</span>
                <span className={wiz.dirText}>
                  <span className={wiz.dirName}>{d.name}</span>
                  <p className={wiz.dirHint}>{d.hint}</p>
                </span>
                <span
                  className={`${wiz.radio} ${dir === d.value ? wiz.radioOn : ""}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          {/* Режим остаётся выбираемым, но ушёл сюда, под направление: раньше
              он встречал на втором экране вместо найденных источников. По
              умолчанию — «по шагам», про который и написан мастер. */}
          {dir && (
            <div className={wiz.modeRow}>
              <span className={wiz.modeCap}>Как строим</span>
              {(
                [
                  ["step", "По шагам", "Один запрос — один шаг, с превью и откатом"],
                  ["whole", "Вся цепочка", "Один запрос — вся цепочка сразу, без превью"],
                ] as const
              ).map(([value, name, hint]) => (
                <button
                  key={value}
                  type="button"
                  className={`${wiz.mode} ${
                    (tab.buildMode ?? "step") === value ? wiz.modeOn : ""
                  }`}
                  onClick={() => tab.onChangeBuildMode?.(value)}
                  title={hint}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className={wiz.current}>
            <span className={wiz.currentIcon}>
              <FlaskIcon size={22} />
            </span>
            <span className={wiz.currentText}>
              <span className={wiz.currentCap}>Текущий продукт</span>
              <div className={wiz.currentName}>{productName || "—"}</div>
            </span>
          </div>

          <div className={wiz.next}>
            <span className={wiz.nextIcon}>
              <HelpIcon size={18} />
            </span>
            <span>
              <span className={wiz.nextTitle}>Что дальше?</span>
              <p className={wiz.nextText}>
                {dir
                  ? `Найдём источники о том, ${
                      dir === "up"
                        ? "из чего производится"
                        : "что производится из"
                    } «${productName}», и обобщим их в один шаг. Поиск идёт минутами — окно можно закрыть.`
                  : "Выберите направление — от него зависит, что мы будем искать в источниках."}
              </p>
            </span>
          </div>

          {tab.stepSourcesError && (
            <div className={wiz.error}>Ошибка: {tab.stepSourcesError}</div>
          )}

          <div className={`${wiz.footer} ${onBack ? "" : wiz.footerEnd}`}>
            {onBack && (
              <button type="button" className={wiz.secondary} onClick={onBack}>
                Отмена
              </button>
            )}
            <button
              type="button"
              className={`${wiz.primary} ${searching ? wiz.primaryBusy : ""}`}
              onClick={startSearch}
              disabled={!dir || searching}
            >
              {searching ? (
                <>
                  <span className={wiz.spinner} aria-hidden="true" />
                  Ищем источники…
                </>
              ) : (
                <>
                  {introGoesForward ? "К источникам" : "Найти источники"}
                  <ArrowDownIcon size={17} className={wiz.arrowRight} />
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* key по направлению: без него React переиспользует тот же
              экземпляр, и состояние вкладки (правленый промпт, домены,
              число источников) переезжает с «вверх» на «вниз». */}
          <DirectionContent key={dir ?? "down"} {...tab} />
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────
// FlowPanel — карточка узла.
// Внутреннее устройство карточки вынесено в NodeCard; здесь остаётся
// построение цепочки (DirectionContent / PanelBuildView), которое карточка
// открывает в модальном окне.
// ─────────────────────────────────────────────────
export const FlowPanel: FC<FlowPanelProps> = (props) => (
  <NodeCard {...props} DirectionContent={DirectionContent} PanelBuildView={PanelBuildView} />
);
