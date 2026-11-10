// src/components/flow-panel/EndUseCheck.tsx
//
// «Что делают из продукта» — когда шаг «вниз» не нашёл продолжения.
//
// Тупик в построении значит только «в источниках нет переработки», а не «из
// продукта ничего не делают». Проверка ищет в интернете химическую
// переработку и применение как есть; найденные страницы сервер загружает и
// сверяет. Нашлась переработка — её источники можно сразу взять в шаг.

import { useState, type FC } from "react";

import { fetchEndUse, type EndUseResult } from "../../store/api/end-use-api";
import type { TechnologySource } from "../../store/types";
import { plural } from "../../utils/plural";
import wiz from "./StepWizard.module.css";
import css from "./EndUseCheck.module.css";

const checkMark = (c?: { status: "ok" | "unchecked"; reason?: string }) =>
  c?.status === "unchecked" ? ` · не проверен сервером (${c.reason ?? "сайт не пустил"})` : c?.status === "ok" ? " · проверен сервером" : "";

export const EndUseCheck: FC<{
  productName: string;
  /** Взять найденные превращения источниками шага (только добавляет). */
  onUseSources?: (sources: TechnologySource[]) => void;
}> = ({ productName, onUseSources }) => {
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [result, setResult] = useState<EndUseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);

  const run = async () => {
    setState("loading");
    setError(null);
    setTaken(false);
    try {
      setResult(await fetchEndUse(productName));
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("failed");
    }
  };

  return (
    <div className={css.box}>
      <p className={css.lead}>
        Тупик ещё не значит, что «{productName}» — конечный продукт: в найденных источниках просто нет
        его переработки. Проверка поищет в интернете, что из него делают — химическую переработку или
        применение как есть (рецептуры, смеси, готовый товар), — и сверит найденные страницы.
      </p>
      {state !== "loading" && (
        <button type="button" className={wiz.secondary} onClick={run}>
          {state === "idle" ? "Проверить, что из него делают" : "Проверить ещё раз"}
        </button>
      )}
      {state === "loading" && <p className={css.lead}>Ищем, что делают из «{productName}»…</p>}
      {state === "failed" && <div className={wiz.error}>Проверка не удалась: {error}</div>}

      {state === "done" && result && (
        <div className={css.result}>
          <p className={css.verdict}>
            {result.verdict === "processed"
              ? `Переработка есть: ${result.conversions.length} ${plural(result.conversions.length, "путь", "пути", "путей")}.`
              : result.verdict === "end_product"
                ? `Похоже, конечный продукт: химической переработки не нашлось, применяют как есть.`
                : `Ни переработки, ни применения в открытых источниках не нашлось — это не доказывает, что продукт конечный.`}
          </p>
          {result.summary && <p className={css.lead}>{result.summary}</p>}

          {result.conversions.length > 0 && (
            <ul className={css.list}>
              {result.conversions.map((c) => (
                <li key={c.url + c.product}>
                  <b>
                    {productName}
                    {c.coReactants.length ? ` + ${c.coReactants.join(" + ")}` : ""} → {c.product}
                  </b>
                  {c.process ? ` — ${c.process}` : ""}
                  <br />
                  <a href={c.url} target="_blank" rel="noreferrer noopener">
                    {c.title || c.url}
                  </a>
                  <span className={css.muted}>{checkMark(c.server_check)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.verdict === "processed" && onUseSources && (
            <button
              type="button"
              className={wiz.secondary}
              disabled={taken}
              onClick={() => {
                onUseSources(result.sources);
                setTaken(true);
              }}
            >
              {taken ? "Добавлено в источники — можно обобщить" : "Взять в источники шага"}
            </button>
          )}

          {result.uses.length > 0 && (
            <>
              <p className={css.sub}>Применяют как есть:</p>
              <ul className={css.list}>
                {result.uses.map((u) => (
                  <li key={u.url + u.use}>
                    <b>{u.use}</b>
                    {u.how ? ` — ${u.how}` : ""}
                    <br />
                    <a href={u.url} target="_blank" rel="noreferrer noopener">
                      {u.title || u.url}
                    </a>
                    <span className={css.muted}>{checkMark(u.server_check)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.dropped.length > 0 && (
            <p className={css.muted}>
              Отброшено проверкой сервера: {result.dropped.length}{" "}
              ({result.dropped.map((d) => d.reason).join("; ")}).
            </p>
          )}
        </div>
      )}
    </div>
  );
};
