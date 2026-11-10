import React from "react";

/**
 * Подписи материального баланса на узле (режим «Материальный баланс»).
 *
 * Прочие значки узла (источники, ГИСП, база, закладка) в режиме не
 * рисуются. На продукте подписи стоят там, где к нему подходят связи: сверху
 * — «продукт · 60 %» (в верх узла входит связь от преобразования, которое
 * его дало), снизу — «сырьё · 64 %» (от низа связь уходит к следующему).
 * Продукт одного расчёта, ставший сырьём следующего, несёт обе. Доля по
 * расчёту модели — синяя, поправленная вручную — тёмная, роль без доли
 * (ещё не посчитано) — светлая.
 */
const TONES = {
  share: {
    background: "#2563eb",
    color: "#fff",
    title:
      "Массовые проценты по расчёту материального баланса — от всей массы сырья: у сырья вместе это 100 %, у продукта — сколько его на эту массу",
  },
  edited: {
    background: "#1e3a8a",
    color: "#fff",
    title: "Массовые проценты, поправленные вручную во вкладке «Материальный баланс»",
  },
  role: {
    background: "#dbeafe",
    color: "#1e3a8a",
    title: "Роль продукта у выбранного преобразования: долю посчитает модель",
  },
} as const;

export const BalancePill: React.FC<{
  text: string;
  tone: keyof typeof TONES;
  /** Сверху — продукт расчёта, снизу — сырьё. */
  position?: "top" | "bottom";
}> = ({ text, tone, position = "bottom" }) => (
  <div
    title={TONES[tone].title}
    data-balance-pill={tone}
    data-balance-place={position}
    style={{
      position: "absolute",
      ...(position === "top" ? { top: -11 } : { bottom: -11 }),
      right: -10,
      maxWidth: 190,
      overflow: "hidden",
      textOverflow: "ellipsis",
      padding: "3px 8px",
      borderRadius: 999,
      background: TONES[tone].background,
      color: TONES[tone].color,
      border: tone === "role" ? "1px solid #93c5fd" : undefined,
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1.1,
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
      zIndex: 11,
    }}
  >
    {text}
  </div>
);
