import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { buildChatSlice, CHAT_SLICE_LIMITS } from "./chatSlice";
import { CHAT_PROPOSAL_KINDS, isKnownProposal, readNdjson, type ChatEvent } from "../store/api/chat-api";
import { conversationKey, historyFor, type ChatMessage } from "../components/chat/chatStore";

const node = (id: string, type: string, label: string, data: Record<string, unknown> = {}) =>
  ({ id, type, position: { x: 0, y: 0 }, data: { label, ...data } }) as unknown as CustomNode;
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target }) as Edge;

describe("срез графа для чата", () => {
  const nodes = [
    node("p1", "product", "Кумол"),
    node("p2", "product", "Фенол", { description: "Ароматический спирт" }),
    node("p3", "product", "Ацетон"),
    node("t1", "transformation", "Кумольный способ"),
  ];
  const edges = [edge("p1", "t1"), edge("t1", "p2"), edge("t1", "p3")];

  it("продукты с id, преобразования — названиями сырья и продуктов", () => {
    const s = buildChatSlice(nodes, edges, { name: "Фенол" });
    expect(s.name).toBe("Фенол");
    expect(s.products).toEqual([
      { id: "p1", label: "Кумол" },
      { id: "p2", label: "Фенол" },
      { id: "p3", label: "Ацетон" },
    ]);
    expect(s.transformations).toEqual([{ id: "t1", label: "Кумольный способ", inputs: ["Кумол"], outputs: ["Фенол", "Ацетон"] }]);
    expect(s.selected).toBeNull();
  });

  it("выбранный продукт — с контекстом, преобразование — без", () => {
    const s = buildChatSlice(nodes, edges, { selectedNodeId: "p2" });
    expect(s.selected?.description).toBe("Ароматический спирт");
    expect(s.selected?.madeBy?.[0]?.name).toBe("Кумольный способ");
    expect(buildChatSlice(nodes, edges, { selectedNodeId: "t1" }).selected).toBeNull();
    // Одинокий узел без описания: контекста нет, название — есть.
    const lone = buildChatSlice([node("x", "product", "Бензол")], [], { selectedNodeId: "x" });
    expect(lone.selected).toBeNull();
    expect(lone.selectedLabel).toBe("Бензол");
  });

  it("альтернативы шага — не преобразования графа, а свой список: у какого продукта и куда", () => {
    const withAlt = [
      ...nodes,
      node("a1", "transformation", "Бисфенол А", { chainVariant: "alt" }),
      node("a2", "transformation", "Окисление толуола", { chainVariant: "alt" }),
    ];
    const s = buildChatSlice(withAlt, [...edges, edge("p2", "a1"), edge("a2", "p2")]);
    expect(s.transformations.map((t) => t.label)).toEqual(["Кумольный способ"]);
    expect(s.alternatives).toEqual([
      { id: "a1", label: "Бисфенол А", of: ["Фенол"], direction: "down" },
      { id: "a2", label: "Окисление толуола", of: ["Фенол"], direction: "up" },
    ]);
  });

  it("последние изменения графа — в срезе, не больше 10", () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({ title: `Шаг принят ${i}`, details: "«Синтез»: «Фенол» → «Смолы»" }));
    const s = buildChatSlice(nodes, edges, { recent });
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0]).toEqual({ title: "Шаг принят 0", details: "«Синтез»: «Фенол» → «Смолы»" });
    expect(buildChatSlice(nodes, edges).recent).toEqual([]);
  });

  it("найденные мастером источники продукта и последний расчёт баланса преобразования (20.11)", () => {
    const calc = {
      record: { id: 7, status: "partial", statusLabel: "partial", basis: "Кумол", sections: { notes: "" }, nature: null },
      nodeIds: {},
      addedAt: "2026-11-20T08:55:00Z",
    };
    const withData = [
      node("p1", "product", "Кумол", { sourcesUp: [{ title: "ИТС 18 · Производство кумола", url: "local://1" }] }),
      nodes[1],
      nodes[2],
      node("t1", "transformation", "Кумольный способ", { materialBalances: [calc] }),
    ];
    const pool: Record<string, { title: string; url: string }[]> = {
      "Фенол::down": [
        { title: "Бисфенол А — обзор", url: "https://a" },
        { title: "Бисфенол А — обзор", url: "https://a" },
        { title: "", url: "https://b" },
      ],
    };
    const s = buildChatSlice(withData, edges, {
      sourcesOf: (label, dir) => pool[`${label}::${dir}`] as never,
    });
    expect(s.products[0]).toEqual({ id: "p1", label: "Кумол", sources: { up: { count: 1, titles: ["ИТС 18 · Производство кумола"] } } });
    expect(s.products[1]).toEqual({ id: "p2", label: "Фенол", sources: { down: { count: 2, titles: ["Бисфенол А — обзор", "https://b"] } } });
    expect(s.products[2]).toEqual({ id: "p3", label: "Ацетон" });
    expect(s.transformations[0].balance).toMatchObject({ status: "Частично рассчитан", basis: "Кумол" });
  });

  it("большой граф — не больше пределов сервера", () => {
    const many = Array.from({ length: 700 }, (_, i) => node(`p${i}`, "product", `Продукт ${i}`));
    expect(buildChatSlice(many, []).products).toHaveLength(CHAT_SLICE_LIMITS.products);
  });
});

