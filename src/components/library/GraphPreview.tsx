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
/** Шаг приближения за один щелчок колеса. */
const WHEEL_STEP = 1.2;

const NODE_W = 180;
const NODE_H = 50;

const viewBoxOf = (v: Rect) => `${v.x} ${v.y} ${v.w} ${v.h}`;

/**
 * Превью графа в библиотеке: узлы прямоугольниками в их цветах, связи —
 * тонкими линиями.
 *
 * Настоящий React Flow сюда не ставим — это второй холст со своей физикой и
 * своим состоянием. Зато превью интерактивное: большой граф в статичном кадре
 * не разобрать, поэтому его можно таскать и приближать колесом; наведённый
 * узел подписан сразу, а на близком плане подписаны все.
 *
 * Плавность. Перетаскивание не перерисовывает узлы: кадр (viewBox) меняется
 * прямо у SVG раз в кадр анимации и сохраняется в состояние, когда кнопку
 * отпустили. Сдвиг считается от точки, где начали тянуть, а не от прошлого
 * события: раньше несколько событий мыши между перерисовками складывали один
 * и тот же сдвиг дважды, и граф прыгал. Колесо копит приближение до
 * следующего кадра — сотни узлов не пересобираются на каждый щелчок.
 */
export const GraphPreview = ({ nodes, edges = [] }: GraphPreviewProps) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 320, h: 220 });

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
  /** Самый свежий кадр — и между перерисовками, пока граф тащат. */
  const liveView = useRef<Rect | null>(current);
  liveView.current = current;

  /** Экранная точка → координаты графа в свежем кадре. */
  const toGraph = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const v = liveView.current;
    if (!rect || !v || !rect.width || !rect.height) return null;
    return {
      x: v.x + ((clientX - rect.left) / rect.width) * v.w,
      y: v.y + ((clientY - rect.top) / rect.height) * v.h,
    };
  }, []);

  /** Кадр, приближенный в k раз к точке (по умолчанию — к центру). */
  const zoomed = useCallback(
    (v: Rect, k: number, anchor?: { x: number; y: number }): Rect => {
      if (!fitted) return v;
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
    },
    [fitted],
  );

  const zoomBy = useCallback(
    (k: number) => {
      const v = liveView.current;
      if (v) setView(zoomed(v, k));
    },
    [zoomed],
  );

  /**
   * Колесо над превью только приближает — страница под ним не листается.
   *
   * Через onWheel этого не добиться: React вешает колесо пассивным слушателем,
   * и preventDefault там не работает — прокрутка уходила окну превью, а дальше
   * и странице. Поэтому слушатель свой, с passive: false. Щелчки колеса за
   * один кадр складываются в одно приближение.
   */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let pending = 1;
    let anchor: { x: number; y: number } | undefined;
    let frame = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pending *= e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      anchor = toGraph(e.clientX, e.clientY) ?? undefined;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const v = liveView.current;
        if (v) {
          const next = zoomed(v, pending, anchor);
          liveView.current = next;
          setView(next);
        }
        pending = 1;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toGraph, zoomed]);

  // ── Перетаскивание ──
  const drag = useRef<{
    x: number;
    y: number;
    view: Rect;
    frame: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !current) return;
    drag.current = { x: e.clientX, y: e.clientY, view: current, frame: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(null);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) {
      trackHover(e);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Сдвиг — от точки, где начали тянуть, в масштабе кадра на тот момент.
    const next: Rect = {
      ...d.view,
      x: d.view.x - ((e.clientX - d.x) / rect.width) * d.view.w,
      y: d.view.y - ((e.clientY - d.y) / rect.height) * d.view.h,
    };
    d.moved = true;
    liveView.current = next;
    if (d.frame) return;
    d.frame = requestAnimationFrame(() => {
      d.frame = 0;
      const v = liveView.current;
      if (v) svgRef.current?.setAttribute("viewBox", viewBoxOf(v));
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.frame) cancelAnimationFrame(d.frame);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d.moved && liveView.current) setView(liveView.current);
  };

  // ── Подпись узла под указателем ──
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const trackHover = (e: React.PointerEvent<SVGSVGElement>) => {
    const index = Number((e.target as Element).getAttribute?.("data-index") ?? NaN);
    if (!Number.isInteger(index)) {
      if (hover) setHover(null);
      return;
    }
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ index, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const scale = current ? size.w / current.w : 1;
  const widestPx = boxes.reduce((m, b) => Math.max(m, b.w * scale), 0);
  const showLabels = widestPx >= LABEL_MIN_PX;
  const fontSize = 12 / scale;

  // Узлы и связи — одним куском, который пересобирается только при смене
  // графа или масштаба: подпись под указателем его не трогает.
  const content = useMemo(
    () => (
      <>
        <g className={styles.previewEdges} strokeWidth={1.4 / scale}>
          {lines.map((l) => (
            <line key={l.id} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />
          ))}
        </g>

        {boxes.map((b, i) => (
          <rect
            key={b.id}
            data-index={i}
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
      </>
    ),
    [boxes, lines, scale, showLabels, fontSize],
  );

  if (!boxes.length || !current || !fitted) {
    return <div className={styles.previewEmpty}>Граф пуст</div>;
  }

  const isZoomed = Math.abs(current.w - fitted.w) > 1;
  const hovered = hover ? boxes[hover.index] : null;

  return (
    <div className={styles.previewBox} ref={boxRef}>
      <svg
        ref={svgRef}
        className={styles.preview}
        viewBox={viewBoxOf(current)}
        preserveAspectRatio="none"
        role="img"
        aria-label="Схема графа: перетаскивание и колесо меняют вид, наведение показывает название узла"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
      >
        {content}
      </svg>

      {hovered?.label && (
        <div
          className={styles.previewHover}
          style={{ left: hover!.x, top: hover!.y }}
          role="tooltip"
        >
          <span className={styles.previewHoverDot} style={{ background: hovered.color }} />
          {hovered.label}
        </div>
      )}

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
          disabled={!isZoomed}
          aria-label="Вписать граф"
          title="Вписать граф"
        >
          <FitViewIcon size={16} />
        </button>
      </div>
    </div>
  );
};
