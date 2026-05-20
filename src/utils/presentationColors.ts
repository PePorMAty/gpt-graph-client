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