/** Поток из кусков — как их режет сеть. */
function streamOf(parts: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      parts.forEach((p) => c.enqueue(enc.encode(p)));
      c.close();
    },
  });
}

describe("поток ответа чата (NDJSON)", () => {
  it("строки собираются через границы кусков; битая строка пропускается", async () => {
    const events: ChatEvent[] = [];
    await readNdjson(
      streamOf([
        '{"type":"tool","name":"product_card","args":{},"summary":"карточка «Фе',
        'нол»"}\n{битая}\n{"type":"proposal","proposal":{"kind":"show","nodes":[]}}\n',
        '{"type":"done","reply":"Готово","proposals":[],"tools":[],"usage":{"requests":2,"tokens":10}}',
      ]),
      (e) => events.push(e),
    );
    expect(events.map((e) => e.type)).toEqual(["tool", "proposal", "done"]);
    expect(events[0]).toMatchObject({ summary: "карточка «Фенол»" });
  });
});

describe("история разговора для модели", () => {
  it("только текст, без ошибок, последние 12 реплик", () => {
    const msgs: ChatMessage[] = [
      ...Array.from({ length: 14 }, (_, i): ChatMessage => ({ id: `${i}`, role: i % 2 ? "assistant" : "user", content: `реплика ${i}` })),
      { id: "e", role: "assistant", content: "Не получилось: сеть", error: true },
    ];
    const h = historyFor(msgs);
    expect(h).toHaveLength(12);
    expect(h[0]).toEqual({ role: "user", content: "реплика 2" });
    expect(h.some((m) => m.content.startsWith("Не получилось"))).toBe(false);
  });
});

describe("предложения чата", () => {
  it("знакомые виды с полями — да; незнакомые и неполные — нет", () => {
    const ok = [
      { kind: "step", nodeId: "n1", label: "Фенол", direction: "down" },
      { kind: "show", nodes: [{ id: "n1", label: "Фенол" }] },
      { kind: "codes", nodes: [{ id: "n1", label: "Фенол" }], why: "кодов нет" },
      { kind: "balance", nodeId: "t1", label: "Кумольный способ" },
      { kind: "tech", nodeId: "t1", label: "Кумольный способ", nodeKind: "transformation" },
      { kind: "rename", nodeId: "n4", label: "Кумол", newLabel: "Изопропилбензол" },
      { kind: "merge", fromId: "n4", fromLabel: "Кумол", intoId: "n2", intoLabel: "Изопропилбензол (кумол)" },
    ];
    ok.push(
      { kind: "add", label: "Автомобиль", nearId: "n1", nearLabel: "Фенол" } as never,
      { kind: "sources", nodeId: "n1", label: "Фенол", direction: "up", web: true } as never,
      { kind: "delete", nodes: [{ id: "a1", label: "Бисфенол А" }] } as never,
      { kind: "layout" } as never,
      { kind: "unlayout" } as never,
      { kind: "alternatives", nodeId: "n1", label: "Фенол", direction: "up" } as never,
      { kind: "describe", nodeId: "n1", label: "Фенол", description: "Ароматический спирт." } as never,
      { kind: "fillcard", nodeId: "n1", label: "Фенол" } as never,
      { kind: "bookmark", nodes: [{ id: "n1", label: "Фенол" }], remove: true } as never,
    );
    expect(ok.map(isKnownProposal)).toEqual(ok.map(() => true));
    // Каждый вид, который клиент объявляет серверу, он и показывает.
    expect([...new Set(ok.map((p) => p.kind))].sort()).toEqual([...CHAT_PROPOSAL_KINDS].sort());
    const bad = [
      { kind: "delete_graph", nodeId: "n1" },
      { kind: "step", nodeId: "n1", label: "Фенол", direction: "sideways" },
      { kind: "show", nodes: [] },
      { kind: "rename", nodeId: "n4", label: "Кумол", newLabel: "" },
      { kind: "merge", fromId: "n4", fromLabel: "Кумол", intoId: "n2" },
      null,
    ];
    expect(bad.map(isKnownProposal)).toEqual(bad.map(() => false));
  });
});

describe("ключ разговора", () => {
  it("сохранённый граф — по номеру, черновик — по первому узлу", () => {
    expect(conversationKey("g-42", "n1")).toBe("g-42");
    // Новый граф начинается с нового узла — чат прежнего черновика в нём не всплывает.
    expect(conversationKey(null, "n1")).not.toBe(conversationKey(null, "n2"));
    expect(conversationKey(null, null)).toBe(conversationKey(null, null));
  });
});
