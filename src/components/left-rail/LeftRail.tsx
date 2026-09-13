import type { FC } from "react";

import {
  BookmarkIcon,
  ClockIcon,
  DatabaseIcon,
  GraphIcon,
  PlusIcon,
  type IconProps,
} from "../icons";
import styles from "./LeftRail.module.css";

/** Разделы левого рельса. `graph` — основной режим без дополнительных панелей. */
export type RailSection = "create" | "graph" | "sources" | "bookmarks" | "history";

interface RailItem {
  id: RailSection;
  Icon: FC<IconProps>;
  title: string;
}

const ITEMS: RailItem[] = [
  { id: "create", Icon: PlusIcon, title: "Создать граф" },
  { id: "graph", Icon: GraphIcon, title: "Граф" },
  { id: "sources", Icon: DatabaseIcon, title: "База данных: источники графа" },
  { id: "bookmarks", Icon: BookmarkIcon, title: "Закладки" },
  { id: "history", Icon: ClockIcon, title: "История действий" },
];

interface LeftRailProps {
  active: RailSection;
  onSelect: (section: RailSection) => void;
}

/**
 * Левый вертикальный рельс: переключение режимов работы с графом.
 * Сам по себе ничего не рисует поверх холста — выбранный раздел открывает
 * соответствующую панель (см. App).
 */
export const LeftRail = ({ active, onSelect }: LeftRailProps) => (
  <nav className={styles.rail} aria-label="Разделы">
    {ITEMS.map(({ id, Icon, title }) => (
      <button
        key={id}
        type="button"
        className={`${styles.item} ${active === id ? styles.itemActive : ""}`}
        onClick={() => onSelect(id)}
        aria-label={title}
        aria-current={active === id}
        data-tooltip={title}
      >
        <Icon size={20} />
      </button>
    ))}
  </nav>
);
