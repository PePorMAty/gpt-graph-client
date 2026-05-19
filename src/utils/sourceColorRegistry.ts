export const COMMON_SOURCE_COLOR = "#ffc107";

export const PRESENTATION_PALETTE: readonly string[] = [
  "#42a5f5",
  "#66bb6a",
  "#ab47bc",
  "#ef5350",
  "#26a69a",
  "#ffa726",
  "#5c6bc0",
  "#ec407a",
  "#8d6e63",
  "#78909c",
];

const DEFAULT_PRODUCT_COLOR = PRESENTATION_PALETTE[0];

export function assignColorsForPresentations(
  existing: Record<string, string>,
  presentations: string[]
): Record<string, string> {
  const out: Record<string, string> = { ...existing };
  let nextIndex = Object.keys(out).length;
  for (const name of presentations) {
    if (!name) continue;
    if (out[name]) continue;
    out[name] = PRESENTATION_PALETTE[nextIndex % PRESENTATION_PALETTE.length];
    nextIndex++;
  }
  return out;
}

export function colorForNode(
  sources: string[],
  registry: Record<string, string>
): string {
  if (sources.length > 1) return COMMON_SOURCE_COLOR;
  if (sources.length === 1) {
    return registry[sources[0]] ?? DEFAULT_PRODUCT_COLOR;
  }
  return DEFAULT_PRODUCT_COLOR;
}

export interface LegendEntry {
  name: string;
  swatch: string;
  isCommon?: boolean;
}

export function buildLegend(
  registry: Record<string, string>,
  hasCommonNodes: boolean
): LegendEntry[] {
  const entries: LegendEntry[] = Object.entries(registry).map(
    ([name, swatch]) => ({ name, swatch })
  );
  if (hasCommonNodes) {
    entries.push({
      name: "Общие узлы",
      swatch: COMMON_SOURCE_COLOR,
      isCommon: true,
    });
  }
  return entries;
}
