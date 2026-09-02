// src/utils/buildTechDescriptionContext.ts
//
// Переменные промпта технологического описания (см. prompts/techDescriptionPrompt.ts)
// для узла-преобразования: направление шага, продукты по обе стороны, текст
// существующей цепочки и текстовые сведения о технологии.
//
// Всё берётся из графа: рёбра step-by-step всегда идут
// «продукт → преобразование → продукт» (см. stepToFlow), поэтому входы — это
// источники входящих рёбер, выходы — цели исходящих.

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { BuildDirection, TechnologySource } from "../store/types";

export interface TechDescriptionContext {
  /** Направление построения шага (из данных узла, фолбэк — "down"). */
  direction: BuildDirection;
  /** Продукты-входы преобразования (сырьё). */
  inputProducts: string[];
  /** Продукты-выходы преобразования. */
  outputProducts: string[];
  /** Существующий продукт цепочки при выбранном направлении. */
  currentProduct: string;
  /** Добавленный шагом продукт при выбранном направлении. */
  additionalProduct: string;
  /** Текст существующей цепочки (связи вокруг преобразования). */
  existingChain: string;
  /** Текстовые сведения о технологии: описания узлов + тексты источников. */
  processDescription: string;
}

/** Сколько источников и сколько символов из каждого класть в сведения. */
const MAX_SOURCE_BLOCKS = 4;
const MAX_SOURCE_CHARS = 2000;
/** Ограничение на размер текста цепочки — карточка не должна раздувать запрос. */
const MAX_CHAIN_LINES = 60;

const label = (n?: CustomNode) => String(n?.data?.label ?? "").trim();
const description = (n?: CustomNode) => String(n?.data?.description ?? "").trim();

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

/**
 * Продукты по обе стороны преобразования при заданном направлении.
 *
 * Вкладка направления берёт продукт со СВОЕЙ стороны полотна:
 * ВВЕРХ — продукты выше преобразования (его входы, сырьё),
 * ВНИЗ  — продукты ниже преобразования (его выходы).
 * Раньше стороны были переставлены: «вниз» брала вход (продукт сверху),
 * «вверх» — выход (продукт снизу).
 *
 * Если с одной стороны продуктов несколько, в запрос идут ВСЕ: раньше
 * брался только первый, и остальные продукты преобразования не описывались.
 */
export function pickProductsForDirection(
  direction: BuildDirection,
  inputProducts: string[],
  outputProducts: string[],
): { currentProduct: string; additionalProduct: string } {
  const join = (arr: string[]) => arr.filter(Boolean).join(", ");
  return direction === "up"
    ? {
        currentProduct: join(inputProducts),
        additionalProduct: join(outputProducts),
      }
    : {
        currentProduct: join(outputProducts),
        additionalProduct: join(inputProducts),
      };
}

/** Связная компонента преобразования, записанная строками «входы → [шаг] → выходы». */
function buildChainText(
  trNodeId: string,
  nodes: CustomNode[],
  edges: Edge[],
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Неориентированный обход: цепочка вокруг преобразования целиком, независимо
  // от того, строилась она вверх или вниз.
  const neighbors = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const arr = neighbors.get(a);
    if (arr) arr.push(b);
    else neighbors.set(a, [b]);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  const seen = new Set<string>([trNodeId]);
  const stack = [trNodeId];
  const component = new Set<string>([trNodeId]);
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const next of neighbors.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      component.add(next);
      stack.push(next);
    }
  }

  const lines: string[] = [];
  for (const id of component) {
    const node = byId.get(id);
    if (node?.type !== "transformation") continue;

    const ins = edges
      .filter((e) => e.target === id)
      .map((e) => label(byId.get(e.source)))
      .filter(Boolean);
    const outs = edges
      .filter((e) => e.source === id)
      .map((e) => label(byId.get(e.target)))
      .filter(Boolean);
    if (!ins.length && !outs.length) continue;

    const left = ins.length ? ins.map((s) => `«${s}»`).join(" + ") : "?";
    const right = outs.length ? outs.map((s) => `«${s}»`).join(" + ") : "?";
    lines.push(`${left} → [${label(node) || "преобразование"}] → ${right}`);
  }

  return lines.slice(0, MAX_CHAIN_LINES).join("\n");
}

