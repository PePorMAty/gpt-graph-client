// Отмена действий ИИ (предложение владельца 20.11, PG-MIGRATION.md 4.9).
//
// Перед первым действием ответа чат запоминает граф — узлы и связи, как
// они были. «Отменить действия этого ответа» (кнопка под ответом) и просьба
// «отмени» (действие undo) возвращают граф к снимку. Объединение и удаление
// иначе назад не вернуть, а автопилот делает их сам — без отмены ему
// страшно доверять.
//
// Снимки — в памяти страницы, не в разговоре: граф на сотни узлов в
// localStorage не поместится, а после перезагрузки граф и так другой.
// Состояние Redux неизменяемо, поэтому снимок — это ссылки на массивы, а
// не копия графа.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../../types";

interface Snapshot {
  msgId: string;
  nodes: CustomNode[];
  edges: Edge[];
  at: number;
}

/** Снимков — не больше: старше этих отменять уже не будут. */
const KEEP = 12;
let snapshots: Snapshot[] = [];
const listeners = new Set<() => void>();
/** Растёт при каждой перемене: снимок для useSyncExternalStore. */
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};
export const getUndoVersion = () => version;

export function subscribeUndo(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Граф до действий ответа msgId — один раз на ответ: первое действие. */
export function rememberBefore(msgId: string, graph: { nodes: CustomNode[]; edges: Edge[] }): void {
  if (snapshots.some((s) => s.msgId === msgId)) return;
  snapshots = [...snapshots, { msgId, nodes: graph.nodes, edges: graph.edges, at: Date.now() }].slice(-KEEP);
  notify();
}

/** Можно ли отменить действия этого ответа. */
export const canUndo = (msgId: string): boolean => snapshots.some((s) => s.msgId === msgId);

/** Последний ответ с действиями, которые ещё можно отменить. */
export const lastUndoable = (): string | null => snapshots.at(-1)?.msgId ?? null;

/**
 * Граф до действий ответа msgId. Снимки этого ответа и всех позже — больше
 * не нужны: граф уже раньше них.
 */
export function takeBefore(msgId: string): { nodes: CustomNode[]; edges: Edge[] } | null {
  const i = snapshots.findIndex((s) => s.msgId === msgId);
  if (i < 0) return null;
  const s = snapshots[i];
  snapshots = snapshots.slice(0, i);
  notify();
  return { nodes: s.nodes, edges: s.edges };
}

/** Другой граф или новый разговор — прежние снимки к нему не относятся. */
export function forgetUndo(): void {
  if (!snapshots.length) return;
  snapshots = [];
  notify();
}
