import React from "react";

/**
 * Значок закладки на узле полотна.
 *
 * Закладку ставят правым кликом, а увидеть её можно было только в разделе
 * «Закладки» левой панели: на самом полотне отмеченный узел ничем не
 * отличался от соседних. Значок стоит в левом нижнем углу — верхние углы
 * заняты бейджами источников, ГИСП и пометкой «не заполнен».
 */
export const BookmarkBadge: React.FC = () => (
  <div
    title="В закладках"
    aria-label="В закладках"
    style={{
      position: "absolute",
      bottom: -9,
      left: -9,
      width: 20,
      height: 20,
      borderRadius: 999,
      background: "#4f46e5",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      zIndex: 11,
    }}
  >
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 3.5h11a1 1 0 0 1 1 1v15.3a.5.5 0 0 1-.78.41L12 16.4l-5.72 3.81a.5.5 0 0 1-.78-.41V4.5a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
    </svg>
  </div>
);
