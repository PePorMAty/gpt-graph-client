import { useEffect, useMemo, useState } from "react";
import { useReactFlow, useStore, useViewport } from "@xyflow/react";

import { useAppSelector } from "../../store/hooks";
import { computeViewportStats } from "../../utils/viewportStats";
import { graphSignature } from "../../utils/graphSignature";
import {
  ChainLengthIcon,
  FitViewIcon,
  LinkIcon,
  NodesCountIcon,
  ShieldCheckIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../icons";
import styles from "./StatusBar.module.css";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Нижняя строка состояния: счётчики по видимой области, масштаб и состояние
 * сохранения. Кнопки масштаба переехали сюда с правого рельса полотна.
 *
 * Счётчики намеренно считаются по видимой области, а не по всему графу:
 * на объединённых графах в несколько сотен узлов «всего узлов» ни о чём не
 * говорит, а «сколько сейчас на экране» — говорит.
 */
export const StatusBar = () => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const viewport = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const { savedAt, savedSignature } = useAppSelector((s) => s.savedGraphs);

  // Пересчёт счётчиков отложен: панорамирование даёт десятки кадров в
  // секунду, а обход графа на каждом из них заметно тормозит холст.
  const [view, setView] = useState({ ...viewport, width, height });
  useEffect(() => {
    const id = setTimeout(
      () => setView({ ...viewport, width, height }),
      120,
    );
    return () => clearTimeout(id);
  }, [viewport, width, height]);

  const stats = useMemo(
    () => computeViewportStats(nodes, edges, view),
    [nodes, edges, view],
  );

  const zoomPercent = Math.round(viewport.zoom * 100);

  // Пустое полотно «грязным» не считаем: сохранять нечего.
  const signature = useMemo(
    () => graphSignature(nodes, edges),
    [nodes, edges],
  );
  const dirty = nodes.length > 0 && signature !== savedSignature;
  const savedTime = savedAt ? formatTime(savedAt) : null;

  return (
    <footer className={styles.bar}>
      <div className={styles.stats}>
        <span className={styles.stat} title="Узлов в видимой области">
          <NodesCountIcon size={15} className={styles.statIcon} />
          Показано узлов: <b className={styles.statValue}>{stats.nodes}</b>
        </span>
        <span className={styles.stat} title="Связей между видимыми узлами">
          <LinkIcon size={15} className={styles.statIcon} />
          Связей: <b className={styles.statValue}>{stats.edges}</b>
        </span>
        <span
          className={styles.stat}
          title="Самая длинная цепочка в видимой области, в продуктах"
        >
          <ChainLengthIcon size={15} className={styles.statIcon} />
          Длина цепочек:{" "}
          <b className={styles.statValue}>{stats.chainLength} шагов</b>
        </span>
        <span
          className={styles.stat}
          title="Продукты, подтверждённые в ГИСП (база пока не подключена)"
        >
          <ShieldCheckIcon size={15} className={styles.statIconSuccess} />
          Подтверждено в ГИСП:{" "}
          <b className={styles.statValue}>{stats.confirmed}</b>
        </span>
      </div>

      <div className={styles.right}>
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomOut({ duration: 150 })}
            aria-label="Уменьшить масштаб"
          >
            <ZoomOutIcon size={18} />
          </button>
          <button
            type="button"
            className={styles.zoomValue}
            onClick={() => fitView({ duration: 300, padding: 0.15 })}
            title="Вписать граф в экран"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomIn({ duration: 150 })}
            aria-label="Увеличить масштаб"
          >
            <ZoomInIcon size={18} />
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => fitView({ duration: 300, padding: 0.15 })}
            aria-label="Вписать граф в экран"
          >
            <FitViewIcon size={18} />
          </button>
        </div>

        <span
          className={`${styles.save} ${dirty ? styles.saveDirty : ""}`}
          title={
            dirty
              ? "На полотне есть правки, которых нет в сохранённом графе"
              : "Полотно совпадает с сохранённым графом"
          }
        >
          <span className={styles.saveDot} aria-hidden />
          {dirty ? "Изменения не сохранены" : "Все изменения сохранены"}
          {!dirty && savedTime && (
            <span className={styles.saveTime}>{savedTime}</span>
          )}
        </span>
      </div>
    </footer>
  );
};
