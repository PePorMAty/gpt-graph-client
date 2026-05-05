import { useMemo, useState, useCallback, type FC } from "react";
import type { DirectionTabProps } from "./types";
import { StepPreviewModal } from "./StepPreviewModal";
import { getDefaultSourcesPrompt } from "../../prompts/sourcesPrompt";
import {
  getDefaultAggregateFullPrompt,
  splitAggregatePrompt,
} from "../../prompts/aggregatePrompt";
import { getDefaultChainSystemPrompt } from "../../prompts/chainPrompt";
import styles from "./FlowPanel.module.css";

const AI_PROVIDERS = [
  { value: "", label: "По умолчанию (сервер)" },
  { value: "openai", label: "OpenAI" },
  { value: "qwen", label: "Qwen (DashScope)" },
] as const;

const AI_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  "": [{ value: "", label: "По умолчанию" }],
  openai: [
    { value: "", label: "По умолчанию (gpt-5-mini)" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5", label: "GPT-5" },
  ],
  qwen: [
    { value: "", label: "По умолчанию (qwen-plus)" },
    { value: "qwen3-max", label: "Qwen3 Max" },
    { value: "qwen3.5-plus", label: "Qwen3.5 Plus" },
    { value: "qwen-plus", label: "Qwen Plus" },
    { value: "qwen-flash", label: "Qwen Flash" },
    { value: "qwen3-coder-plus", label: "Qwen3 Coder Plus" },
    { value: "qwen3-coder-flash", label: "Qwen3 Coder Flash" },
  ],
};

