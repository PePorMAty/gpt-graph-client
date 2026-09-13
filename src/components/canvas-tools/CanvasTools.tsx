import type { FC } from "react";

import {
  CursorIcon,
  HandIcon,
  MarqueeIcon,
  ResetCanvasIcon,
  SaveIcon,
  type IconProps,
} from "../icons";
import styles from "./CanvasTools.module.css";

/** Режим работы указателя на полотне. */
export type CanvasMode = "select" | "pan" | "marquee";

interface ModeItem {
  id: CanvasMode;
  Icon: FC<IconProps>;
  title: string;
}

const MODES: ModeItem[] = [
  { id: "select", Icon: CursorIcon, title: "Взаимодействие с графом" },
  { id: "pan", Icon: HandIcon, title: "Панорамирование" },
  { id: "marquee", Icon: MarqueeIcon, title: "Выделение области" },
];

interface CanvasToolsProps {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onSave: () => void;
  canSave: boolean;
  onClear: () => void;
  canClear: boolean;
  /** Подсветка кнопки сохранения после успешной записи. */
  saveFlash?: boolean;
  /** Режим просмотра: доступен только выбор режима указателя. */
  readOnly?: boolean;
}

/**
 * Правый рельс холста: режим указателя, сохранение и очистка полотна.
 * Масштаб и вписывание графа живут в нижней строке состояния, публикация по
 * ссылке — в меню «Экспорт», а узел добавляется правым кликом по полотну.
 */
export const CanvasTools = ({
  mode,
  onModeChange,
  onSave,
  canSave,
  onClear,
  canClear,
  saveFlash = false,
  readOnly = false,
}: CanvasToolsProps) => (
  <div className={styles.rail}>
    <div className={styles.group}>
      {MODES.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          className={`${styles.button} ${mode === id ? styles.buttonActive : ""}`}
          onClick={() => onModeChange(id)}
          aria-pressed={mode === id}
          aria-label={title}
          data-tooltip={title}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>

    {!readOnly && (
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.button} ${saveFlash ? styles.buttonFlash : ""}`}
          onClick={onSave}
          disabled={!canSave}
          aria-label="Сохранить граф"
          data-tooltip="Сохранить граф"
        >
          <SaveIcon size={18} />
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonDanger}`}
          onClick={onClear}
          disabled={!canClear}
          aria-label="Очистить полотно"
          data-tooltip="Очистить полотно"
        >
          <ResetCanvasIcon size={18} />
        </button>
      </div>
    )}
  </div>
);
