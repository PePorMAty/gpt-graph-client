import type { CustomNode } from "../types";

export const COMMON_PRESENTATION_COLOR = "#6c757d";

export const PRESENTATION_PALETTE: readonly string[] = [
  "#42a5f5",
  "#66bb6a",
  "#ab47bc",
  "#ef5350",
  "#26a69a",
  "#5c6bc0",
  "#ec407a",
  "#8d6e63",
  "#29b6f6",
  "#9ccc65",
  "#7e57c2",
  "#26c6da",
];

const DEFAULT_PRODUCT_COLOR = PRESENTATION_PALETTE[0];

interface NodeWithPresentations {
  type?: string;
  data?: {
    presentations?: unknown;
    presentationColor?: unknown;
    [key: string]: unknown;
  };
}

export function assignColorsForPresentations(
  existing: Record<string, string>,
  presentations: string[],
): Record<string, string> {
  const out: Record<string, string> = { ...existing };
  let nextIndex = Object.keys(out).length;
  for (const name of presentations) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (out[trimmed]) continue;
    out[trimmed] = PRESENTATION_PALETTE[nextIndex % PRESENTATION_PALETTE.length];
    nextIndex++;
  }
  return out;
}

export function colorForPresentations(
  presentations: string[] | undefined,
  registry: Record<string, string>,
): string | undefined {
  if (!presentations || presentations.length === 0) return undefined;
  if (presentations.length > 1) return COMMON_PRESENTATION_COLOR;
  return registry[presentations[0]] ?? DEFAULT_PRODUCT_COLOR;
}

/**
 * Восстанавливает реестр презентация → цвет по узлам графа.
 * Нужно при открытии сохранённого графа (узлы хранят
 * data.presentations и data.presentationColor, а сам реестр не
 * сериализуется на сервер).
 *
 * Сначала собираем «надёжные» соответствия от product-узлов с ровно
 * одной презентацией; для презентаций, встречающихся только в общих
 * узлах (т.е. без индивидуального цвета), добиваем из палитры.
 */
export function reconstructPresentationColors(
  nodes: NodeWithPresentations[],
): Record<string, string> {
  const registry: Record<string, string> = {};

  for (const n of nodes) {
    if (n.type !== "product") continue;
    const pres = n.data?.presentations;
    const color = n.data?.presentationColor;
    if (!Array.isArray(pres) || pres.length !== 1) continue;
    if (typeof color !== "string" || !color) continue;
    const name = typeof pres[0] === "string" ? pres[0].trim() : "";
    if (!name) continue;
    if (!registry[name]) registry[name] = color;
  }

  const all = new Set<string>();
  for (const n of nodes) {
    const pres = n.data?.presentations;
    if (!Array.isArray(pres)) continue;
    for (const p of pres) {
      if (typeof p !== "string") continue;
      const trimmed = p.trim();
      if (trimmed) all.add(trimmed);
    }
  }
  const missing = [...all].filter((p) => !registry[p]);
  return missing.length > 0
    ? assignColorsForPresentations(registry, missing)
    : registry;
}

/**
 * Гарантирует, что у каждого product-узла есть презентация (источник).
 *
 * Нужно для вкладки «Объединение графов»: графы, построенные по шагам
 * (`stepToFlow` / `levelToFlow` / `chainToFlow`), не несут `data.presentations`,
 * поэтому без бэкфилла их узлы рисуются дефолтным цветом и выпадают из легенды.
 * Каждый «пустой» product-узел получает единый `sourceName` как свою
 * презентацию (весь граф = один источник), цвет пересчитывается из реестра.
 *
 * Идемпотентна: узлы, у которых презентации уже есть, не трогаются — это
 * сохраняет смешанный случай (часть узлов из presentation-JSON, часть step).
 * Реестр расширяется новым источником (старые цвета сохраняются).
 */
export function ensureProductPresentations(
  nodes: CustomNode[],
  sourceName: string,
  registry: Record<string, string>,
): { nodes: CustomNode[]; registry: Record<string, string> } {
  const trimmed = sourceName.trim();
  if (!trimmed) return { nodes, registry };

  const needsBackfill = nodes.some((n) => {
    if (n.type !== "product") return false;
    const pres = n.data?.presentations;
    return !(Array.isArray(pres) && pres.length > 0);
  });
  if (!needsBackfill) return { nodes, registry };

  const nextRegistry = assignColorsForPresentations(registry, [trimmed]);

  const outNodes = nodes.map((n) => {
    if (n.type !== "product") return n;
    const pres = Array.isArray(n.data?.presentations)
      ? (n.data.presentations as string[])
      : [];
    if (pres.length > 0) return n;

    const label = typeof n.data?.label === "string" ? n.data.label : "";
    return {
      ...n,
      data: {
        ...n.data,
        presentations: [trimmed],
        presentationColor: colorForPresentations([trimmed], nextRegistry),
        ...(label ? { labelsByPresentation: { [trimmed]: label } } : {}),
      },
    };
  });

  return { nodes: outNodes, registry: nextRegistry };
}