type StageAiConfig = { provider: string; model: string };
type AiConfigState = {
  sources: StageAiConfig;
  aggregate: StageAiConfig;
  build: StageAiConfig;
};

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
  onClearStepState,
  onAcceptStep,
  onRejectStep,
  onRetryStep,

  isAlternativeNode = false,
  altDescription,
}) => {
  const productName = stepChainCurrentProductLabel || "";
  const hasSources = stepSources.length > 0;
  const sourcesLoading = stepSourcesStatus === "loading";
  const aggregateLoading = stepAggregateStatus === "loading";
  const buildLoading = stepBuildStatus === "loading";
  const hasValidAggregate = !!stepAggregatedText && !stepNeedsSources;
  const hasSteps = stepChainStepCount > 0;
  const buildNeedsSources = stepChainStatus === "needs-sources";
  const showPreview = !!pendingStep && stepBuildStatus === "succeeded";

  // ── Sources prompt state ──
  const [maxItems, setMaxItems] = useState(5);
  const [srcPromptOpen, setSrcPromptOpen] = useState(false);
  const [manualSrcPrompt, setManualSrcPrompt] = useState<string | null>(null);

  const autoSrcPrompt = useMemo(
    () => getDefaultSourcesPrompt(direction, productName, maxItems),
    [direction, productName, maxItems],
  );
  const displayedSrcPrompt = manualSrcPrompt ?? autoSrcPrompt;
  const isSrcPromptDirty = manualSrcPrompt !== null;
  const isSrcPromptEmpty = displayedSrcPrompt.trim() === "";

  // ── Aggregate prompt state ──
  const [aggPromptOpen, setAggPromptOpen] = useState(false);
  const [manualAggPrompt, setManualAggPrompt] = useState<string | null>(null);

  const autoAggPrompt = useMemo(
    () => getDefaultAggregateFullPrompt(direction, productName),
    [direction, productName],
  );
  const displayedAggPrompt = manualAggPrompt ?? autoAggPrompt;
  const isAggPromptDirty = manualAggPrompt !== null;
  const isAggPromptEmpty = displayedAggPrompt.trim() === "";

  // ── Build prompt state ──
  const [buildPromptOpen, setBuildPromptOpen] = useState(false);
  const [manualBuildPrompt, setManualBuildPrompt] = useState<string | null>(null);

  const autoBuildPrompt = useMemo(
    () => getDefaultChainSystemPrompt(productName),
    [productName],
  );
  const displayedBuildPrompt = manualBuildPrompt ?? autoBuildPrompt;
  const isBuildPromptDirty = manualBuildPrompt !== null;
  const isBuildPromptEmpty = displayedBuildPrompt.trim() === "";

  // ── AI Config state ──
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfigState>({
    sources: { provider: "", model: "" },
    aggregate: { provider: "", model: "" },
    build: { provider: "", model: "" },
  });

  const updateAiConfig = useCallback(
    (stage: keyof AiConfigState, field: "provider" | "model", value: string) => {
      setAiConfig((prev) => {
        const updated = { ...prev, [stage]: { ...prev[stage], [field]: value } };
        if (field === "provider" && value !== prev[stage].provider) {
          updated[stage].model = "";
        }
        return updated;
      });
    },
    [],
  );

  // ── Handlers with prompt support ──
  const handleFetchSources = () => {
    const { provider, model } = aiConfig.sources;
    onFetchStepSources?.({
      maxItems,
      customSystemPrompt: isSrcPromptDirty ? displayedSrcPrompt : undefined,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    });
  };

  const handleAggregate = () => {
    const { provider, model } = aiConfig.aggregate;
    if (isAggPromptDirty) {
      const { system, user } = splitAggregatePrompt(displayedAggPrompt);
      onAggregateStepSources?.(system, user, provider || undefined, model || undefined);
    } else {
      onAggregateStepSources?.(undefined, undefined, provider || undefined, model || undefined);
    }
  };

  const handleBuild = (customText?: string) => {
    const { provider, model } = aiConfig.build;
    onBuildStep?.(
      customText,
      isBuildPromptDirty ? displayedBuildPrompt : undefined,
      provider || undefined,
      model || undefined,
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
          {buildPromptOpen ? "Скрыть промпт построения" : "Редактировать промпт построения"}
        </button>

        {buildPromptOpen && (
          <div className={styles.promptEditor}>
            <label className={styles.promptLabel}>Системный промпт построения шага:</label>
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
              <div className={styles.errorText}>Промпт не может быть пустым</div>
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
              {` для: ${stepChainInsufficientProducts.join(", ")}`}.
              Откройте панель этих продуктов и выполните поиск источников.
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
            onAccept={(filteredStep) =>
              onAcceptStep?.(undefined, filteredStep)
            }
            onRetry={() => onRetryStep?.()}
            onReject={() => onRejectStep?.()}
          />
        )}
      </div>
    );
  }

  // ── AI Config UI block ──
  const aiConfigBlock = (
    <>
      <button
        type="button"
        onClick={() => setAiConfigOpen((v) => !v)}
        className={styles.promptToggle}
      >
        {aiConfigOpen ? "Скрыть AI Config" : "AI Config (провайдер/модель)"}
      </button>

      {aiConfigOpen && (
        <div className={styles.aiConfigSection}>
          {(["sources", "aggregate", "build"] as const).map((stage) => {
            const stageLabel = stage === "sources" ? "Поиск" : stage === "aggregate" ? "Обобщение" : "Построение";
            const cfg = aiConfig[stage];
            const models = AI_MODELS[cfg.provider] || AI_MODELS[""];
            return (
              <div key={stage} className={styles.aiConfigRow}>
                <span className={styles.aiConfigLabel}>{stageLabel}</span>
                <select
                  value={cfg.provider}
                  onChange={(e) => updateAiConfig(stage, "provider", e.target.value)}
                  className={styles.aiConfigSelect}
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <select
                  value={cfg.model}
                  onChange={(e) => updateAiConfig(stage, "model", e.target.value)}
                  className={styles.aiConfigSelect}
                >
                  {models.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // ── Regular product node: standard flow ──
  return (
    <div className={styles.formGroup}>
      <div className={styles.sourcesTitle}>
        Текущий продукт: <b>{productName || "—"}</b>
      </div>
      <div className={styles.sourcesTitle}>
        Шагов выполнено: <b>{stepChainStepCount}</b>
      </div>

      {aiConfigBlock}

      {/* Stage 1: fetch sources button (when no sources yet) */}
      {!hasSources && (
        <>
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

          {/* Sources prompt editor */}
          <button
            type="button"
            onClick={() => setSrcPromptOpen((v) => !v)}
            className={styles.promptToggle}
          >
            {srcPromptOpen ? "Скрыть промпт поиска" : "Редактировать промпт поиска"}
          </button>

          {srcPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>Промпт поиска источников:</label>
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
                <div className={styles.errorText}>Промпт не может быть пустым</div>
              )}
            </div>
          )}

          {sourcesLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>
                Поиск источников для «{productName}»...
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
                : "Найти источники (шаг)"}
          </button>
          {stepSourcesError && (
            <div className={styles.errorText}>
              Ошибка: {stepSourcesError}
            </div>
          )}
        </>
      )}

      {/* Aggregate / re-fetch buttons — only when sources exist and aggregate not yet */}
      {hasSources && !hasValidAggregate && !stepNeedsSources && (
        <>
          {/* Aggregate prompt editor */}
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
                <div className={styles.errorText}>Промпт не может быть пустым</div>
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
            disabled={aggregateLoading || stepSources.length < 1 || isAggPromptEmpty}
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
            {sourcesLoading ? "Поиск..." : "Добрать источники"}
          </button>
          {stepAggregateError && (
            <div className={styles.errorText}>
              Ошибка: {stepAggregateError}
            </div>
          )}
        </>
      )}

      {/* Stage: needs more sources */}
      {stepNeedsSources && (
        <>
          <div className={styles.warningText}>
            Недостаточно источников
            {stepInsufficientProducts && stepInsufficientProducts.length > 0
              ? ` для: ${stepInsufficientProducts.join(", ")}`
              : ""}
            .
          </div>
          <button
            type="button"
            onClick={handleFetchSources}
            disabled={sourcesLoading}
            className={styles.findSourcesButton}
          >
            {sourcesLoading
              ? "Поиск..."
              : `Добрать источники для «${productName}»`}
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
            {buildPromptOpen ? "Скрыть промпт построения" : "Редактировать промпт построения"}
          </button>

          {buildPromptOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>Системный промпт построения шага:</label>
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
                <div className={styles.errorText}>Промпт не может быть пустым</div>
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
            {sourcesLoading ? "Поиск..." : "Добрать источники"}
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
          <div className={styles.warningText}>
            Для продолжения цепочки нужны дополнительные источники
            {` для: ${stepChainInsufficientProducts.join(", ")}`}.
            Откройте панель этих продуктов и выполните поиск источников.
          </div>
        )}

      {/* Sources list — always visible BELOW description when any sources exist */}
      {hasSources && (
        <div className={styles.sourcesBox}>
          <div className={styles.sourcesTitle}>
            Источники ({stepSources.length})
          </div>
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
          onAccept={(filteredStep) =>
            onAcceptStep?.(undefined, filteredStep)
          }
          onRetry={() => onRetryStep?.()}
          onReject={() => onRejectStep?.()}
        />
      )}
    </div>
  );
};
