import { useCallback, useRef, useState } from "react";

import type { FocusScope } from "../../utils/focusSubgraph";
import { useDismiss } from "../../hooks/useDismiss";
import {
  BranchIcon,
  ChevronDownIcon,
  FilterIcon,
  FocusIcon,
  IndustryDataIcon,
} from "../icons";
import { GraphNameMenu } from "./GraphNameMenu";
import styles from "./GraphToolbar.module.css";

const SCOPE_OPTIONS: Array<{ value: FocusScope; label: string; hint: string }> = [
  { value: "steps", label: "Шаги", hint: "Окрестность узла на 1–3 шага в обе стороны" },
  { value: "chain", label: "Вся цепочка", hint: "Все предки и потомки узла целиком" },
  { value: "chain-up", label: "Только вверх", hint: "Все входящие связи до конца" },
  { value: "chain-down", label: "Только вниз", hint: "Все исходящие связи до конца" },
];

const DEPTH_OPTIONS = [1, 2, 3];

export interface GraphToolbarProps {
  graphName: string;

  productsOnly: boolean;
  onToggleProductsOnly: () => void;

  focusOn: boolean;
  onToggleFocus: () => void;
  focusScope: FocusScope;
  onFocusScopeChange: (scope: FocusScope) => void;
  focusDepth: number;
  onFocusDepthChange: (depth: number) => void;

  industryData: boolean;
  onToggleIndustryData: () => void;

  alternatives: boolean;
  onToggleAlternatives: () => void;
}

/**
 * Панель над холстом: название графа и переключатели представления.
 * Заменила вертикальную панель Controls из React Flow — там эти же режимы
 * были безымянными иконками. Действия над самим графом (сохранение,
 * очистка) живут в правом рельсе.
 */
export const GraphToolbar = ({
  graphName,
  productsOnly,
  onToggleProductsOnly,
  focusOn,
  onToggleFocus,
  focusScope,
  onFocusScopeChange,
  focusDepth,
  onFocusDepthChange,
  industryData,
  onToggleIndustryData,
  alternatives,
  onToggleAlternatives,
}: GraphToolbarProps) => {
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const closeFocusMenu = useCallback(() => setFocusMenuOpen(false), []);
  useDismiss(focusRef, closeFocusMenu, focusMenuOpen);

  return (
    <div className={styles.bar}>
      <GraphNameMenu name={graphName} />

      {/* В фокус-режиме окрестность строит своя проекция — «только продукты»
          там неприменимо, поэтому кнопку убираем совсем. */}
      {!focusOn && (
        <button
          type="button"
          className={`${styles.chip} ${productsOnly ? styles.chipActive : ""}`}
          onClick={onToggleProductsOnly}
          aria-pressed={productsOnly}
          title="Скрыть преобразования и соединить продукты напрямую"
        >
          <FilterIcon size={16} className={styles.chipIcon} />
          Только продукты
        </button>
      )}

      {/* Фокус-режим: сама кнопка включает режим, стрелка открывает
          настройки охвата — раньше они жили в плашке поверх полотна. */}
      <div className={styles.focusGroup} ref={focusRef}>
        <button
          type="button"
          className={`${styles.chip} ${styles.chipSplit} ${
            focusOn ? styles.chipActive : ""
          }`}
          onClick={onToggleFocus}
          aria-pressed={focusOn}
          title="Показать только окрестность выбранного узла"
        >
          <FocusIcon size={16} className={styles.chipIcon} />
          Фокус
        </button>
        <button
          type="button"
          className={`${styles.chipCaret} ${focusOn ? styles.chipActive : ""} ${
            focusMenuOpen ? styles.chipCaretOpen : ""
          }`}
          onClick={() => setFocusMenuOpen((v) => !v)}
          aria-label="Настройки фокус-режима"
          aria-expanded={focusMenuOpen}
        >
          <ChevronDownIcon size={14} />
        </button>

        {focusMenuOpen && (
          <div className={styles.focusMenu}>
            <div className={styles.focusMenuHead}>Что показывать вокруг узла</div>
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.focusOption} ${
                  focusScope === opt.value ? styles.focusOptionActive : ""
                }`}
                onClick={() => onFocusScopeChange(opt.value)}
              >
                <span className={styles.focusOptionLabel}>{opt.label}</span>
                <span className={styles.focusOptionHint}>{opt.hint}</span>
              </button>
            ))}

            {focusScope === "steps" && (
              <div className={styles.depthRow}>
                <span className={styles.depthLabel}>Глубина</span>
                <div className={styles.depthButtons}>
                  {DEPTH_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.depthButton} ${
                        d === focusDepth ? styles.depthButtonActive : ""
                      }`}
                      onClick={() => onFocusDepthChange(d)}
                      aria-pressed={d === focusDepth}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`${styles.chip} ${industryData ? styles.chipActive : ""}`}
        onClick={onToggleIndustryData}
        aria-pressed={industryData}
        title="Показать на продуктах данные ГИСП: число найденных производителей"
      >
        <IndustryDataIcon size={16} className={styles.chipIcon} />
        Промышленные данные
        <span
          className={`${styles.switch} ${industryData ? styles.switchOn : ""}`}
          aria-hidden
        >
          <span className={styles.switchKnob} />
        </span>
      </button>

      <button
        type="button"
        className={`${styles.chip} ${alternatives ? styles.chipActive : ""}`}
        onClick={onToggleAlternatives}
        aria-pressed={alternatives}
        title="Показать альтернативные пути получения продуктов"
      >
        <BranchIcon size={16} className={styles.chipIcon} />
        Альтернативы
        <span
          className={`${styles.switch} ${alternatives ? styles.switchOn : ""}`}
          aria-hidden
        >
          <span className={styles.switchKnob} />
        </span>
      </button>

    </div>
  );
};
