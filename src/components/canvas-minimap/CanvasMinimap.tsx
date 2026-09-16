import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReactFlow, useStore, useViewport, type Node } from "@xyflow/react";

import { minimapNodeColor } from "../../utils/minimapNodeColor";
import { estimateNodeSize } from "../nodes/nodeBox";
import styles from "./CanvasMinimap.module.css";

/** Габариты панели мини-карты на QHD (px). На меньших экранах CSS ужимает
 *  их вместе со всем интерфейсом, поэтому реальные снимаем с DOM. */
const PANEL_W = 260;
const PANEL_H = 180;

/**
 * Во сколько раз окно мини-карты шире текущего кадра в режиме «рядом с кадром».
 * Больше — виднее контекст, но мельче узлы; 2.6 даёт узел ~13px при обычном
 * масштабе — уже различимый блок, а не точка.
 */
const NEAR_FACTOR = 2.6;

/** Поля вокруг графа в режиме «весь граф», в долях его габарита. */
const WHOLE_PADDING = 0.06;

/** Минимальный размер узла на панели (px): мельче — уже не разглядеть. */
const MIN_NODE_PX = 6;

/** С какой ширины самого широкого узла на панели (px) подписывать узлы. */
const LABEL_MIN_PX = 72;
/** Сколько узлов в окне ещё имеет смысл подписывать. */
const LABEL_MAX_NODES = 45;

type Rect = { x: number; y: number; w: number; h: number };

/** Режим охвата: окрестность текущего кадра или весь граф. */
type Coverage = "near" | "whole";

/** Расширить прямоугольник до соотношения сторон панели, сохранив центр. */
function toAspect(r: Rect, aspect: number): Rect {
  if (r.w / r.h > aspect) {
    const h = r.w / aspect;
    return { x: r.x, y: r.y - (h - r.h) / 2, w: r.w, h };
  }
  const w = r.h * aspect;
  return { x: r.x - (w - r.w) / 2, y: r.y, w, h: r.h };
}

/** Вдвинуть прямоугольник внутрь границ; если он больше — отцентровать. */
function clampInto(r: Rect, bounds: Rect): Rect {
  const fit = (
    pos: number,
    size: number,
    boundPos: number,
    boundSize: number,
  ) =>
    size >= boundSize
      ? boundPos + (boundSize - size) / 2
      : Math.min(Math.max(pos, boundPos), boundPos + boundSize - size);
  return {
    x: fit(r.x, r.w, bounds.x, bounds.w),
    y: fit(r.y, r.h, bounds.y, bounds.h),
    w: r.w,
    h: r.h,
  };
}

interface CanvasMinimapProps {
  /** Узлы в том виде, в каком они на полотне (учитывая режимы просмотра). */
  nodes: Node[];
}

/**
 * Мини-карта полотна.
 *
 * Штатная мини-карта React Flow всегда показывает граф целиком: на графах в
 * сотни узлов всё сжимается в неразличимую крошку, и понять, что именно
 * сейчас в кадре, невозможно. Здесь окно мини-карты по умолчанию идёт за
 * камерой — показывает окрестность кадра, — а весь граф доступен кнопкой.
 *
 * Клик и протяжка по карте переносят камеру, колесо меняет масштаб полотна.
 */
