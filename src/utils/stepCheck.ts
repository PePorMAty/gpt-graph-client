// src/utils/stepCheck.ts
//
// Проверка шага моделью (store/api/step-check-api.ts): что ей отправить и как
// применить исправление — к шагу на превью и к узлам на графе.
//
// Исправление — переименования: процесс почти всегда настоящий, неверно
// названы продукты («этилацетат» из этилцеллозольва — на деле
// этилцеллозольвацетат). Переименованный продукт — уже другой продукт: его
// прежний идентификатор, «для чего нужен» и совпадение с узлом графа были про
// старое название и отбрасываются.

import type { Edge } from "@xyflow/react";

import type { StepCheckBody, StepCheckRename, StepCheckResult } from "../store/api/step-check-api";
import type { StepChainApiStep, StepProduct } from "../store/types";
import type { CustomNode } from "../types";
import { normalizeProductName } from "./normalizeProductName";

const brief = (p: { name: string; description?: string }) => ({
  name: p.name,
  ...(p.description?.trim() ? { description: p.description.trim() } : {}),
});

const same = (a: string, b: string) => a === b || normalizeProductName(a) === normalizeProductName(b);

/**
 * Тело проверки шага с превью. Раскрываемый продукт — на своей стороне шага,
 * даже если модель его не повторила (превью показывает его всегда), и
 * переименовывать его нельзя: он уже на полотне.
 */
export function stepCheckBody(
  step: StepChainApiStep,
  anchor: string,
  direction: "up" | "down",
): StepCheckBody {
  const withAnchor = (list: StepProduct[]) =>
    list.some((p) => same(p.name, anchor)) ? list.map(brief) : [{ name: anchor }, ...list.map(brief)];
  return {
    transformation: brief(step.transformation),
    inputs: direction === "down" ? withAnchor(step.inputProducts) : step.inputProducts.map(brief),
    outputs: direction === "up" ? withAnchor(step.outputProducts) : step.outputProducts.map(brief),
    ...(step.byproducts?.length ? { byproducts: step.byproducts.map(brief) } : {}),
    direction,
    anchor,
  };
}

function renameOf(renames: StepCheckRename[], name: string) {
  return renames.find((r) => r.from === name) ?? renames.find((r) => same(r.from, name));
}

/** Шаг превью с исправлением проверки. Без исправления — тот же объект. */
export function applyStepFix(step: StepChainApiStep, result: StepCheckResult): StepChainApiStep {
  if (result.verdict !== "fix") return step;
  const fix = (p: StepProduct): StepProduct => {
    const r = renameOf(result.renames, p.name);
    if (!r) return p;
    return {
      name: r.to,
      ...(r.description ? { description: r.description } : {}),
      // Отрасль у исправленного продукта обычно та же; назначение — про
      // прежний продукт.
      ...(p.industry ? { industry: p.industry } : {}),
      isExisting: false,
      ...(p.isUserAdded ? { isUserAdded: true } : {}),
    };
  };
  const t = result.transformation;
  const note = result.summary ? `Исправлено проверкой шага: ${result.summary}` : null;
  return {
    ...step,
    transformation: {
      ...step.transformation,
      ...(t ? { name: t.name, description: t.description || step.transformation.description } : {}),
      ...(note ? { notes: [...(step.transformation.notes ?? []), note] } : {}),
    },
    inputProducts: step.inputProducts.map(fix),
    outputProducts: step.outputProducts.map(fix),
    ...(step.byproducts ? { byproducts: step.byproducts.map(fix) } : {}),
  };
}

/** Узел — продукт, связанный с другим преобразованием, кроме этого. */
export function linkedElsewhere(
  productId: string,
  transformationId: string,
  nodes: CustomNode[],
  edges: Edge[],
): boolean {
  const isOtherT = (id: string) =>
    id !== transformationId && nodes.some((n) => n.id === id && n.type === "transformation");
  return edges.some(
    (e) => (e.source === productId && isOtherT(e.target)) || (e.target === productId && isOtherT(e.source)),
  );
}

/** Правка узла графа по исправлению. */
export interface NodeFix {
  nodeId: string;
  from: string;
  label: string;
  description?: string;
}

/**
 * Исправление проверки → правки узлов: продукты по названию среди узлов
 * преобразования, само преобразование — по его id.
 */
export function graphFixes(
  result: StepCheckResult,
  products: { id: string; name: string }[],
  transformation: { id: string; name: string },
): NodeFix[] {
  if (result.verdict !== "fix") return [];
  const out: NodeFix[] = [];
  for (const r of result.renames) {
    const node = products.find((p) => p.name === r.from) ?? products.find((p) => same(p.name, r.from));
    if (node && !out.some((f) => f.nodeId === node.id)) {
      out.push({ nodeId: node.id, from: node.name, label: r.to, ...(r.description ? { description: r.description } : {}) });
    }
  }
  if (result.transformation) {
    out.push({
      nodeId: transformation.id,
      from: transformation.name,
      label: result.transformation.name,
      ...(result.transformation.description ? { description: result.transformation.description } : {}),
    });
  }
  return out;
}
