import { useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  mergeGraphFromJson,
  replaceGraphFromJson,
} from "../../store/slices/gptSlice";
import {
  GraphParseError,
  parseProductGraphJson,
} from "../../utils/parseProductGraphJson";
import { buildLegend } from "../../utils/sourceColorRegistry";

import styles from "./UploadGraphTab.module.css";

type UploadMode = "replace" | "merge";

export const UploadGraphTab = () => {
  const dispatch = useAppDispatch();
  const { sourceRegistry, data } = useAppSelector((state) => state.graph);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasGraph = data.nodes.length > 0;

  const hasCommonNodes = useMemo(
    () =>
      data.nodes.some((n) => {
        if (n.type !== "product") return false;
        const sources = n.data?.sources;
        return Array.isArray(sources) && sources.length > 1;
      }),
    [data.nodes]
  );

  const legendEntries = useMemo(
    () => buildLegend(sourceRegistry, hasCommonNodes),
    [sourceRegistry, hasCommonNodes]
  );

  const handleFile = async (file: File, mode: UploadMode) => {
    setError(null);
    setInfo(null);
    try {
      const text = await file.text();
      if (!text.trim()) {
        throw new GraphParseError("Файл пуст");
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new GraphParseError("Некорректный JSON");
      }
      const parsed = parseProductGraphJson(json);
      if (parsed.nodes.length === 0) {
        throw new GraphParseError("В JSON нет узлов");
      }
      if (mode === "replace") {
        dispatch(replaceGraphFromJson(parsed));
        setInfo(
          `Загружено: ${parsed.nodes.length} узлов, ${parsed.edges.length} связей`
        );
      } else {
        dispatch(mergeGraphFromJson(parsed));
        setInfo(
          `Добавлено: ${parsed.nodes.length} узлов, ${parsed.edges.length} связей`
        );
      }
    } catch (e) {
      if (e instanceof GraphParseError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Неизвестная ошибка");
      }
    }
  };

  const onChangeFactory =
    (mode: UploadMode) => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await handleFile(file, mode);
    };

  return (
    <div className={styles.wrapper}>
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={onChangeFactory("replace")}
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={onChangeFactory("merge")}
      />

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => replaceInputRef.current?.click()}
        >
          Загрузить граф
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => mergeInputRef.current?.click()}
          disabled={!hasGraph}
          title={
            hasGraph
              ? "Добавить узлы из JSON к текущему графу"
              : "Сначала загрузите первый граф"
          }
        >
          Добавить граф
        </button>
      </div>

      <p className={styles.hint}>
        JSON ожидается в формате с полями <code>Цепочка</code>,{" "}
        <code>Связи</code> и <code>Название презентации</code>.
      </p>

      {error && <div className={styles.error}>⚠️ {error}</div>}
      {info && !error && <div className={styles.info}>✅ {info}</div>}

      <div className={styles.legendSection}>
        <h4 className={styles.legendTitle}>Легенда</h4>
        {legendEntries.length === 0 ? (
          <p className={styles.legendEmpty}>
            Загрузите граф, чтобы увидеть источники.
          </p>
        ) : (
          <ul className={styles.legend}>
            {legendEntries.map((e) => (
              <li
                key={e.name}
                className={`${styles.legendItem} ${
                  e.isCommon ? styles.legendItemCommon : ""
                }`}
              >
                <span
                  className={styles.swatch}
                  style={{ background: e.swatch }}
                  aria-hidden
                />
                <span className={styles.legendName}>{e.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
