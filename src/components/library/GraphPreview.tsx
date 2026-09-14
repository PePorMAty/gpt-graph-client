import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../../types";
import { minimapNodeColor } from "../../utils/minimapNodeColor";
import { FitViewIcon, ZoomInIcon, ZoomOutIcon } from "../icons";
import styles from "./LibraryScreen.module.css";

interface GraphPreviewProps {
  nodes: CustomNode[];
  edges?: Edge[];
}

type Rect = { x: number; y: number; w: number; h: number };

/** Поля вокруг графа при вписывании, в долях его габарита. */
const PADDING = 0.06;
/** Пределы приближения относительно вписанного вида. */
const MIN_SCALE = 0.6;
const MAX_SCALE = 40;
/** С какой ширины узла (px) подписывать его. */
const LABEL_MIN_PX = 46;

const NODE_W = 180;
const NODE_H = 50;

/**
 * Превью графа в библиотеке: узлы прямоугольниками в их цветах, связи —
 * тонкими линиями.
 *
 * Настоящий React Flow сюда не ставим — это второй холст со своей физикой и
 * своим состоянием. Зато превью интерактивное: большой граф в статичном кадре
 * не разобрать, поэтому его можно таскать и приближать колесом, а на близком
 * плане появляются подписи узлов.
 */