/**
 * Оставляет в реестре только презентации, которые реально есть на полотне.
 *
 * Реестр переживал смену набора узлов: после очистки полотна или создания
 * нового графа легенда показывала источники прежнего — цвета вроде бы есть, а
 * узлов с ними уже нет. Здесь он приводится в соответствие узлам.
 */
export function prunePresentationColors(
  registry: Record<string, string>,
  nodes: NodeWithPresentations[],
): Record<string, string> {
  const present = new Set<string>();
  for (const n of nodes) {
    const pres = n.data?.presentations;
    if (!Array.isArray(pres)) continue;
    for (const p of pres) {
      if (typeof p !== "string") continue;
      const trimmed = p.trim();
      if (trimmed) present.add(trimmed);
    }
  }
  const kept = Object.entries(registry).filter(([name]) => present.has(name));
  // Ничего не изменилось — возвращаем прежний объект, чтобы не дёргать
  // подписчиков стора лишней сменой ссылки.
  return kept.length === Object.keys(registry).length
    ? registry
    : Object.fromEntries(kept);
}

/**
 * Есть ли на графе продукты сразу из нескольких презентаций.
 *
 * От этого зависит служебный пункт легенды «Общие узлы»: без таких узлов он
 * обещал бы цвет, которого на полотне нет.
 */
export function hasCommonProductNodes(nodes: NodeWithPresentations[]): boolean {
  return nodes.some((n) => {
    if (n.type !== "product") return false;
    const pres = n.data?.presentations;
    return Array.isArray(pres) && pres.length > 1;
  });
}

/**
 * Переименование презентации вне стора — для превью объединения.
 *
 * На полотне то же самое делает редьюсер `renamePresentation`; здесь графа в
 * сторе ещё нет, объединение только посчитано. Правило одно: имя меняется и в
 * реестре цветов, и в узлах — иначе цвет потеряется.
 *
 * Порядок ключей реестра сохраняем, чтобы легенда не перетасовывалась, а узлы
 * без этой презентации возвращаем прежними объектами: React Flow перерисовывает
 * узел по смене ссылки.
 */
export function applyPresentationRename<T extends NodeWithPresentations>(
  nodes: T[],
  colors: Record<string, string>,
  from: string,
  to: string,
): { nodes: T[]; colors: Record<string, string> } {
  if (!from || !to || from === to) return { nodes, colors };
  if (!(from in colors) || to in colors) return { nodes, colors };

  const nextColors = Object.fromEntries(
    Object.entries(colors).map(([name, color]) =>
      name === from ? [to, color] : [name, color],
    ),
  );

  const nextNodes = nodes.map((n) => {
    const pres = n.data?.presentations;
    const labels = n.data?.labelsByPresentation as
      | Record<string, string>
      | undefined;
    const inPres = Array.isArray(pres) && pres.includes(from);
    const inLabels = Boolean(labels && from in labels);
    if (!inPres && !inLabels) return n;

    const data: Record<string, unknown> = { ...n.data };
    if (inPres) {
      data.presentations = (pres as string[]).map((p) =>
        p === from ? to : p,
      );
    }
    if (inLabels && labels) {
      const { [from]: moved, ...rest } = labels;
      data.labelsByPresentation = { ...rest, [to]: moved };
    }
    return { ...n, data } as T;
  });

  return { nodes: nextNodes, colors: nextColors };
}

export interface LegendEntry {
  name: string;
  swatch: string;
  isCommon?: boolean;
}

export function buildLegend(
  registry: Record<string, string>,
  hasCommonNodes: boolean,
): LegendEntry[] {
  const entries: LegendEntry[] = Object.entries(registry).map(
    ([name, swatch]) => ({ name, swatch }),
  );
  if (hasCommonNodes) {
    entries.push({
      name: "Общие узлы",
      swatch: COMMON_PRESENTATION_COLOR,
      isCommon: true,
    });
  }
  return entries;
}
