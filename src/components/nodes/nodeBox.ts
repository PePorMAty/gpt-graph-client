// src/components/nodes/nodeBox.ts
//
// Габариты и размер подписи узла на полотне + оценка его высоты для раскладки.
//
// В фокус-режиме камера вписывает всю окрестность в экран, масштаб падает, и
// подпись в 12px становится нечитаемой. Там узел рисуется крупнее: шрифт
// больше, поля меньше, а сам блок шире — по ширине запас есть (окрестность
// вытянута по вертикали), и длинные названия реже переносятся на вторую
// строку, то есть высота почти не растёт.

export type NodeBoxMetrics = {
  paddingY: number;
  paddingX: number;
  minWidth: number;
  maxWidth: number;
  fontSize: number;
  /** Множитель межстрочного интервала. */
  lineHeight: number;
};

/** Рамка узла — одинаковая в обоих видах, входит в габарит. */
const BORDER = 2;

const DEFAULT_BOX: NodeBoxMetrics = {
  paddingY: 15,
  paddingX: 15,
  minWidth: 180,
  maxWidth: 250,
  fontSize: 12,
  lineHeight: 1.3,
};

const COMPACT_FOCUS_BOX: NodeBoxMetrics = {
  paddingY: 11,
  paddingX: 14,
  minWidth: 200,
  maxWidth: 260,
  fontSize: 16,
  lineHeight: 1.25,
};

export function nodeBoxMetrics(focusCompact: boolean): NodeBoxMetrics {
  return focusCompact ? COMPACT_FOCUS_BOX : DEFAULT_BOX;
}

/** Инлайновые стили блока узла из его метрик. */
export function nodeBoxStyle(focusCompact: boolean) {
  const m = nodeBoxMetrics(focusCompact);
  return {
    padding: `${m.paddingY}px ${m.paddingX}px`,
    minWidth: `${m.minWidth}px`,
    maxWidth: `${m.maxWidth}px`,
    fontSize: `${m.fontSize}px`,
    lineHeight: String(m.lineHeight),
  };
}

/**
 * Средняя ширина знака в долях кегля. Подписи узлов — русские названия
 * продуктов и процессов; коэффициент выверен по реальным замерам DOM (см.
 * комментарий в utils/focusLayoutSpacing.ts). Небольшой перебор безопаснее
 * недобора: лишняя строка в оценке лишь чуть раздвинет ранги, а нехватка —
 * наложит узлы друг на друга.
 */
const AVG_CHAR_RATIO = 0.52;

/**
 * Оценка габарита узла ДО отрисовки — раскладке нужны размеры заранее, а
 * измеренные React Flow появляются только после первого кадра (и относятся к
 * предыдущему виду узла). Высота считается по числу строк, на которые
 * перенесётся подпись в доступной ширине.
 *
 * ВАЖНО: у блока узла box-sizing по умолчанию (content-box), поэтому minWidth
 * и maxWidth задают ширину ТЕКСТА, а поля и рамка добавляются сверху.
 */
export function estimateNodeSize(
  label: string,
  focusCompact: boolean,
): { width: number; height: number } {
  const m = nodeBoxMetrics(focusCompact);
  const textWidth = label.length * m.fontSize * AVG_CHAR_RATIO;
  const contentWidth = Math.min(m.maxWidth, Math.max(m.minWidth, textWidth));
  const lines = Math.max(1, Math.ceil(textWidth / m.maxWidth));
  const frameX = m.paddingX * 2 + BORDER * 2;
  const frameY = m.paddingY * 2 + BORDER * 2;
  return {
    width: Math.round(contentWidth) + frameX,
    height: Math.round(lines * m.fontSize * m.lineHeight) + frameY,
  };
}
