// Строка состояния: длина цепочки — в шагах, а не в продуктах.

import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { computeViewportStats, graphChainLength } from "./viewportStats";

const node = (id: string, type: "product" | "transformation", x: number): CustomNode =>
  ({ id, type, position: { x, y: 0 }, data: { label: id } }) as CustomNode;
const edge = (source: string, target: string): Edge => ({ id: `${source}->${target}`, source, target });
const view = { x: 0, y: 0, zoom: 1, width: 10000, height: 1000 };

// Фенол → капролактам → полиамид-6 → нити: три шага, четыре продукта.
const nodes = [
  node("Фенол", "product", 0),
  node("t1", "transformation", 300),
  node("Капролактам", "product", 600),
  node("t2", "transformation", 900),
  node("Полиамид-6", "product", 1200),
  node("t3", "transformation", 1500),
  node("Нити", "product", 1800),
];
const edges = [
  edge("Фенол", "t1"),
  edge("t1", "Капролактам"),
  edge("Капролактам", "t2"),
  edge("t2", "Полиамид-6"),
  edge("Полиамид-6", "t3"),
  edge("t3", "Нити"),
];

describe("длина цепочки", () => {
  it("строка состояния считает шаги: три шага — 3, а не 4", () => {
    expect(computeViewportStats(nodes, edges, view).chainSteps).toBe(3);
  });

  it("один продукт без шагов — 0 шагов", () => {
    expect(computeViewportStats([nodes[0]], [], view).chainSteps).toBe(0);
  });

  it("уровни в библиотеке — по-прежнему продукты", () => {
    expect(graphChainLength(nodes, edges)).toBe(4);
  });
});
