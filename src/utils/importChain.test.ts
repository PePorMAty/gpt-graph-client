import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { importChain } from "./importChain";

const node = (id: string, type: string, label: string, x = 0, y = 0, data: Record<string, unknown> = {}) =>
  ({ id, type, position: { x, y }, data: { label, ...data } }) as unknown as CustomNode;
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target }) as Edge;

// Библиотека: бензол + пропилен → кумол → фенол + ацетон; у фенола — альтернатива.
const library = {
  nodes: [
    node("b", "product", "Бензол", 0, 0),
    node("pr", "product", "Пропилен", 200, 0),
    node("t1", "transformation", "Алкилирование", 100, 100, { materialBalances: [{ record: {} }] }),
    node("k", "product", "Кумол", 100, 200),
    node("t2", "transformation", "Кумольный способ", 100, 300),
    node("f", "product", "Фенол", 0, 400),
    node("a", "product", "Ацетон", 200, 400),
    node("alt", "transformation", "Окисление толуола", 300, 300, { chainVariant: "alt" }),
  ],
  edges: [edge("b", "t1"), edge("pr", "t1"), edge("t1", "k"), edge("k", "t2"), edge("t2", "f"), edge("t2", "a"), edge("alt", "f")],
};

let seq = 0;
const newId = () => `new-${++seq}`;

describe("кусок цепочки из библиотеки", () => {
  it("шаги вверх на два уровня: всё сырьё шага, продукты графа не дублируются, места — от якоря", () => {
    seq = 0;
    const graph = { nodes: [node("F", "product", "Фенол", 1000, 1000), node("A", "product", "ацетон", 1200, 1000)], edges: [] as Edge[] };
    const r = importChain(graph, library, { anchorId: "F", libraryNodeId: "f", direction: "up", depth: 2, newId })!;
    expect(r.transformations.sort()).toEqual(["Алкилирование", "Кумольный способ"]);
    expect(r.newProducts.sort()).toEqual(["Бензол", "Кумол", "Пропилен"]);
    expect(r.reusedProducts).toEqual(["Ацетон"]);
    // Альтернатива библиотеки не берётся.
    expect(r.nodes.some((n) => n.data.label === "Окисление толуола")).toBe(false);
    // Ацетон — тот, что был на графе: связь к нему, а не к копии.
    const t2 = r.nodes.find((n) => n.data.label === "Кумольный способ")!;
    expect(r.edges.some((e) => e.source === t2.id && e.target === "A")).toBe(true);
    expect(r.edges.some((e) => e.source === t2.id && e.target === "F")).toBe(true);
    // Сдвиг: фенол библиотеки (0, 400) → (1000, 1000), кумол (100, 200) → (1100, 800).
    expect(r.nodes.find((n) => n.data.label === "Кумол")!.position).toEqual({ x: 1100, y: 800 });
    // Расчёты баланса не переезжают: их обозначения — узлов библиотеки.
    expect(r.nodes.find((n) => n.data.label === "Алкилирование")!.data.materialBalances).toBeUndefined();
  });

  it("один уровень вниз; повторная вставка ничего не дублирует", () => {
    seq = 0;
    const graph = { nodes: [node("K", "product", "Кумол", 0, 0)], edges: [] as Edge[] };
    const once = importChain(graph, library, { anchorId: "K", libraryNodeId: "k", direction: "down", depth: 1, newId })!;
    expect(once.transformations).toEqual(["Кумольный способ"]);
    expect(once.newProducts.sort()).toEqual(["Ацетон", "Фенол"]);
    expect(once.edges).toHaveLength(3);
    const twice = importChain({ nodes: once.nodes, edges: once.edges }, library, { anchorId: "K", libraryNodeId: "k", direction: "down", depth: 1, newId })!;
    expect(twice.addedIds).toEqual([]);
    expect(twice.edges).toHaveLength(3);
  });

  it("продукта нет — null", () => {
    expect(importChain({ nodes: [], edges: [] }, library, { anchorId: "x", libraryNodeId: "f", direction: "up", depth: 1, newId })).toBeNull();
  });
});
