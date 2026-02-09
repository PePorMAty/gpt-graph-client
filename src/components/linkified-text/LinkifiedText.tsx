import React from "react";

const URL_RE = /(https?:\/\/[^\s)]+)(?=[\s)]|$)/g;

export function LinkifiedText({ text }: { text: string }) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const url = match[1];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    // убираем хвостовую пунктуацию типа ";" "," "." если она прилипла к ссылке
    const cleanUrl = url.replace(/[.,;]+$/, "");
    const tail = url.slice(cleanUrl.length);

    parts.push(
      <a
        key={`${cleanUrl}-${index}`}
        href={cleanUrl}
        target="_blank"
        rel="noreferrer noopener"
        style={{ textDecoration: "underline" }}
        onClick={(e) => e.stopPropagation()}
      >
        {cleanUrl}
      </a>,
    );

    if (tail) parts.push(tail);

    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span style={{ whiteSpace: "pre-wrap" }}>{parts}</span>;
}
