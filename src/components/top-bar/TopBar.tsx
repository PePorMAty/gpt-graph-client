import { NavLink } from "react-router-dom";

import { LogoMark } from "../icons";
import { GraphSearchBox } from "./GraphSearchBox";
import { ExportMenu } from "./ExportMenu";
import { HelpMenu } from "./HelpMenu";
import { NotificationsMenu } from "./NotificationsMenu";
import styles from "./TopBar.module.css";

interface TopBarProps {
  /** Открыть модалку публикации графа по ссылке (пункт меню «Экспорт»). */
  onShare: () => void;
}

const TABS = [
  { to: "/", label: "Граф", end: true },
  { to: "/library", label: "Библиотека", end: false },
];

/**
 * Шапка приложения: логотип, разделы, поиск по графу и действия справа.
 * Живёт над роутером — видна на всех экранах, кроме страницы шар-ссылки.
 */
export const TopBar = ({ onShare }: TopBarProps) => (
  <header className={styles.bar}>
    <div className={styles.left}>
      <div className={styles.logo}>
        <LogoMark size={26} className={styles.logoMark} />
        <span className={styles.logoText}>GPT Graph</span>
      </div>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.tabActive : ""}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>

    <div className={styles.center}>
      <GraphSearchBox />
    </div>

    <div className={styles.right}>
      <ExportMenu onShare={onShare} />
      <HelpMenu />
      <NotificationsMenu />
    </div>
  </header>
);
