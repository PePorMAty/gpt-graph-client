// Контекст продукта из графа для модели (определение кодов, позже — чат).
// Граф живого прогона 2026-11-17, достроенный до изделия: адипиновая
// кислота → нейлон 6,6 → волокно → корд → шина.

import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { CustomNode } from "../types";
import { contextNeighbours, contextSummary, productContext } from "./productContext";

const P = (id: string, label: string, data: Partial<CustomNode["data"]> = {}): CustomNode =>
  ({ id, type: "product", position: { x: 0, y: 0 }, data: { label, ...data } }) as CustomNode;
const T = (id: string, label: string, data: Partial<CustomNode["data"]> = {}): CustomNode =>
  ({ id, type: "transformation", position: { x: 0, y: 0 }, data: { label, ...data } }) as CustomNode;
const IN = (p: string, t: string): Edge => ({ id: `${p}>${t}`, source: p, target: t, data: { tFlow: "in" } });
const OUT = (t: string, p: string): Edge => ({ id: `${t}>${p}`, source: t, target: p, data: { tFlow: "out" } });

const nodes: CustomNode[] = [
  P("aa", "Адипиновая кислота"),
  P("hmda", "Гексаметилендиамин"),
  T("poly", "Поликонденсация нейлона 6,6", { description: "Длинное общее описание.", techDescriptionDown: "Соль АГ поликонденсируют в расплаве." }),
  P("pa", "Нейлон 6,6", { description: "Полиамид 6,6.", productId: "32131-17-2", productIdSource: "cas" }),
  T("spin", "Формование волокна", { description: "Расплав продавливают через фильеры." }),
  P("fiber", "Волокно нейлона 6,6", { description: "Комплексные нити.", industry: "Химические волокна" }),
  T("cord", "Изготовление корда"),
  P("tcord", "Шинный корд"),
  T("tyre", "Сборка шины"),
  P("rubber", "Резиновая смесь"),
  P("tire", "Шина"),
  // Альтернатива — не построенный вариант: в контекст не идёт.
  T("alt", "Литьё под давлением", { chainVariant: "alt" }),
];
const edges: Edge[] = [
  IN("aa", "poly"),
  IN("hmda", "poly"),
  OUT("poly", "pa"),
  IN("pa", "spin"),
  OUT("spin", "fiber"),
  IN("fiber", "cord"),
  OUT("cord", "tcord"),
  IN("tcord", "tyre"),
  IN("rubber", "tyre"),
  OUT("tyre", "tire"),
  IN("pa", "alt"),
];

describe("productContext", () => {
  it("карточка, как получают, во что идёт — с техописанием процессов", () => {
    const ctx = productContext("pa", nodes, edges)!;
    expect(ctx.description).toBe("Полиамид 6,6.");
    expect(ctx.cas).toBe("32131-17-2");
    expect(ctx.madeBy).toEqual([
      {
        name: "Поликонденсация нейлона 6,6",
        // Техописание шага главнее общего описания узла.
        description: "Соль АГ поликонденсируют в расплаве.",
        inputs: ["Адипиновая кислота", "Гексаметилендиамин"],
        outputs: ["Нейлон 6,6"],
      },
    ]);
    expect(ctx.usedIn?.map((p) => p.name)).toEqual(["Формование волокна"]);
  });

  it("путь вниз до изделия — от двух звеньев", () => {
    expect(productContext("fiber", nodes, edges)?.downstream).toEqual([["Шинный корд", "Шина"]]);
    expect(productContext("pa", nodes, edges)?.downstream).toEqual([["Волокно нейлона 6,6", "Шинный корд", "Шина"]]);
    // У изделия пути дальше нет.
    expect(productContext("tire", nodes, edges)?.downstream).toBeUndefined();
  });

  it("соседи и строка для окна", () => {
    const ctx = productContext("fiber", nodes, edges);
    expect(contextNeighbours(ctx, "Волокно нейлона 6,6")).toEqual({ usedFor: ["Шинный корд"], madeFrom: ["Нейлон 6,6"] });
    expect(contextSummary(ctx)).toBe("описание, 2 процесса рядом, путь до «Шина»");
  });

  it("одинокий узел без описания — null", () => {
    expect(productContext("x", [P("x", "Что-то")], [])).toBeNull();
  });
});