export const GraphPreview = ({ nodes, edges = [] }: GraphPreviewProps) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 320, h: 220 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Габариты контейнера: держим соотношение сторон viewBox равным ему, чтобы
  // экранные координаты переводились в координаты графа простым масштабом.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      // Округляем и сверяем с прежним значением. ResizeObserver отдаёт дробные
      // размеры и срабатывает на субпиксельных колебаниях раскладки; новый
      // объект на каждый отклик пересобирал бы кадр и гонял перерисовку по
      // кругу — на большом экране это выглядело как дрожащее превью.
      const w = Math.round(width);
      const h = Math.round(height);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxes = useMemo(
    () =>
      nodes
        .filter((n) => n.position)
        .map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          w: n.measured?.width ?? NODE_W,
          h: n.measured?.height ?? NODE_H,
          color: minimapNodeColor(n),
          label: typeof n.data?.label === "string" ? n.data.label : "",
        })),
    [nodes],
  );

  const centers = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const b of boxes) map.set(b.id, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    return map;
  }, [boxes]);

  const lines = useMemo(
    () =>
      edges
        .map((e) => ({ id: e.id, a: centers.get(e.source), b: centers.get(e.target) }))
        .filter((l): l is { id: string; a: { x: number; y: number }; b: { x: number; y: number } } =>
          Boolean(l.a && l.b),
        ),
    [edges, centers],
  );

  /** Кадр, в который вписан весь граф (с полями и по соотношению сторон). */
  const fitted = useMemo<Rect | null>(() => {
    if (!boxes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const px = w * PADDING;
    const py = h * PADDING;
    const rect = { x: minX - px, y: minY - py, w: w + px * 2, h: h + py * 2 };

    const aspect = size.w / size.h;
    if (rect.w / rect.h > aspect) {
      const nh = rect.w / aspect;
      return { ...rect, y: rect.y - (nh - rect.h) / 2, h: nh };
    }
    const nw = rect.h * aspect;
    return { ...rect, x: rect.x - (nw - rect.w) / 2, w: nw };
  }, [boxes, size]);

  // null — «следовать вписанному виду»: тогда превью само подстраивается под
  // размер контейнера. Как только пользователь подвинул или приблизил граф,
  // здесь лежит его кадр.
  const [view, setView] = useState<Rect | null>(null);

  // К вписанному виду возвращаемся при смене графа. Раньше это делал любой
  // пересчёт кадра — в том числе из-за изменившегося размера контейнера, и
  // масштаб, выбранный пользователем, сбрасывался на каждом шевелении
  // раскладки: превью невозможно было рассмотреть.
  useEffect(() => setView(null), [boxes]);

  const current = view ?? fitted;

  /** Экранная точка → координаты графа. */
  const toGraph = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !current) return null;
      return {
        x: current.x + ((clientX - rect.left) / rect.width) * current.w,
        y: current.y + ((clientY - rect.top) / rect.height) * current.h,
      };
    },
    [current],
  );

  /** Приблизить/отдалить в k раз относительно точки (по умолчанию — центра). */
  const zoomBy = useCallback(
    (k: number, anchor?: { x: number; y: number }) => {
      setView((prev) => {
        const v = prev ?? fitted;
        if (!v || !fitted) return prev;
        const min = fitted.w / MAX_SCALE;
        const max = fitted.w / MIN_SCALE;
        const w = Math.min(Math.max(v.w / k, min), max);
        const factor = w / v.w;
        const a = anchor ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
        return {
          x: a.x - (a.x - v.x) * factor,
          y: a.y - (a.y - v.y) * factor,
          w,
          h: v.h * factor,
        };
      });
    },
    [fitted],
  );

  if (!boxes.length || !current) {
    return <div className={styles.previewEmpty}>Граф пуст</div>;
  }

  const scale = size.w / current.w;
  const widestPx = boxes.reduce((m, b) => Math.max(m, b.w * scale), 0);
  const showLabels = widestPx >= LABEL_MIN_PX;
  const fontSize = 12 / scale;
  const zoomed = Math.abs(current.w - fitted!.w) > 1;

  return (
    <div className={styles.previewBox} ref={boxRef}>
      <svg
        ref={svgRef}
        className={styles.preview}
        viewBox={`${current.x} ${current.y} ${current.w} ${current.h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Схема графа: перетаскивание и колесо меняют вид"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const p = toGraph(e.clientX, e.clientY);
          if (!p) return;
          drag.current = p;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start) return;
          const p = toGraph(e.clientX, e.clientY);
          if (!p) return;
          setView((prev) => {
            const v = prev ?? fitted;
            if (!v) return prev;
            return { ...v, x: v.x - (p.x - start.x), y: v.y - (p.y - start.y) };
          });
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onWheel={(e) => {
          const anchor = toGraph(e.clientX, e.clientY) ?? undefined;
          zoomBy(e.deltaY < 0 ? 1.25 : 1 / 1.25, anchor);
        }}
      >
        <g className={styles.previewEdges} strokeWidth={1.4 / scale}>
          {lines.map((l) => (
            <line key={l.id} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />
          ))}
        </g>

        {boxes.map((b) => (
          <rect
            key={b.id}
            x={b.x}
            y={b.y}
            width={Math.max(b.w, 4 / scale)}
            height={Math.max(b.h, 3 / scale)}
            rx={Math.min(3 / scale, b.h / 3)}
            fill={b.color}
            opacity={0.9}
          />
        ))}

        {showLabels &&
          boxes.map((b) => (
            <text
              key={`t-${b.id}`}
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 + fontSize * 0.35}
              className={styles.previewLabel}
              fontSize={fontSize}
              textAnchor="middle"
            >
              {b.label.length > Math.floor(b.w / (fontSize * 0.55))
                ? b.label.slice(0, Math.floor(b.w / (fontSize * 0.55)) - 1) + "…"
                : b.label}
            </text>
          ))}
      </svg>

      <div className={styles.previewTools}>
        <button
          type="button"
          className={styles.previewTool}
          onClick={() => zoomBy(1.4)}
          aria-label="Приблизить"
          title="Приблизить"
        >
          <ZoomInIcon size={16} />
        </button>
        <button
          type="button"
          className={styles.previewTool}
          onClick={() => zoomBy(1 / 1.4)}
          aria-label="Отдалить"
          title="Отдалить"
        >
          <ZoomOutIcon size={16} />
        </button>
        <button
          type="button"
          className={styles.previewTool}
          onClick={() => setView(null)}
          disabled={!zoomed}
          aria-label="Вписать граф"
          title="Вписать граф"
        >
          <FitViewIcon size={16} />
        </button>
      </div>
    </div>
  );
};
