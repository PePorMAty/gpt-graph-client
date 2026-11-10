// Как построенный шаг ложится на полотно (stepToFlow) и как он раздвигает
// заготовки альтернатив (nudgeStepPlaceholders).

import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type { StepChainApiStep } from "../store/types";
import { nudgeStepPlaceholders, stepToFlow } from "./stepToFlow";

const node = (id: string, label: string, x: number, y: number, type = "product"): CustomNode =>
  ({ id, type, position: { x, y }, data: { label } }) as CustomNode;
const P = (name: string, existing?: string) => ({
  name,
  description: "",
  isExisting: !!existing,
  existingNodeLabel: existing,
});
const step = (
  name: string,
  inputs: ReturnType<typeof P>[],
  outputs: ReturnType<typeof P>[],
  byproducts: ReturnType<typeof P>[] = [],
) => ({ transformation: { id: "tr-1", name }, inputProducts: inputs, outputProducts: outputs, byproducts }) as unknown as StepChainApiStep;

const run = (s: StepChainApiStep, anchorId: string, nodes: CustomNode[], edges: Edge[] = []) => {
  const a = nodes.find((n) => n.id === anchorId)!;
  return stepToFlow(s, {
    sessionKey: `${anchorId}::down`,
    rootNodeId: anchorId,
    direction: "down",
    anchorNodeId: anchorId,
    anchorX: a.position.x,
    anchorY: a.position.y,
    stepNumber: 1,
    existingNodes: nodes,
    existingEdges: edges,
  });
};
const label = (nodes: CustomNode[], id: string) => nodes.find((n) => n.id === id)?.data.label ?? id;

describe("stepToFlow: шаг «вниз»", () => {
  const phenol = node("phenol", "Фенол", 0, 0);
  const r = run(
    step("Синтез смол", [P("Фенол", "Фенол"), P("Формальдегид")], [P("Фенолоформальдегидные смолы")], [P("Метанол")]),
    "phenol",
    [phenol],
  );
  const all = [phenol, ...r.nodes];
  const links = r.edges.map((e) => `${label(all, e.source)} → ${label(all, e.target)}`);

  it("раскрываемый продукт не дублируется, второе сырьё и продукт — новые узлы", () => {
    expect(r.nodes.map((n) => n.data.label).sort()).toEqual(
      ["Метанол", "Синтез смол", "Фенолоформальдегидные смолы", "Формальдегид"].sort(),
    );
  });

  it("связи: оба сырья → преобразование → продукт и побочный", () => {
    expect(links.sort()).toEqual(
      [
        "Синтез смол → Метанол",
        "Синтез смол → Фенолоформальдегидные смолы",
        "Фенол → Синтез смол",
        "Формальдегид → Синтез смол",
      ].sort(),
    );
  });

  it("побочный продукт — пунктирная связь с пометкой", () => {
    const e = r.edges.find((x) => label(all, x.target) === "Метанол")!;
    expect(e.className).toContain("edge--byproduct");
    expect(e.data).toMatchObject({ tFlow: "out", byproduct: true });
  });

  it("продукт ниже раскрываемого, второе сырьё — на его уровне", () => {
    const y = (l: string) => r.nodes.find((n) => n.data.label === l)!.position.y;
    expect(y("Синтез смол")).toBeGreaterThan(0);
    expect(y("Фенолоформальдегидные смолы")).toBeGreaterThan(y("Синтез смол"));
    expect(y("Формальдегид")).toBe(0);
  });
});

