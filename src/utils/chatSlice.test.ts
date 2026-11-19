import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { buildChatSlice, CHAT_SLICE_LIMITS } from "./chatSlice";
import { readNdjson, type ChatEvent } from "../store/api/chat-api";
import { historyFor, type ChatMessage } from "../components/chat/chatStore";

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
