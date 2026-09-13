import type { FC } from "react";

import { useAppSelector } from "../../store/hooks";
import type { RailSection } from "../left-rail/LeftRail";
import { SourcesSection } from "./SourcesSection";
import {
  BookmarkIcon,
  ClockIcon,
  CloseIcon,
  DatabaseIcon,
  type IconProps,
} from "../icons";
import styles from "./RailPanel.module.css";

interface RailPanelProps {
  section: RailSection;
  onClose: () => void;
}

interface SectionMeta {
  title: string;
  Icon: FC<IconProps>;
  /** Текст заглушки для разделов, которых ещё нет. */
  placeholder?: string;
}

const SECTIONS: Partial<Record<RailSection, SectionMeta>> = {
  sources: { title: "Источники графа", Icon: DatabaseIcon },
  bookmarks: {
    title: "Закладки",
    Icon: BookmarkIcon,
    placeholder:
      "Здесь будут сохранённые узлы и участки графа, чтобы быстро к ним возвращаться. Раздел ещё не подключён.",
  },
  history: {
    title: "История",
    Icon: ClockIcon,
    placeholder:
      "Здесь будет история действий: построенные шаги, удаления, проверки и отменённые операции. Раздел ещё не подключён.",
  },
};

/**
 * Выезжающая панель разделов левого рельса. Поверх холста, но без затемнения:
 * граф остаётся доступным, панель закрывается крестиком или Escape. Открытие
 * карточки узла тоже её закрывает — они занимают одно место (см. App).
 */
export const RailPanel = ({ section, onClose }: RailPanelProps) => {
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const originalPrompt = useAppSelector((s) => s.graph.originalPrompt);
  const meta = SECTIONS[section];

  if (!meta) return null;

  const { title, Icon, placeholder } = meta;
  const subtitle = graphName || originalPrompt;

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.avatar} aria-hidden>
          <Icon size={20} />
        </span>
        <div className={styles.headerText}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && (
            <div className={styles.subtitle} title={subtitle}>
              Граф: {subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Закрыть панель"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      <div className={styles.body}>
        {section === "sources" ? (
          <SourcesSection />
        ) : (
          <div className={styles.placeholder}>
            <Icon size={28} className={styles.placeholderIcon} />
            <div className={styles.placeholderText}>{placeholder}</div>
          </div>
        )}
      </div>
    </aside>
  );
};
