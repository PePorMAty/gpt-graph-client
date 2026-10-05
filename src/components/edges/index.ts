import { LoopEdge } from "./LoopEdge";

/** Свои типы связей полотна. Объект — вне компонента: React Flow требует,
 *  чтобы он не пересоздавался на каждый рендер. */
export const EDGE_TYPES = { loop: LoopEdge };
