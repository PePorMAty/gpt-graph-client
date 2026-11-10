// src/utils/nodeCodes.ts
//
// Коды продукта — CAS, ОКПД2, ТН ВЭД — и поиск узлов по ним.
//
// Коды те же, что видны в карточке (NodeIdentifiers, вкладка «Промышленное
// знание»): заданный вручную главнее кода реестра, код реестра — главнее кода
// ТН ВЭД по номеру CAS из таможенного реестра ЕС (ECICS), а тот — главнее
// подобранного по названию в классификаторе. Поиск по коду находит узел,
// только если этот код человек и увидит, открыв карточку: иначе находка
// выглядела бы необъяснимой.

import type { IndustryProductInfo } from "../store/api/industry-api";
import type { CustomNodeData } from "../types";
import { readCodeOverrides } from "../components/industry/codeOverrides";

export type NodeCodeKind = "cas" | "okpd2" | "tnved";

/** Откуда код: так же его подписывает карточка. */
export type NodeCodeSource = "manual" | "registry" | "customs" | "classifier" | "dictionary";

export interface NodeCode {
  kind: NodeCodeKind;
  code: string;
  source: NodeCodeSource;
}

export const NODE_CODE_LABEL: Record<NodeCodeKind, string> = {
  cas: "CAS",
  okpd2: "ОКПД2",
  tnved: "ТН ВЭД",
};

export const NODE_CODE_SOURCE_LABEL: Record<NodeCodeSource, string> = {
  manual: "задан вручную",
  registry: "из реестра",
  customs: "по номеру CAS (ECICS)",
  classifier: "по классификатору",
  dictionary: "справочник",
};

/**
 * Коды продукта: CAS из справочника, ОКПД2 и ТН ВЭД — заданные вручную, иначе
 * из записей реестра, иначе по названию в классификаторе. У ОКПД2, уточнённого
 * сервером по классификатору, — и код самих записей: его видно в карточке
 * («в реестре — …»), и по нему тоже ищут.
 */
export function nodeCodes(
  data: Partial<CustomNodeData> | null | undefined,
  info: IndustryProductInfo | null | undefined,
): NodeCode[] {
  const out: NodeCode[] = [];
  const add = (kind: NodeCodeKind, code: string | null | undefined, source: NodeCodeSource) => {
    const c = String(code ?? "").trim();
    if (c && !out.some((x) => x.kind === kind && x.code === c)) out.push({ kind, code: c, source });
  };
  const own = readCodeOverrides(data);

  add("cas", info?.cas, "dictionary");

  if (own.okpd2) add("okpd2", own.okpd2.code, "manual");
  else if (info?.found && info.okpd2) {
    add("okpd2", info.okpd2, "registry");
    add("okpd2", info.okpd2Registry, "registry");
  } else add("okpd2", info?.category?.code, "classifier");

  if (own.tnved) add("tnved", own.tnved.code, "manual");
  else if (info?.found && info.tnved) add("tnved", info.tnved, "registry");
  else if (info?.tnvedCas) add("tnved", info.tnvedCas.code, "customs");
  else add("tnved", info?.tnvedCategory?.code, "classifier");

  return out;
}

/** Что набрано в строке поиска, если это код. */
export interface CodeQuery {
  kind: NodeCodeKind;
  /** CAS и ОКПД2 — как набрано, ТН ВЭД — одни цифры. */
  value: string;
}

const digits = (s: string) => s.replace(/\D+/g, "");

/**
 * Код в строке поиска — по виду, пока его набирают:
 *
 *   • с дефисом — номер CAS: «71-43-2», «71-43»;
 *   • с точкой — ОКПД2: «20.14», «20.14.12.130»;
 *   • одни цифры (можно с пробелами) — ТН ВЭД: «2902», «2902 20 000».
 *
 * Меньше двух цифр — ещё не код: по «2» нашлась бы половина графа. Не код —
 * null: ищется только название.
 */
export function parseCodeQuery(raw: string): CodeQuery | null {
  const q = raw.trim();
  if (digits(q).length < 2) return null;
  if (/^\d{2,7}-\d{0,2}(?:-\d?)?$/.test(q)) return { kind: "cas", value: q };
  if (/^\d{2}(?:\.\d{0,3})+$/.test(q)) return { kind: "okpd2", value: q };
  if (/^\d[\d\s]*$/.test(q)) return { kind: "tnved", value: digits(q) };
  return null;
}

/**
 * Код узла, подходящий под набранный, — по началу: «2902» находит и «2902 20
 * 000», и «2902 30 000», «20.14» — всё под 20.14. ТН ВЭД сравнивается одними
 * цифрами: сервер пишет его с пробелами («2902 20 000 0»), а набирают как
 * угодно.
 */
export function matchCode(codes: NodeCode[], query: CodeQuery): NodeCode | null {
  return (
    codes.find(
      (c) =>
        c.kind === query.kind &&
        (query.kind === "tnved"
          ? digits(c.code).startsWith(query.value)
          : c.code.startsWith(query.value)),
    ) ?? null
  );
}
