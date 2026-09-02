// src/components/flow-panel/TechDescriptionTab.tsx
//
// Вкладка «Технологическое описание» в карточке преобразования: краткое
// описание ОДНОГО продуктового шага (существующий продукт ↔ дополнительный)
// с запросом на сервер, редактированием промпта и выбором модели.
//
// Переменные промпта (<<<DIRECTION>>>, <<<CURRENT_PRODUCT>>> и т.д.)
// подставляет сервер, поэтому здесь они живут отдельными полями: правка
// шаблона не ломает подстановку.

import { useEffect, useMemo, useState, type FC } from "react";
import type { BuildDirection } from "../../store/types";
import type { TechDescriptionContext } from "../../utils/buildTechDescriptionContext";
import {
  getDefaultTechDescriptionPrompt,
  techDirectionLabel,
} from "../../prompts/techDescriptionPrompt";
import { AiModelSelect } from "../ai-model-select";
import { MarkdownEditor } from "../markdown-editor";

import styles from "./FlowPanel.module.css";

export interface TechDescriptionRequest {
  direction: BuildDirection;
  currentProduct: string;
  additionalProduct: string;
  existingChain: string;
  processDescription: string;
  /** Только если промпт отредактирован — иначе сервер берёт свой дефолт. */
  customPrompt?: string;
}

export interface TechDescriptionTabProps {
  /** Переменные промпта из графа; direction — выбранное направление шага. */
  getContext: (direction?: BuildDirection) => TechDescriptionContext | null;
  /** Готовые описания по направлениям (правятся вручную): у «вверх» и «вниз»
   *  разные продукты, поэтому и описание у каждой вкладки своё. */
  valueByDirection?: Partial<Record<BuildDirection, string>>;
  onCommit: (text: string, direction: BuildDirection) => void;
  onRequest: (req: TechDescriptionRequest) => void;
  statusByDirection?: Partial<
    Record<BuildDirection, "idle" | "loading" | "succeeded" | "failed">
  >;
  errorByDirection?: Partial<Record<BuildDirection, string | null>>;
  readOnly?: boolean;
}

