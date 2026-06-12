import { useMemo, useState, type FC } from "react";
import type { DirectionTabProps } from "./types";
import { StepPreviewModal } from "./StepPreviewModal";
import { getDefaultStepSourcesPrompt } from "../../prompts/sourcesPrompt";
import {
  getDefaultStepAggregateFullPrompt,
  splitStepAggregatePrompt,
} from "../../prompts/aggregatePrompt";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import styles from "./FlowPanel.module.css";

type StepByStepContentProps = Pick<
  DirectionTabProps,
  | "direction"
  | "stepChainStatus"
  | "stepChainError"
  | "stepChainStepCount"
  | "stepChainCurrentProductLabel"
  | "stepChainInsufficientProducts"
  | "onUndoStep"
  | "stepSources"
  | "stepSourcesStatus"
  | "stepSourcesError"
  | "stepSourcesOrigin"
  | "stepSourcesExhausted"
  | "stepNeedsFreshSources"
  | "onForceStepPreview"
  | "stepAggregatedText"
  | "stepAggregateStatus"
  | "stepAggregateError"
  | "stepNeedsSources"
  | "stepInsufficientProducts"
  | "stepBuildResult"
  | "stepBuildStatus"
  | "stepBuildError"
  | "pendingStep"
  | "onFetchStepSources"
  | "onAggregateStepSources"
  | "onBuildStep"
  | "onBuildFromInherited"
  | "onClearStepState"
  | "onAcceptStep"
  | "onRejectStep"
  | "onRetryStep"
  | "isAlternativeNode"
  | "altDescription"
>;

