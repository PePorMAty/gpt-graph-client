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
