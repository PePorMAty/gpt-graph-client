import React from "react";

/**
 * Подписи материального баланса на узле (режим «Материальный баланс»).
 *
 * Прочие значки узла (источники, ГИСП, база, закладка) в режиме не
 * рисуются. На продукте подписи стоят там, где к нему подходят связи: сверху
 * — «продукт · ≈0,82 т» (в верх узла входит связь от преобразования, которое
 * его дало), снизу — «сырьё · 1 т» (от низа связь уходит к следующему). Продукт
 * одного расчёта, ставший сырьём следующего, несёт обе. Заданное количество
 * сырья — тёмное, посчитанные массы — синие, роль без массы (пара ещё не
 * посчитана) — светлая. Выход пары на преобразовании — зелёный, снизу.
 */
const TONES = {
  mass: {
    background: "#2563eb",
    color: "#fff",
    title: "Посчитанная масса: сколько получится по расчёту материального баланса",
  },
  basis: {
    background: "#1e3a8a",
    color: "#fff",
    title: "Количество сырья, на которое посчитан расчёт: его задают во вкладке «Материальный баланс»",
  },
  role: {
    background: "#dbeafe",
    color: "#1e3a8a",
    title: "Роль продукта у выбранного преобразования: сколько — посчитает модель",
  },
  coefficient: {
    background: "#059669",
    color: "#fff",
    title: "Массовый выход: сколько процентов массы сырья становится продуктом пары",
  },
} as const;

export const BalancePill: React.FC<{
  text: string;
  tone: keyof typeof TONES;
  /** Сверху — продукт расчёта, снизу — сырьё и выход на преобразовании. */
  position?: "top" | "bottom";
  title?: string;
}> = ({ text, tone, position = "bottom", title }) => (
  <div
    title={title ?? TONES[tone].title}
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