export const CanvasMinimap = ({ nodes }: CanvasMinimapProps) => {
  const { setCenter, zoomTo } = useReactFlow();
  const { x: tx, y: ty, zoom } = useViewport();
  const paneW = useStore((s) => s.width);
  const paneH = useStore((s) => s.height);

  const [coverage, setCoverage] = useState<Coverage>("near");
  const panelRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  // Соотношение сторон viewBox держим равным панели: иначе
  // preserveAspectRatio="none" растянул бы узлы по одной оси.
  const [panel, setPanel] = useState({ w: PANEL_W, h: PANEL_H });
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      // Как и в превью библиотеки: без сверки с прежним размером каждый отклик
      // наблюдателя давал новый объект и лишнюю перерисовку, а на дробных
      // размерах они шли непрерывно.
      const w = Math.round(width);
      const h = Math.round(height);
      setPanel((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Габариты узлов: измеренные React Flow, иначе — оценка по подписи. */
  const boxes = useMemo(
    () =>
      nodes.map((n) => {
        const label =
          typeof n.data?.label === "string" ? (n.data.label as string) : "";
        const fallback = estimateNodeSize(label, false);
        return {
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          w: n.measured?.width ?? n.width ?? fallback.width,
          h: n.measured?.height ?? n.height ?? fallback.height,
          color: minimapNodeColor(n),
          label,
        };
      }),
    [nodes],
  );

  const graph = useMemo<Rect | null>(() => {
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
    const px = w * WHOLE_PADDING;
    const py = h * WHOLE_PADDING;
    return { x: minX - px, y: minY - py, w: w + px * 2, h: h + py * 2 };
  }, [boxes]);

  // Текущий кадр в координатах графа.
  const frame = useMemo<Rect>(
    () => ({
      x: -tx / zoom,
      y: -ty / zoom,
      w: (paneW || panel.w) / zoom,
      h: (paneH || panel.h) / zoom,
    }),
    [tx, ty, zoom, paneW, paneH, panel.w, panel.h],
  );

  const aspect = panel.w / panel.h;

  /** Что именно показывает карта. */
  const view = useMemo<Rect>(() => {
    const whole = graph
      ? toAspect(graph, aspect)
      : toAspect(frame, aspect);
    if (coverage === "whole" || !graph) return whole;

    const near = clampInto(
      toAspect(
        {
          x: frame.x - (frame.w * (NEAR_FACTOR - 1)) / 2,
          y: frame.y - (frame.h * (NEAR_FACTOR - 1)) / 2,
          w: frame.w * NEAR_FACTOR,
          h: frame.h * NEAR_FACTOR,
        },
        aspect,
      ),
      whole,
    );
    // Мелкий граф целиком помещается в окрестность — показываем его весь,
    // иначе карта пустовала бы по краям.
    return near.w >= whole.w ? whole : near;
  }, [graph, frame, coverage, aspect]);

  const scale = panel.w / view.w;

  /** Узлы, попадающие в окно карты. */
  const visible = useMemo(
    () =>
      boxes.filter(
        (b) =>
          b.x + b.w >= view.x &&
          b.x <= view.x + view.w &&
          b.y + b.h >= view.y &&
          b.y <= view.y + view.h,
      ),
    [boxes, view],
  );

  // Подписи имеют смысл, только когда узлы уже крупные и их немного.
  const widestPx = visible.reduce((m, b) => Math.max(m, b.w * scale), 0);
  const showLabels =
    visible.length > 0 &&
    visible.length <= LABEL_MAX_NODES &&
    widestPx >= LABEL_MIN_PX;
  const fontSize = 11 / scale;

  /** Экранная точка на карте → координаты графа. */
  const toFlow = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((clientY - rect.top) / rect.height) * view.h,
      };
    },
    [view],
  );

  const moveCamera = useCallback(
    (clientX: number, clientY: number) => {
      const p = toFlow(clientX, clientY);
      if (p) setCenter(p.x, p.y, { zoom, duration: 0 });
    },
    [toFlow, setCenter, zoom],
  );

  return (
    <div className={styles.panel} ref={panelRef}>
      <svg
        ref={svgRef}
        className={styles.map}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveCamera(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging.current) moveCamera(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onWheel={(e) => {
          // Колесо над картой меняет масштаб полотна — как у прежней карты.
          zoomTo(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), { duration: 0 });
        }}
      >
        {visible.map((b) => {
          // Совсем мелкие на карте узлы подтягиваем до различимого размера,
          // сохраняя центр: иначе на большом графе они пропадают совсем.
          const w = Math.max(b.w, MIN_NODE_PX / scale);
          const h = Math.max(b.h, (MIN_NODE_PX * 0.6) / scale);
          return (
            <rect
              key={b.id}
              x={b.x - (w - b.w) / 2}
              y={b.y - (h - b.h) / 2}
              width={w}
              height={h}
              rx={Math.min(2 / scale, h / 3)}
              fill={b.color}
            />
          );
        })}

        {showLabels &&
          visible.map((b) => (
            <text
              key={`t-${b.id}`}
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 + fontSize * 0.35}
              className={styles.label}
              fontSize={fontSize}
              textAnchor="middle"
            >
              {b.label.length > Math.floor(b.w / (fontSize * 0.55))
                ? b.label.slice(0, Math.floor(b.w / (fontSize * 0.55)) - 1) + "…"
                : b.label}
            </text>
          ))}

        {/* Затемнение вокруг кадра: четыре прямоугольника, чтобы сам кадр
            остался незакрашенным и без обводки. */}
        <g className={styles.mask}>
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={Math.max(frame.y - view.y, 0)}
          />
          <rect
            x={view.x}
            y={frame.y + frame.h}
            width={view.w}
            height={Math.max(view.y + view.h - (frame.y + frame.h), 0)}
          />
          <rect
            x={view.x}
            y={frame.y}
            width={Math.max(frame.x - view.x, 0)}
            height={frame.h}
          />
          <rect
            x={frame.x + frame.w}
            y={frame.y}
            width={Math.max(view.x + view.w - (frame.x + frame.w), 0)}
            height={frame.h}
          />
        </g>
      </svg>

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setCoverage((c) => (c === "near" ? "whole" : "near"))}
        title={
          coverage === "near"
            ? "Показать граф целиком"
            : "Показать окрестность кадра"
        }
      >
        {coverage === "near" ? "Весь граф" : "Рядом с кадром"}
      </button>
    </div>
  );
};
