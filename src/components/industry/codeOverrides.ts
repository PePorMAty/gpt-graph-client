// src/components/industry/codeOverrides.ts
//
// Коды продукта, заданные человеком во вкладке «Промышленное знание»
// (CustomNodeData.codeOverrides). Читаются в трёх местах — карточка, подсказка
// «ID» и список «Промышленное знание», — поэтому разбор данных узла здесь, один.

import type { CodeOverride, CustomNode, CustomNodeData } from "../../types";
import { industryKey } from "../../store/slices/industrySlice";

export type CodeKind = "okpd2" | "tnved";

export type CodeOverrides = Partial<Record<CodeKind, CodeOverride>>;

function readOne(raw: unknown): CodeOverride | undefined {
  const o = raw as Partial<CodeOverride> | null | undefined;
  const code = typeof o?.code === "string" ? o.code.trim() : "";
  if (!code) return undefined;
  return {
    code,
    name: typeof o?.name === "string" && o.name.trim() ? o.name : null,
    ...(typeof o?.path === "string" && o.path ? { path: o.path } : {}),
  };
}

/** Заданные вручную коды узла — только целые записи. */
export function readCodeOverrides(
  data: Partial<CustomNodeData> | null | undefined,
): CodeOverrides {
  const raw = data?.codeOverrides;
  const okpd2 = readOne(raw?.okpd2);
  const tnved = readOne(raw?.tnved);
  return { ...(okpd2 ? { okpd2 } : {}), ...(tnved ? { tnved } : {}) };
}

/**
 * Заданные вручную коды продуктов графа — по ключу названия, как сведения
 * реестра (industryKey). Списку «Промышленное знание» узлы не нужны, только
 * это.
 */
export function codeOverridesByProduct(
  nodes: CustomNode[],
): Map<string, CodeOverrides> {
  const out = new Map<string, CodeOverrides>();
  for (const n of nodes) {
    if (n.type !== "product") continue;
    const own = readCodeOverrides(n.data);
    if (!own.okpd2 && !own.tnved) continue;
    const key = industryKey(String(n.data?.label ?? ""));
    if (!out.has(key)) out.set(key, own);
  }
  return out;
}

/**
 * Новое значение codeOverrides: задать код (value) или вернуть код реестра
 * (null). undefined — вручную не задано ничего.
 */
export function withCodeOverride(
  current: CodeOverrides,
  kind: CodeKind,
  value: CodeOverride | null,
): CodeOverrides | undefined {
  const next: CodeOverrides = { ...current };
  if (value) next[kind] = value;
  else delete next[kind];
  return next.okpd2 || next.tnved ? next : undefined;
}

/** Подписи вида кода: в тексте и в подсказках. */
export const CODE_LABEL: Record<CodeKind, string> = {
  okpd2: "ОКПД2",
  tnved: "ТН ВЭД",
};
