import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng } from "html-to-image";

/** Безопасное имя файла из названия графа. */
function fileNameBase(name: string | null | undefined): string {
  const clean = (name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-");
  return clean || "graph";
}

function download(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Выгрузка графа в JSON — тот же формат, что у сохранения на сервер. */
export function exportGraphJson(payload: unknown, graphName?: string | null) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  download(url, `${fileNameBase(graphName)}.json`);
  // Освобождаем объектный URL после того, как браузер забрал файл.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PNG_WIDTH = 2400;
const PNG_HEIGHT = 1600;
const PNG_PADDING = 0.12;

/**
 * Снимок полотна в PNG.
 *
 * Рисуем не видимую часть, а весь граф: берём габариты всех узлов, считаем
 * под них вьюпорт и временно подставляем его в `.react-flow__viewport`
 * (html-to-image снимает DOM как есть, поэтому трансформацию нужно задать
 * до снимка). Исходное состояние камеры при этом не трогаем — меняется
 * только клон, который делает библиотека.
 */
export async function exportGraphPng(
  nodes: Node[],
  graphName?: string | null,
  backgroundColor = "#ffffff",
): Promise<void> {
  const viewportEl = document.querySelector<HTMLElement>(
    ".react-flow__viewport",
  );
  if (!viewportEl) throw new Error("Полотно не найдено");
  if (!nodes.length) throw new Error("На полотне нет узлов");

  const bounds = getNodesBounds(nodes);
  const { x, y, zoom } = getViewportForBounds(
    bounds,
    PNG_WIDTH,
    PNG_HEIGHT,
    0.2,
    2,
    PNG_PADDING,
  );

  const dataUrl = await toPng(viewportEl, {
    backgroundColor,
    width: PNG_WIDTH,
    height: PNG_HEIGHT,
    style: {
      width: `${PNG_WIDTH}px`,
      height: `${PNG_HEIGHT}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
    // Точки фона и элементы управления в снимок не идут — только граф.
    filter: (node) => {
      const cls = (node as HTMLElement).classList;
      if (!cls) return true;
      return (
        !cls.contains("react-flow__background") &&
        !cls.contains("react-flow__minimap") &&
        !cls.contains("react-flow__controls")
      );
    },
  });

  download(dataUrl, `${fileNameBase(graphName)}.png`);
}
