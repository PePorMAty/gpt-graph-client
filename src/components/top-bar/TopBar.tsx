import { NavLink, useLocation } from "react-router-dom";

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
 *
 * Поиск и экспорт относятся к графу на полотне, поэтому в библиотеке их нет:
 * искать там нечего, а выгрузить можно любой граф из списка — своей кнопкой
 * в его карточке.
 */
export const TopBar = ({ onShare }: TopBarProps) => {
  const { pathname } = useLocation();
  const onCanvas = pathname === "/";

  return (
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

    <div className={styles.center}>{onCanvas && <GraphSearchBox />}</div>

    <div className={styles.right}>
      {onCanvas && <ExportMenu onShare={onShare} />}
      <HelpMenu />
      <NotificationsMenu />
    </div>
  </header>
  );
};