/** Источники продукта из данных узла (в пуле после загрузки сейва они облегчённые). */
function sourcesOfProductNode(
  node: CustomNode | undefined,
  direction: BuildDirection,
): TechnologySource[] {
  if (!node) return [];
  const key = direction === "up" ? "sourcesUp" : "sourcesDown";
  const own = node.data?.[key];
  const legacy = node.data?.sources;
  const list = Array.isArray(own) && own.length ? own : legacy;
  return Array.isArray(list) ? (list as TechnologySource[]) : [];
}

/** Текстовые сведения: описания преобразования и продуктов + тексты источников. */
function buildProcessDescription(
  trNode: CustomNode | undefined,
  productNodes: CustomNode[],
  direction: BuildDirection,
): string {
  const parts: string[] = [];

  const trDesc = description(trNode);
  if (trDesc) {
    parts.push(`Преобразование «${label(trNode)}»:\n${trDesc}`);
  }

  const aggregated = String(trNode?.data?.aggregatedDescription ?? "").trim();
  if (aggregated) {
    parts.push(`Обобщённое описание шага:\n${aggregated}`);
  }

  for (const p of productNodes) {
    const desc = description(p);
    if (desc) parts.push(`Продукт «${label(p)}»:\n${desc}`);
  }

  // Источники продуктов шага: их technology_description и есть основной
  // фактический материал, по которому модель описывает переход.
  const seenUrls = new Set<string>();
  const blocks: string[] = [];
  for (const p of productNodes) {
    for (const s of sourcesOfProductNode(p, direction)) {
      const text = String(s?.technology_description ?? "").trim();
      if (!text) continue;
      const key = String(s?.url ?? s?.title ?? text).trim().toLowerCase();
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      blocks.push(
        `Источник «${String(s?.title ?? "").trim() || s?.url || "без названия"}»:\n${clip(
          text,
          MAX_SOURCE_CHARS,
        )}`,
      );
      if (blocks.length >= MAX_SOURCE_BLOCKS) break;
    }
    if (blocks.length >= MAX_SOURCE_BLOCKS) break;
  }
  parts.push(...blocks);

  return parts.join("\n\n").trim();
}

/**
 * Собрать переменные промпта для узла-преобразования.
 * `directionOverride` — выбор пользователя во вкладке (иначе направление шага
 * берётся из данных узла).
 */
export function buildTechDescriptionContext(
  trNodeId: string,
  nodes: CustomNode[],
  edges: Edge[],
  directionOverride?: BuildDirection,
): TechDescriptionContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trNode = byId.get(trNodeId);

  const inputNodes = edges
    .filter((e) => e.target === trNodeId)
    .map((e) => byId.get(e.source))
    .filter((n): n is CustomNode => !!n && n.type === "product");
  const outputNodes = edges
    .filter((e) => e.source === trNodeId)
    .map((e) => byId.get(e.target))
    .filter((n): n is CustomNode => !!n && n.type === "product");

  const inputProducts = inputNodes.map(label).filter(Boolean);
  const outputProducts = outputNodes.map(label).filter(Boolean);

  const direction: BuildDirection =
    directionOverride ??
    (trNode?.data?.chainDirection as BuildDirection | undefined) ??
    (trNode?.data?.stepAltDirection as BuildDirection | undefined) ??
    "down";

  const { currentProduct, additionalProduct } = pickProductsForDirection(
    direction,
    inputProducts,
    outputProducts,
  );

  return {
    direction,
    inputProducts,
    outputProducts,
    currentProduct,
    additionalProduct,
    existingChain: buildChainText(trNodeId, nodes, edges),
    processDescription: buildProcessDescription(
      trNode,
      [...inputNodes, ...outputNodes],
      direction,
    ),
  };
}
