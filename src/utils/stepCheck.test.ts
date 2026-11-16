// Проверка шага моделью: что уходит на сервер и как исправление ложится на
// шаг превью и на узлы графа. Пример — шаг 2026-11-11: от «Этилцеллозольва»
// модель дала «этилацетат», а из этилцеллозольва и уксусной кислоты получают
// этилцеллозольвацетат.

import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { StepCheckResult } from "../store/api/step-check-api";
import type { StepChainApiStep } from "../store/types";
import type { CustomNode } from "../types";
import { applyStepFix, graphFixes, linkedElsewhere, stepCheckBody } from "./stepCheck";

const step: StepChainApiStep = {
  transformation: { id: "tr-1", name: "Синтез этилацетата из этилцеллозольва", description: "Этерификация.", notes: ["Катализатор — серная кислота."] },
  inputProducts: [{ name: "Уксусная кислота", isExisting: false }],
  outputProducts: [
    { name: "Этилацетат", description: "Растворитель.", industry: "Химия", mainPurpose: "Растворитель для клеёв", isExisting: true, existingNodeLabel: "Этилацетат", productId: "этилацетат" },
  ],
  byproducts: [{ name: "Вода", isExisting: false }],
} as StepChainApiStep;

const fix: StepCheckResult = {
  verdict: "fix",
  summary: "Из этилцеллозольва получают этилцеллозольвацетат.",
  renames: [{ from: "Этилацетат", to: "Этилцеллозольвацетат (2-этоксиэтилацетат)", description: "Растворитель лаков." }],
  transformation: { name: "Этерификация этилцеллозольва уксусной кислотой" },
};

describe("stepCheckBody", () => {
  it("раскрываемый продукт — на своей стороне шага и под запретом переименования", () => {
    const body = stepCheckBody(step, "Этилцеллозольв", "down");
    expect(body.inputs.map((p) => p.name)).toEqual(["Этилцеллозольв", "Уксусная кислота"]);
    expect(body.outputs).toEqual([{ name: "Этилацетат", description: "Растворитель." }]);
    expect(body.byproducts).toEqual([{ name: "Вода" }]);
    expect(body.anchor).toBe("Этилцеллозольв");
    // Шаг вверх: якорь — продукт; уже названный модель не дублируем.
    const up = stepCheckBody(step, "этилацетат", "up");
    expect(up.outputs.map((p) => p.name)).toEqual(["Этилацетат"]);
  });
});

describe("applyStepFix", () => {
  it("переименованный продукт — новый: без идентификатора, совпадения с узлом и назначения", () => {
    const fixed = applyStepFix(step, fix);
    expect(fixed.outputProducts).toEqual([
      { name: "Этилцеллозольвацетат (2-этоксиэтилацетат)", description: "Растворитель лаков.", industry: "Химия", isExisting: false },
    ]);
    // Нетронутые продукты — те же объекты.
    expect(fixed.inputProducts[0]).toBe(step.inputProducts[0]);
    expect(fixed.transformation.id).toBe("tr-1");
    expect(fixed.transformation.name).toBe("Этерификация этилцеллозольва уксусной кислотой");
    // Описания преобразования модель не дала — остаётся прежнее.
    expect(fixed.transformation.description).toBe("Этерификация.");
    expect(fixed.transformation.notes).toEqual([
      "Катализатор — серная кислота.",
      "Исправлено проверкой шага: Из этилцеллозольва получают этилцеллозольвацетат.",
    ]);
  });

  it("ok и wrong шаг не меняют", () => {
    expect(applyStepFix(step, { ...fix, verdict: "ok" })).toBe(step);
    expect(applyStepFix(step, { ...fix, verdict: "wrong" })).toBe(step);
  });
});

describe("graphFixes и linkedElsewhere", () => {
  const n = (id: string, type: string, label: string) => ({ id, type, position: { x: 0, y: 0 }, data: { label } }) as CustomNode;
  const nodes = [
    n("t0", "transformation", "Синтез этилцеллозольва"),
    n("p1", "product", "Этилцеллозольв"),
    n("p2", "product", "Уксусная кислота"),
    n("t1", "transformation", "Синтез этилацетата из этилцеллозольва"),
    n("p3", "product", "Этилацетат"),
  ];
  const edges = [
    { id: "e0", source: "t0", target: "p1" },
    { id: "e1", source: "p1", target: "t1" },
    { id: "e2", source: "p2", target: "t1" },
    { id: "e3", source: "t1", target: "p3" },
  ] as Edge[];

  it("продукт, связанный с другим преобразованием, — на графе в другом шаге", () => {
    expect(linkedElsewhere("p1", "t1", nodes, edges)).toBe(true);
    expect(linkedElsewhere("p2", "t1", nodes, edges)).toBe(false);
    expect(linkedElsewhere("p3", "t1", nodes, edges)).toBe(false);
  });

  it("правки узлов: продукт по названию, преобразование по id", () => {
    const products = [
      { id: "p1", name: "Этилцеллозольв" },
      { id: "p2", name: "Уксусная кислота" },
      { id: "p3", name: "этилацетат" },
    ];
    expect(graphFixes(fix, products, { id: "t1", name: "Синтез этилацетата из этилцеллозольва" })).toEqual([
      { nodeId: "p3", from: "этилацетат", label: "Этилцеллозольвацетат (2-этоксиэтилацетат)", description: "Растворитель лаков." },
      { nodeId: "t1", from: "Синтез этилацетата из этилцеллозольва", label: "Этерификация этилцеллозольва уксусной кислотой" },
    ]);
    expect(graphFixes({ ...fix, verdict: "wrong" }, products, { id: "t1", name: "x" })).toEqual([]);
  });
});