export const TechDescriptionTab: FC<TechDescriptionTabProps> = ({
  getContext,
  valueByDirection,
  onCommit,
  onRequest,
  statusByDirection,
  errorByDirection,
  readOnly = false,
}) => {
  // Направление шага из графа — дефолт переключателя ВНИЗ/ВВЕРХ.
  const baseContext = useMemo(() => getContext(), [getContext]);
  const [dirOverride, setDirOverride] = useState<BuildDirection | null>(null);
  const direction: BuildDirection =
    dirOverride ?? baseContext?.direction ?? "down";

  const context = useMemo(
    () => getContext(direction),
    [getContext, direction],
  );

  // Значения полей: null = «как в графе», строка = ручная правка.
  const [manualCurrent, setManualCurrent] = useState<string | null>(null);
  const [manualAdditional, setManualAdditional] = useState<string | null>(null);
  const [manualChain, setManualChain] = useState<string | null>(null);
  const [manualProcess, setManualProcess] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);

  const [inputsOpen, setInputsOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  // Смена направления меняет роли продуктов (вниз: существующий — вход;
  // вверх: существующий — выход), поэтому ручной выбор продуктов сбрасываем.
  useEffect(() => {
    setManualCurrent(null);
    setManualAdditional(null);
  }, [direction]);

  // Описание, статус и ошибка — своего направления.
  const value = valueByDirection?.[direction] ?? "";
  const status = statusByDirection?.[direction] ?? "idle";
  const error = errorByDirection?.[direction] ?? null;

  // Правка описания живёт локально до потери фокуса — как поле «Описание».
  // Смена направления меняет value, и текст перечитывается из своего поля.
  const [localText, setLocalText] = useState(value);
  useEffect(() => {
    setLocalText(value);
  }, [value]);

  const currentProduct = manualCurrent ?? context?.currentProduct ?? "";
  const additionalProduct = manualAdditional ?? context?.additionalProduct ?? "";
  const existingChain = manualChain ?? context?.existingChain ?? "";
  const processDescription = manualProcess ?? context?.processDescription ?? "";

  const autoPrompt = useMemo(() => getDefaultTechDescriptionPrompt(), []);
  const displayedPrompt = manualPrompt ?? autoPrompt;
  const isPromptDirty = manualPrompt !== null;
  const isPromptEmpty = displayedPrompt.trim() === "";

  // Варианты для селектов: все продукты вокруг преобразования, чтобы можно было
  // выбрать нужную пару, если у шага несколько входов или выходов.
  const productOptions = useMemo(() => {
    const all = [
      ...(context?.inputProducts ?? []),
      ...(context?.outputProducts ?? []),
    ];
    return Array.from(new Set(all.filter(Boolean)));
  }, [context]);

  const loading = status === "loading";
  const canRequest =
    !readOnly &&
    !loading &&
    !isPromptEmpty &&
    !!currentProduct.trim() &&
    !!additionalProduct.trim();

  const handleRequest = () => {
    if (!canRequest) return;
    onRequest({
      direction,
      currentProduct: currentProduct.trim(),
      additionalProduct: additionalProduct.trim(),
      existingChain,
      processDescription,
      ...(isPromptDirty ? { customPrompt: displayedPrompt } : {}),
    });
  };

  const resetInputs = () => {
    setManualCurrent(null);
    setManualAdditional(null);
    setManualChain(null);
    setManualProcess(null);
  };

  const inputsDirty =
    manualCurrent !== null ||
    manualAdditional !== null ||
    manualChain !== null ||
    manualProcess !== null;

  return (
    <div className={styles.techTab}>
      {/* ── Направление шага ── */}
      <div className={styles.modeToggleRow}>
        <button
          type="button"
          className={`${styles.modeToggleBtn} ${direction === "down" ? styles.modeToggleBtnActive : ""}`}
          onClick={() => setDirOverride("down")}
          disabled={readOnly}
          title="Существующий продукт — сырьё, дополнительный — выход переработки"
        >
          ВНИЗ
        </button>
        <button
          type="button"
          className={`${styles.modeToggleBtn} ${direction === "up" ? styles.modeToggleBtnActive : ""}`}
          onClick={() => setDirOverride("up")}
          disabled={readOnly}
          title="Дополнительный продукт — сырьё, из которого получают существующий"
        >
          ВВЕРХ
        </button>
      </div>

      <div className={styles.techHint}>
        {/* Вкладка берёт продукты своей стороны: ВНИЗ — выходы (ниже),
            ВВЕРХ — входы (выше). Подсказка описывает именно эти роли. */}
        {direction === "down"
          ? "ВНИЗ: «{current}» получают из «{additional}»."
              .replace("{current}", currentProduct || "—")
              .replace("{additional}", additionalProduct || "—")
          : "ВВЕРХ: «{current}» — входное сырьё, из которого получают «{additional}»."
              .replace("{current}", currentProduct || "—")
              .replace("{additional}", additionalProduct || "—")}
      </div>

      {/* ── Результат ── */}
      <label className={styles.formLabel}>
        Технологическое описание ({techDirectionLabel(direction)}):
      </label>
      <MarkdownEditor
        value={localText}
        onChange={(text) => {
          setLocalText(text);
          if (text !== value) onCommit(text, direction);
        }}
        rows={10}
        readOnly={readOnly}
        placeholder="Описание шага появится здесь после запроса — его можно отредактировать вручную"
      />

      {loading && (
        <div className={styles.tabLoader}>
          <div className={styles.tabSpinner} />
          <span>Составляю технологическое описание...</span>
        </div>
      )}

      {status === "failed" && error && (
        <div className={styles.errorText}>Ошибка: {error}</div>
      )}

      {!readOnly && (
        <>
          {/* ── Данные запроса (переменные промпта) ── */}
          <div className={styles.promptToggleRow}>
            <button
              type="button"
              className={styles.promptToggle}
              onClick={() => setInputsOpen((v) => !v)}
            >
              {inputsOpen ? "Скрыть данные запроса" : "Данные запроса"}
            </button>
            <button
              type="button"
              className={styles.promptToggle}
              onClick={() => setPromptOpen((v) => !v)}
            >
              {promptOpen ? "Скрыть промпт" : "Редактировать промпт"}
            </button>
          </div>

          {inputsOpen && (
            <div className={styles.promptEditor}>
              <label className={styles.promptLabel}>
                Существующий продукт (&lt;&lt;&lt;CURRENT_PRODUCT&gt;&gt;&gt;):
              </label>
              <ProductField
                value={currentProduct}
                options={productOptions}
                onChange={setManualCurrent}
              />

              <label className={styles.promptLabel}>
                Дополнительный продукт
                (&lt;&lt;&lt;ADDITIONAL_PRODUCT&gt;&gt;&gt;):
              </label>
              <ProductField
                value={additionalProduct}
                options={productOptions}
                onChange={setManualAdditional}
              />

              <label className={styles.promptLabel}>
                Существующая цепочка (&lt;&lt;&lt;EXISTING_CHAIN&gt;&gt;&gt;):
              </label>
              <textarea
                value={existingChain}
                onChange={(e) => setManualChain(e.target.value)}
                className={styles.promptTextarea}
                rows={5}
              />

              <label className={styles.promptLabel}>
                Сведения о технологии
                (&lt;&lt;&lt;PROCESS_DESCRIPTION&gt;&gt;&gt;):
              </label>
              <textarea
                value={processDescription}
                onChange={(e) => setManualProcess(e.target.value)}
                className={styles.promptTextarea}
                rows={8}
              />

              {inputsDirty && (
                <button
                  type="button"
                  className={styles.promptResetBtn}
                  onClick={resetInputs}
                >
                  Подставить заново из графа
                </button>
              )}
            </div>
          )}

          {promptOpen && (
            <div className={styles.promptEditor}>
              <AiModelSelect stage="card" />
              <label className={styles.promptLabel}>
                Промпт технологического описания:
              </label>
              <div className={styles.techHint}>
                Плейсхолдеры &lt;&lt;&lt;DIRECTION&gt;&gt;&gt;,
                &lt;&lt;&lt;CURRENT_PRODUCT&gt;&gt;&gt;,
                &lt;&lt;&lt;ADDITIONAL_PRODUCT&gt;&gt;&gt;,
                &lt;&lt;&lt;EXISTING_CHAIN&gt;&gt;&gt;,
                &lt;&lt;&lt;PROCESS_DESCRIPTION&gt;&gt;&gt; заполняются
                значениями из «Данных запроса» — оставьте их в тексте.
              </div>
              <textarea
                value={displayedPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={14}
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
              {isPromptEmpty && (
                <div className={styles.errorText}>
                  Промпт не может быть пустым
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleRequest}
            disabled={!canRequest}
            className={styles.findSourcesButton}
            title={
              !currentProduct.trim() || !additionalProduct.trim()
                ? "Нужны существующий и дополнительный продукты — задайте их в «Данных запроса»"
                : ""
            }
          >
            {loading
              ? "Составляю описание..."
              : isPromptDirty
                ? "Получить описание (свой промпт)"
                : value.trim()
                  ? "Составить описание заново"
                  : "Получить технологическое описание"}
          </button>
        </>
      )}
    </div>
  );
};

/** Продукт шага: выбор из соседей преобразования или ручной ввод.
 *  Поле ввода показываем только для варианта «свой» — иначе оно дублировало бы
 *  выбранный в списке продукт. */
const ProductField: FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const isCustom = !options.includes(value);
  return (
    <>
      {options.length > 0 && (
        <select
          value={isCustom ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.formInput}
        >
          <option value="">— свой вариант —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {(isCustom || options.length === 0) && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.formInput}
          placeholder="Название продукта"
        />
      )}
    </>
  );
};
