import type { FC } from "react";

import { useAppSelector } from "../../store/hooks";
import type { RailSection } from "../left-rail/LeftRail";
import { DatabaseSection } from "./DatabaseSection";
import { BookmarksSection } from "./BookmarksSection";
import { CreateSection } from "./CreateSection";
import { HistorySection } from "./HistorySection";
import {
  BookmarkIcon,
  ClockIcon,
  CloseIcon,
  DatabaseIcon,
  PlusIcon,
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
}

const SECTIONS: Partial<Record<RailSection, SectionMeta>> = {
  create: { title: "Создание графа", Icon: PlusIcon },
  sources: { title: "База данных", Icon: DatabaseIcon },
  bookmarks: { title: "Закладки графа", Icon: BookmarkIcon },
  history: { title: "История действий", Icon: ClockIcon },
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

  const { title, Icon } = meta;
  // У создания подпись своя: граф на полотне к нему отношения не имеет.
  const subtitle =
    section === "create"
      ? "Построить цепочку по запросу или начать с одного продукта"
      : graphName || originalPrompt;

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
              {section === "create" ? subtitle : `Граф: ${subtitle}`}
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
        {section === "create" ? (
          <CreateSection onDone={onClose} />
        ) : section === "sources" ? (
          <DatabaseSection />
        ) : section === "bookmarks" ? (
          <BookmarksSection />
        ) : (
          <HistorySection />
        )}
      </div>
    </aside>
  );
};
