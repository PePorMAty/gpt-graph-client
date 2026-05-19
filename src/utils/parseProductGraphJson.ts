export interface ParsedNode {
  id: string;
  type: "product" | "transformation";
  label: string;
  sources: string[];
}

export interface ParsedEdge {
  id: string;
  source: string;
  target: string;
}

export interface ParseResult {
  presentationTitle: string | null;
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  presentations: string[];
}

export class GraphParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphParseError";
  }
}

interface RawNode {
  "Id узла"?: unknown;
  "Тип узла"?: unknown;
  "Название узла"?: unknown;
  "Из какой презентации"?: unknown;
  "Презентации"?: unknown;
}

interface RawEdge {
  "Id связи"?: unknown;
  "Откуда"?: unknown;
  "Куда"?: unknown;
}

const TYPE_MAP: Record<string, "product" | "transformation"> = {
  Продукт: "product",
  Преобразование: "transformation",
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseProductGraphJson(input: unknown): ParseResult {
  if (!input || typeof input !== "object") {
    throw new GraphParseError("Корневой объект отсутствует или не является объектом");
  }
  const root = input as Record<string, unknown>;

  const rawNodes = root["Цепочка"];
  const rawEdges = root["Связи"];
  if (!Array.isArray(rawNodes)) {
    throw new GraphParseError("Поле 'Цепочка' должно быть массивом");
  }
  if (!Array.isArray(rawEdges)) {
    throw new GraphParseError("Поле 'Связи' должно быть массивом");
  }

  const presentationTitle = asString(root["Название презентации"]);

  const seenPres = new Set<string>();
  const presentations: string[] = [];
  const recordPres = (p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    if (seenPres.has(trimmed)) return;
    seenPres.add(trimmed);
    presentations.push(trimmed);
  };

  const nodes: ParsedNode[] = [];
  for (const raw of rawNodes as RawNode[]) {
    if (!raw || typeof raw !== "object") continue;
    const id = asString(raw["Id узла"]);
    const label = asString(raw["Название узла"]);
    if (!id || !label) continue;

    const typeRaw = asString(raw["Тип узла"]) ?? "";
    const type: "product" | "transformation" =
      TYPE_MAP[typeRaw] ?? "product";

    let sources: string[] = [];
    const presArr = raw["Презентации"];
    if (Array.isArray(presArr) && presArr.length > 0) {
      sources = presArr
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p): p is string => Boolean(p));
    } else {
      const presStr = asString(raw["Из какой презентации"]) ?? "";
      sources = presStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (sources.length === 0 && presentationTitle) {
      sources = [presentationTitle];
    }
    sources.forEach(recordPres);

    nodes.push({ id, type, label, sources });
  }

  const edges: ParsedEdge[] = [];
  for (const raw of rawEdges as RawEdge[]) {
    if (!raw || typeof raw !== "object") continue;
    const source = asString(raw["Откуда"]);
    const target = asString(raw["Куда"]);
    if (!source || !target) continue;
    const id = asString(raw["Id связи"]) ?? `${source}->${target}`;
    edges.push({ id, source, target });
  }

  return {
    presentationTitle,
    nodes,
    edges,
    presentations,
  };
}