export const StepByStepContent: FC<StepByStepContentProps> = ({
  direction,
  stepChainStatus,
  stepChainError,
  stepChainStepCount = 0,
  stepChainCurrentProductLabel,
  stepChainInsufficientProducts,
  onUndoStep,

  stepSources = [],
  stepSourcesStatus = "idle",
  stepSourcesError,
  stepSourcesOrigin,
  stepSourcesExhausted = false,
  stepNeedsFreshSources = null,
  stepAggregatedText,
  stepAggregateStatus = "idle",
  stepAggregateError,
  stepNeedsSources = false,
  stepInsufficientProducts,
  stepBuildStatus = "idle",
  stepBuildError,
  pendingStep,

  onFetchStepSources,
  onAggregateStepSources,
  onBuildStep,
  onBuildFromInherited,
  onClearStepState,
  onForceStepPreview,
  onAcceptStep,
  onRejectStep,
  onRetryStep,

  isAlternativeNode = false,
  altDescription,
}) => {
  const productName = stepChainCurrentProductLabel || "";
  const hasSources = stepSources.length > 0;
  const isBorrowedSources = !!stepSourcesOrigin;
  const sourcesLoading = stepSourcesStatus === "loading";
  const aggregateLoading = stepAggregateStatus === "loading";
  const buildLoading = stepBuildStatus === "loading";
  const hasValidAggregate = !!stepAggregatedText && !stepNeedsSources;
  const hasSteps = stepChainStepCount > 0;
  const buildNeedsSources = stepChainStatus === "needs-sources";
  const showPreview =
    !!pendingStep && stepBuildStatus === "succeeded" && !buildNeedsSources;

  // ── Sources prompt state ──
  const [maxItems, setMaxItems] = useState(5);
  const [srcPromptOpen, setSrcPromptOpen] = useState(false);
  const [manualSrcPrompt, setManualSrcPrompt] = useState<string | null>(null);

  const autoSrcPrompt = useMemo(
    () => getDefaultStepSourcesPrompt(direction, productName, maxItems),
    [direction, productName, maxItems],
  );
  const displayedSrcPrompt = manualSrcPrompt ?? autoSrcPrompt;
  const isSrcPromptDirty = manualSrcPrompt !== null;
  const isSrcPromptEmpty = displayedSrcPrompt.trim() === "";

  // ── Aggregate prompt state ──
  const [aggPromptOpen, setAggPromptOpen] = useState(false);
  const [manualAggPrompt, setManualAggPrompt] = useState<string | null>(null);

  const autoAggPrompt = useMemo(
    () => getDefaultStepAggregateFullPrompt(direction, productName),
    [direction, productName],
  );
  const displayedAggPrompt = manualAggPrompt ?? autoAggPrompt;
  const isAggPromptDirty = manualAggPrompt !== null;
  const isAggPromptEmpty = displayedAggPrompt.trim() === "";

  // ── Build prompt state ──
  const [buildPromptOpen, setBuildPromptOpen] = useState(false);
  const [manualBuildPrompt, setManualBuildPrompt] = useState<string | null>(
    null,
  );

  const autoBuildPrompt = useMemo(
    () => getDefaultChainSystemPrompt(productName),
    [productName],
  );
  const displayedBuildPrompt = manualBuildPrompt ?? autoBuildPrompt;
  const isBuildPromptDirty = manualBuildPrompt !== null;
  const isBuildPromptEmpty = displayedBuildPrompt.trim() === "";

  // ── Handlers with prompt support ──
  const handleFetchSources = () => {
    onFetchStepSources?.({
      maxItems,
      customSystemPrompt: isSrcPromptDirty ? displayedSrcPrompt : undefined,
    });
  };

  const handleAggregate = () => {
    if (isAggPromptDirty) {
      const { system, user } = splitStepAggregatePrompt(displayedAggPrompt);
      onAggregateStepSources?.(system, user);
    } else {
      onAggregateStepSources?.();
    }
  };

  const handleBuild = (customText?: string) => {
    onBuildStep?.(
      customText,
      isBuildPromptDirty ? displayedBuildPrompt : undefined,
    );
  };

  // ── Alternative node: simplified flow ──
  if (isAlternativeNode) {
    return (
      <div className={styles.formGroup}>
        <div className={styles.sourcesTitle}>
          Альтернатива для: <b>{productName || "—"}</b>
        </div>
        <div className={styles.sourcesTitle}>
          Шагов выполнено: <b>{stepChainStepCount}</b>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Описание альтернативы:</label>
          <textarea
            readOnly
            value={altDescription ?? ""}
            className={styles.directionTextarea}
            rows={6}
          />
        </div>

        {/* Build prompt editor */}
        <button
          type="button"
          onClick={() => setBuildPromptOpen((v) => !v)}
          className={styles.promptToggle}
        >
          {buildPromptOpen
            ? "Скрыть промпт построения"
            : "Редактировать промпт построения"}
        </button>

        {buildPromptOpen && (
          <div className={styles.promptEditor}>
            <label className={styles.promptLabel}>
              Системный промпт построения шага:
            </label>
            <textarea
              value={displayedBuildPrompt}
              onChange={(e) => setManualBuildPrompt(e.target.value)}
              className={styles.promptTextarea}
              rows={12}
            />
            {isBuildPromptDirty && (
              <button
                type="button"
                className={styles.promptResetBtn}
                onClick={() => setManualBuildPrompt(null)}
              >
                Сбросить промпт
              </button>
            )}
            {isBuildPromptEmpty && (
              <div className={styles.errorText}>
                Промпт не может быть пустым
              </div>
            )}
          </div>
        )}

        {buildLoading && (
          <div className={styles.tabLoader}>
            <div className={styles.tabSpinner} />
            <span>Построение альтернативы...</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => handleBuild(altDescription)}
          disabled={buildLoading || isBuildPromptEmpty}
          className={styles.findSourcesButton}
        >
          {buildLoading
            ? "Построение..."
            : isBuildPromptDirty
              ? "Построить альтернативу (свой промпт)"
              : "Построить альтернативу"}
        </button>

        {stepBuildError && (
          <div className={styles.errorText}>Ошибка: {stepBuildError}</div>
        )}

        {buildNeedsSources &&
          stepChainInsufficientProducts &&
          stepChainInsufficientProducts.length > 0 && (
            <div className={styles.warningText}>
              Нужны дополнительные источники
              {` для: ${stepChainInsufficientProducts.join(", ")}`}. Откройте
              панель этих продуктов и выполните поиск источников.
            </div>
          )}

        {stepChainError && (
          <div className={styles.errorText}>Ошибка: {stepChainError}</div>
        )}

        {showPreview && pendingStep && (
          <StepPreviewModal
            step={pendingStep}
            anchorProductName={productName}
            stepNumber={stepChainStepCount + 1}
            onAccept={(filteredStep) => onAcceptStep?.(undefined, filteredStep)}
            onRetry={() => onRetryStep?.()}
            onReject={() => onRejectStep?.()}
          />
        )}
      </div>
    );
  }

  // ── Regular product node: standard flow ──
  return (
    <div className={styles.formGroup}>
      <div className={styles.sourcesTitle}>
        Текущий продукт: <b>{productName || "—"}</b>
      </div>
      <div className={styles.sourcesTitle}>
        Шагов выполнено: <b>{stepChainStepCount}</b>
      </div>

      {/* Маркер с build родителя: этому продукту нужны свежие источники */}
      {stepNeedsFreshSources && (
        <div className={styles.warningText}>
          По результатам построения шага от «{stepNeedsFreshSources.fromProduct}
          » источников для «{productName}» не хватает — найдите свежие источники.
        </div>
      )}

      {/* Stage 1: fetch sources button (when no sources yet) */}
      {!hasSources && (
        <>
          {stepSourcesExhausted && (
            <div className={styles.warningText}>
              Источники для «{productName}» закончились — поиск не дал
              результатов. Можно попробовать ещё раз, изменить промпт поиска или
              строить шаг в другом направлении.
            </div>
          )}
          <div className={styles.maxItemsRow}>
            <label className={styles.formLabel}>Количество источников:</label>
            <input
              type="number"
              min={2}
              max={5}
              value={maxItems}
              onChange={(e) =>
                setMaxItems(
                  Math.min(5, Math.max(2, Number(e.target.value) || 2)),
                )
              }
              className={styles.maxItemsInput}
            />
          </div>

          {/* Sources prompt editor */}
          <button
            type="button"
            onClick={() => setSrcPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {srcPromptOpen
              ? "Скрыть промпт поиска"
              : "Редактировать промпт поиска"}
          </button>

          {srcPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>
                Промпт поиска источников:
              </label>
              <textarea
                value={displayedSrcPrompt}
                onChange={(e) => setManualSrcPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isSrcPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualSrcPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}
              {isSrcPromptEmpty && (
                <div className={styles.errorText}>
                  Промпт не может быть пустым
                </div>
              )}
            </div>
          )}

          {sourcesLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>
                Поиск источников для «{productName}»… Может занять несколько
                минут — не перезагружайте страницу.
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleFetchSources}
            disabled={sourcesLoading || isSrcPromptEmpty}
            className={styles.findSourcesButton}
          >
            {sourcesLoading
              ? "Поиск..."
              : isSrcPromptDirty
                ? "Найти источники (свой промпт)"
                : stepNeedsFreshSources
                  ? "Найти свежие источники"
                  : "Найти источники (шаг)"}
          </button>
          {stepSourcesError && (
            <div className={styles.errorText}>Ошибка: {stepSourcesError}</div>
          )}
        </>
      )}

      {/* Достаточный ребёнок: источники унаследованы у родителя → одной кнопкой
          обобщаем и сразу строим (без ручного поиска/обобщения). */}
      {hasSources &&
        !hasValidAggregate &&
        !stepNeedsSources &&
        isBorrowedSources && (
          <>
            <div className={styles.sourcesTitle}>
              Источники унаследованы у «{stepSourcesOrigin}» — обобщение и
              построение одной кнопкой.
            </div>
            {(aggregateLoading || buildLoading) && (
              <div className={styles.tabLoader}>
                <div className={styles.tabSpinner} />
                <span>
                  {aggregateLoading ? "Обобщение..." : "Построение шага..."}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onBuildFromInherited?.()}
              disabled={aggregateLoading || buildLoading}
              className={styles.findSourcesButton}
            >
              Построить шаг
            </button>
            <button
              type="button"
              onClick={handleFetchSources}
              disabled={sourcesLoading}
              className={styles.findSourcesButton}
              style={{ marginTop: 4 }}
            >
              {sourcesLoading ? "Поиск..." : "Найти свои источники заново"}
            </button>
          </>
        )}

      {/* Aggregate / re-fetch buttons — NATIVE sources (нашли сами): ручное обобщение */}
      {hasSources &&
        !hasValidAggregate &&
        !stepNeedsSources &&
        !isBorrowedSources && (
        <>
          {/* Aggregate prompt editor */}
          <button
            type="button"
            onClick={() => setAggPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {aggPromptOpen
              ? "Скрыть промпт обобщения"
              : "Редактировать промпт обобщения"}
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

          {aggregateLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>Обобщение одного шага...</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleAggregate}
            disabled={
              aggregateLoading || stepSources.length < 1 || isAggPromptEmpty
            }
            className={styles.findSourcesButton}
          >
            {aggregateLoading
              ? "Обобщение..."
              : isAggPromptDirty
                ? "Обобщить (свой промпт)"
                : "Обобщить (один шаг)"}
          </button>
          <button
            type="button"
            onClick={handleFetchSources}
            disabled={sourcesLoading || aggregateLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 4 }}
          >
            {sourcesLoading ? "Поиск..." : "Найти источники заново"}
          </button>
          {stepAggregateError && (
            <div className={styles.errorText}>Ошибка: {stepAggregateError}</div>
          )}
        </>
      )}

      {/* Stage: needs more sources */}
      {stepNeedsSources && (
        <>
          {stepInsufficientProducts && stepInsufficientProducts.length > 0 ? (
            <div className={styles.warningText}>
              Источников для «{stepInsufficientProducts.join(", ")}» не хватило,
              чтобы построить новый шаг — нужно добрать свежие источники (кнопка
              ниже).
            </div>
          ) : (
            <div className={styles.warningText}>
              Модель не собрала шаг из текущих источников и не указала, каким
              продуктам их не хватает.{" "}
              {stepSourcesExhausted
                ? "Новых источников найти не удалось — попробуйте изменить промпт обобщения или строить в другом направлении."
                : "Попробуйте добор источников или измените промпт обобщения."}
            </div>
          )}
          <button
            type="button"
            onClick={handleFetchSources}
            disabled={sourcesLoading}
            className={styles.findSourcesButton}
          >
            {sourcesLoading
              ? "Поиск..."
              : `Найти источники заново для «${productName}»`}
          </button>
        </>
      )}

      {/* Stage: aggregated ready → build */}
      {hasValidAggregate && (
        <>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Обобщённое описание шага:
            </label>
            <textarea
              readOnly
              value={stepAggregatedText ?? ""}
              className={styles.directionTextarea}
              rows={6}
            />
          </div>

          {/* Build prompt editor */}
          <button
            type="button"
            onClick={() => setBuildPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {buildPromptOpen
              ? "Скрыть промпт построения"
              : "Редактировать промпт построения"}
          </button>

          {buildPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>
                Системный промпт построения шага:
              </label>
              <textarea
                value={displayedBuildPrompt}
                onChange={(e) => setManualBuildPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={12}
              />
              {isBuildPromptDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={() => setManualBuildPrompt(null)}
                >
                  Сбросить промпт
                </button>
              )}
              {isBuildPromptEmpty && (
                <div className={styles.errorText}>
                  Промпт не может быть пустым
                </div>
              )}
            </div>
          )}

          {buildLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>Построение шага...</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => handleBuild()}
            disabled={buildLoading || isBuildPromptEmpty}
            className={styles.findSourcesButton}
          >
            {buildLoading
              ? "Построение..."
              : isBuildPromptDirty
                ? "Построить шаг (свой промпт)"
                : "Построить шаг"}
          </button>
          <button
            type="button"
            onClick={handleAggregate}
            disabled={aggregateLoading || buildLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 4 }}
          >
            Переобобщить (свежий шаг)
          </button>
          <button
            type="button"
            onClick={handleFetchSources}
            disabled={sourcesLoading || aggregateLoading || buildLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 4 }}
          >
            {sourcesLoading ? "Поиск..." : "Найти источники заново"}
          </button>
          {stepBuildError && (
            <div className={styles.errorText}>Ошибка: {stepBuildError}</div>
          )}
        </>
      )}

      {/* Build returned "insufficient sources" for new products */}
      {buildNeedsSources &&
        stepChainInsufficientProducts &&
        stepChainInsufficientProducts.length > 0 && (
          <>
            <div className={styles.warningText}>
              Источников не хватило для нового шага
              {` (${stepChainInsufficientProducts.join(", ")})`}. Добери свежие
              источники — либо, если это конечный продукт, построй шаг всё равно.
            </div>
            <button
              type="button"
              onClick={handleFetchSources}
              disabled={sourcesLoading}
              className={styles.findSourcesButton}
            >
              {sourcesLoading
                ? "Поиск..."
                : `Найти свежие источники для «${productName}»`}
            </button>
            {pendingStep && (
              <button
                type="button"
                onClick={() => onForceStepPreview?.()}
                className={styles.findSourcesButton}
                style={{ marginTop: 4 }}
              >
                Построить шаг всё равно
              </button>
            )}
          </>
        )}

      {/* Sources list — always visible BELOW description when any sources exist */}
      {hasSources && (
        <div className={styles.sourcesBox}>
          <div className={styles.sourcesTitle}>
            Источники ({stepSources.length})
          </div>
          {isBorrowedSources && (
            <div className={styles.warningText}>
              Источники взяты у «{stepSourcesOrigin}».
            </div>
          )}
          {stepSourcesExhausted && (
            <div className={styles.warningText}>
              Источники закончились — повторный поиск не дал новых сверх уже
              найденных.
            </div>
          )}
          {stepSources.map((s) => (
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

      {/* Reset */}
      {(hasSources || hasValidAggregate) && (
        <button
          type="button"
          onClick={onClearStepState}
          disabled={sourcesLoading || aggregateLoading || buildLoading}
          className={styles.findSourcesButton}
          style={{ marginTop: 8 }}
        >
          Сбросить и начать шаг заново
        </button>
      )}

      {hasSteps && (
        <button
          type="button"
          onClick={onUndoStep}
          className={styles.findSourcesButton}
          style={{ marginTop: 8 }}
        >
          Отменить последний шаг
        </button>
      )}

      {stepChainError && (
        <div className={styles.errorText}>Ошибка: {stepChainError}</div>
      )}

      {showPreview && pendingStep && (
        <StepPreviewModal
          step={pendingStep}
          anchorProductName={productName}
          stepNumber={stepChainStepCount + 1}
          onAccept={(filteredStep) => onAcceptStep?.(undefined, filteredStep)}
          onRetry={() => onRetryStep?.()}
          onReject={() => onRejectStep?.()}
        />
      )}
    </div>
  );
};
