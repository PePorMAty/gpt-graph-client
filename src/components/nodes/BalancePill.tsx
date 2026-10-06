import React from "react";

/**
 * Значки материального баланса на узле (режим «Материальный баланс»).
 *
 * Стоят в правом нижнем углу: верхние углы заняты источниками, ГИСП и
 * пометкой «не заполнен», левый нижний — закладкой. На продукте — роль в
 * расчёте и масса: «сырьё · 1 т», «продукт · ≈0,82 т». Базис расчёта —
 * тёмный, остальные массы — синие, роль без массы (пара ещё не посчитана) —
 * светлая. Коэффициент стадии на преобразовании — зелёный.
 */
const TONES = {
  mass: {
    background: "#2563eb",
    color: "#fff",
    title: "Роль и масса в открытом расчёте материального баланса",
  },
  basis: {
    background: "#1e3a8a",
    color: "#fff",
    title: "Базис расчёта: от этого количества посчитаны остальные",
  },
  role: {
    background: "#dbeafe",
    color: "#1e3a8a",
    title: "Роль продукта в выбранной паре: сколько — посчитает модель",
  },
  coefficient: {
    background: "#059669",
    color: "#fff",
    title: "Главный коэффициент стадии в открытом расчёте",
  },
} as const;

export const BalancePill: React.FC<{
  text: string;
  tone: keyof typeof TONES;
}> = ({ text, tone }) => (
  <div
    title={TONES[tone].title}
    data-balance-pill={tone}
    style={{
      position: "absolute",
      bottom: -11,
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

/** Сколько расчётов в направлении по подписи «↓2↑»: «↓2» — 2, «↓» — 1. */
const countOf = (arrows: string, arrow: string) => {
  const m = arrows.match(new RegExp(`${arrow}(\\d*)`));
  return m ? Number(m[1] || 1) : 0;
};

/**
 * У преобразования есть расчёты баланса: весы и направления со счётом пар —
 * «↓», «↓↑», «↓2↑».
 */
export const BalanceMark: React.FC<{ arrows: string }> = ({ arrows }) => (
  <div
    title={`Рассчитан материальный баланс: ${[
      countOf(arrows, "↓") ? `вниз (из сырья) — пар: ${countOf(arrows, "↓")}` : "",
      countOf(arrows, "↑") ? `вверх (на продукт) — пар: ${countOf(arrows, "↑")}` : "",
    ]
      .filter(Boolean)
      .join("; ")}`}
    data-balance-mark={arrows}
    style={{
      position: "absolute",
      top: -10,
      right: -10,
      display: "flex",
      alignItems: "center",
      gap: 3,
      padding: "2px 6px",
      borderRadius: 999,
      background: "#334155",
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1,
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      zIndex: 11,
    }}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0L5 7ZM19 7l-2.5 6a2.5 2.5 0 0 0 5 0L19 7Z" />
    </svg>
    {arrows}
  </div>
);
