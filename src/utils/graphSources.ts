import type { CustomNode } from "../types";
import type { BuildDirection, SourcesPoolEntry } from "../store/types";
import { collectSourceGroups, type SourceItem } from "./sourceRows";
import { isLocalSource, localSourceTag } from "./sourceOrigin";

/** Одна строка таблицы источников графа. */
export interface GraphSourceRow {
  id: string;
  /** Узел графа, к которому привязан источник. */
  objectLabel: string;
  objectKind: "product" | "transformation";
  /** Направление построения, для которого источник искали. У преобразований нет. */
  direction: BuildDirection | null;
  title: string;
  url: string;
  /**
   * Подпись вместо адреса: у раздела документа из базы — «ИТС 18—202_ ·
   * стр. 14–42», у сайта — домен.
   */
  tag: string;
  /** Раздел документа из базы сервера. */
  local: boolean;
  /** Найден моделью раньше и взят из базы сервера. */
  saved: boolean;
  /** Источники унаследованы от этого продукта-предка (иначе null). */
  inheritedFrom: string | null;
}

/** Домен вместо адреса: в узкой строке «https://…» ничего не сообщает. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Подпись и происхождение источника для строки списка. */
function describe(s: Pick<SourceItem, "url" | "origin" | "page" | "docTitle" | "pages" | "savedAt">) {
  const local = isLocalSource(s);
  return {
    tag: local ? localSourceTag(s) : hostOf(s.url),
    local,
    saved: !!s.savedAt,
  };
}

export interface GraphSourcesSummary {
  rows: GraphSourceRow[];
  total: number;
  products: number;
  transformations: number;
}

/** Читаемое имя источника из URL, когда своего заголовка нет. */
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Все источники текущего графа одним плоским списком.
 *
 * Источники живут в двух местах и собираются отсюда вместе: у продуктов — в
 * пуле по ключу «продукт × направление», у преобразований — списком ссылок в
 * `data.transformationSources`. Унаследованные наборы в счётчики не идут,
 * чтобы набор предка не учитывался дважды, но в списке остаются с пометкой.
 */
export function collectGraphSources(
  nodes: CustomNode[],
  sourcesPool: Record<string, SourcesPoolEntry>,
  poolKey: (label: string, direction: BuildDirection) => string,
): GraphSourcesSummary {
  const productLabels = [
    ...new Set(
      nodes
        .filter((n) => n.type === "product")
        .map((n) => String(n.data?.label ?? ""))
        .filter(Boolean),
    ),
  ];

  const rows: GraphSourceRow[] = [];
  let products = 0;

  for (const group of collectSourceGroups(productLabels, sourcesPool, poolKey)) {
    for (const s of group.sources) {
      rows.push({
        id: `${group.id}::${s.url || s.title}`,
        objectLabel: group.product,
        objectKind: "product",
        direction: group.direction,
        title: s.title || titleFromUrl(s.url),
        url: s.url,
        ...describe(s),
        inheritedFrom: group.inheritedFrom,
      });
    }
    if (!group.inheritedFrom) products += group.sources.length;
  }

  let transformations = 0;
  const seenTransform = new Set<string>();

  for (const n of nodes) {
    if (n.type !== "transformation") continue;
    const urls = n.data?.transformationSources;
    if (!Array.isArray(urls) || !urls.length) continue;
    const label = String(n.data?.label ?? "");

    for (const url of urls) {
      if (typeof url !== "string" || !url.trim()) continue;
      const key = `${label}::${url.trim().toLowerCase()}`;
      if (seenTransform.has(key)) continue;
      seenTransform.add(key);

      rows.push({
        id: key,
        objectLabel: label,
        objectKind: "transformation",
        direction: null,
        title: titleFromUrl(url),
        url,
        ...describe({ url }),
        inheritedFrom: null,
      });
      transformations += 1;
    }
  }

  return {
    rows,
    total: products + transformations,
    products,
    transformations,
  };
}
