// src/components/nodes/nodeBox.ts
//
// Габариты и размер подписи узла на полотне.
//
// В фокус-режиме с охватом больше одного шага камера вписывает всю окрестность
// в экран, масштаб падает, и подпись в 12px становится нечитаемой. Там узел
// рисуется крупнее: шрифт больше, поля меньше, а сам блок шире — по ширине
// запас есть (окрестность вытянута по вертикали), и длинные названия реже
// переносятся на вторую строку, то есть высота почти не растёт.
//
// Ширина держится в согласии с FOCUS_COMPACT_SPACING.nodeWidth: раскладка
// резервирует под узел именно эти пиксели.

export type NodeBoxStyle = {
  padding: string;
  minWidth: string;
  maxWidth: string;
  fontSize: string;
  lineHeight: string;
};

const DEFAULT_BOX: NodeBoxStyle = {
  padding: "15px",
  minWidth: "180px",
  maxWidth: "250px",
  fontSize: "12px",
  lineHeight: "1.3",
};

const COMPACT_FOCUS_BOX: NodeBoxStyle = {
  padding: "11px 14px",
  minWidth: "200px",
  maxWidth: "260px",
  fontSize: "16px",
  lineHeight: "1.25",
};

export function nodeBoxStyle(focusCompact: boolean): NodeBoxStyle {
  return focusCompact ? COMPACT_FOCUS_BOX : DEFAULT_BOX;
}