describe("stepToFlow: побочный продукт, который уже стоит выше по цепочке", () => {
  // Фенол → [Синтез ДФК] → Дифенилкарбонат; шаг от ДФК даёт поликарбонат и побочный фенол.
  const nodes = [
    node("phenol", "Фенол", 0, 0),
    node("tr-dpc", "Синтез дифенилкарбоната", 0, 180, "transformation"),
    node("dpc", "Дифенилкарбонат", 0, 400),
  ];
  const edges = [
    { id: "e1", source: "phenol", target: "tr-dpc" },
    { id: "e2", source: "tr-dpc", target: "dpc" },
  ] as Edge[];
  const r = run(
    step("Поликонденсация", [P("Дифенилкарбонат", "Дифенилкарбонат"), P("Бисфенол А")], [P("Поликарбонат")], [P("Фенол", "Фенол")]),
    "dpc",
    nodes,
    edges,
  );

  it("второго узла «Фенол» нет — связь назад к существующему", () => {
    expect(r.nodes.map((n) => n.data.label)).not.toContain("Фенол");
    const back = r.edges.find((e) => e.target === "phenol" || e.source === "phenol")!;
    expect(back.className).toContain("edge--recycle");
    expect(back.data).toMatchObject({ recycle: true, byproduct: true });
  });

  it("шаг не считается петлёй — фенол записан как возврат побочного", () => {
    expect(r.stepRecord.byproductRecycleNames).toEqual(["Фенол"]);
    expect(r.nodes.map((n) => n.data.label)).toContain("Поликарбонат");
  });
});

describe("nudgeStepPlaceholders: альтернативы не налезают друг на друга", () => {
  const ROOT = "root";
  const alt = (i: number, x: number, title: string) =>
    ({
      id: `step::${ROOT}::down::alt::${i}`,
      type: "transformation",
      position: { x, y: 400 },
      data: { label: title, chainVariant: "alt", chainRootNodeId: ROOT },
    }) as CustomNode;
  const width = 260; // NODE_W + зазор в resolveChainOverlap
  const apart = (xs: number[]) => xs.every((x, i) => xs.slice(i + 1).every((y) => Math.abs(x - y) >= width));

  it("шаг лёг на «Капролактам» — тот уходит за «Алкилфенолы», а не на них", () => {
    const alts = [alt(0, -300, "Бисфенол А"), alt(1, 300, "Капролактам"), alt(2, -600, "Дифенилкарбонат"), alt(3, 600, "Алкилфенолы")];
    const fresh = [
      node("tr", "Синтез смол", 150, 200, "transformation"),
      node("p", "Фенолоформальдегидные смолы", 150, 400),
      node("co", "Формальдегид", 300, 0),
    ];
    const moved = nudgeStepPlaceholders(fresh, [node(ROOT, "Фенол", 0, 0), ...alts, ...fresh], ROOT);
    const x = new Map(alts.map((a) => [a.data.label, a.position.x]));
    for (const m of moved) x.set(alts.find((a) => a.id === m.id)!.data.label, m.position.x);
    // Заготовки в ряду y=400 и продукт шага — без наложений, порядок справа сохранён.
    expect(apart([...x.values(), 150])).toBe(true);
    expect(x.get("Капролактам")!).toBeLessThan(x.get("Алкилфенолы")!);
  });

  it("слева три заготовки подряд — сдвигаются цепочкой", () => {
    const alts = [alt(0, -300, "А"), alt(2, -600, "Б"), alt(4, -900, "В"), alt(1, 300, "Г")];
    const fresh = [node("tr", "Синтез", -200, 200, "transformation"), node("p", "Продукт", -250, 400)];
    const moved = nudgeStepPlaceholders(fresh, [node(ROOT, "Фенол", 0, 0), ...alts, ...fresh], ROOT);
    expect(moved.map((m) => m.id.split("::").pop())).toEqual(["0", "2", "4"]);
    const row = [...moved.map((m) => m.position.x), -250, 300];
    expect(apart(row)).toBe(true);
  });

  it("шаг никого не задел — никто не двигается", () => {
    const alts = [alt(0, -300, "А"), alt(1, 300, "Б")];
    const fresh = [node("tr", "Синтез", 0, 200, "transformation"), node("p", "Продукт", 0, 600)];
    expect(nudgeStepPlaceholders(fresh, [node(ROOT, "Фенол", 0, 0), ...alts, ...fresh], ROOT)).toEqual([]);
  });
});
