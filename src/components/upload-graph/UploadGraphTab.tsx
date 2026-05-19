import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  loadGraphFromFile,
  mergeGraphFromFile,
  setGraphData,
} from "../../store/slices/gptSlice";
import { parseGraphJson } from "../../utils/parseGraphJson";
import { applyAutoLayout } from "../../utils/applyAutoLayout";
import {
  assignColorsForPresentations,
  buildLegend,
  colorForPresentations,
} from "../../utils/presentationColors";
import { mergeProductGraph } from "../../utils/mergeProductGraph";
import type { CustomNode } from "../../types";

import styles from "./UploadGraphTab.module.css";

type UploadMode = "replace" | "merge";

export const UploadGraphTab = () => {
  const dispatch = useAppDispatch();
  const { data, presentationColors, presentationOrientation } = useAppSelector(
    (state) => state.graph,
  );

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const hasGraph = data.nodes.length > 0;

  const hasCommonNodes = useMemo(
    () =>
      data.nodes.some((n) => {
        if (n.type !== "product") return false;
        const pres = n.data?.presentations;
        return Array.isArray(pres) && pres.length > 1;
      }),
    [data.nodes],
  );

  const legendEntries = useMemo(
    () => buildLegend(presentationColors, hasCommonNodes),
    [presentationColors, hasCommonNodes],
  );

  const colorizeNodes = (nodes: CustomNode[], registry: Record<string, string>) =>
    nodes.map((n) => {
      if (n.type !== "product") return n;
      const pres = Array.isArray(n.data?.presentations)
        ? (n.data.presentations as string[])
        : [];
      return {
        ...n,
        data: {
          ...n.data,
          presentationColor: colorForPresentations(pres, registry),
        },
      };
    });

  const handleReplace = async (file: File) => {
    const text = await file.text();
    const result = parseGraphJson(text);
    const {
      payload,
      warnings,
      needsLayout,
      presentations,
      presentationTitle,
      orientation,
    } = result;

    const registry = assignColorsForPresentations({}, presentations);
    const coloredNodes = colorizeNodes(payload.nodes, registry);

    let finalNodes = coloredNodes;
    let finalEdges = payload.edges;
    if (needsLayout) {
      const laid = await applyAutoLayout(
        coloredNodes,
        payload.edges,
        orientation ?? undefined,
      );
      finalNodes = laid.nodes;
      finalEdges = laid.edges;
    }

    const promptFromFile =
      presentationTitle ??
      payload.originalPrompt ??
      file.name.replace(/\.[^.]+$/, "");

    dispatch(
      loadGraphFromFile({
        nodes: finalNodes,
        edges: finalEdges,
        leafNodes: payload.leafNodes,
        hasMore: payload.hasMore,
        originalPrompt: promptFromFile,
        presentationColors: registry,
        orientation,
      }),
    );

    return {
      summary: `Загружено узлов: ${finalNodes.length}, рёбер: ${finalEdges.length}.`,
      warnings,
    };
  };

  const handleMerge = async (file: File) => {
    const text = await file.text();
    const result = parseGraphJson(text);
    const { payload, warnings, presentations } = result;

    // Расширяем реестр новыми презентациями (старые цвета сохраняются).
    const registry = assignColorsForPresentations(
      presentationColors,
      presentations,
    );

    // Префикс id, чтобы избежать коллизий между файлами (например, у двух
    // графов может встретиться один и тот же 'Продукт_0001').
    const namespace = `m${Date.now().toString(36)}__`;
    const namespacedNodes: CustomNode[] = payload.nodes.map((n) => ({
      ...n,
      id: namespace + n.id,
    }));
    const namespacedEdges = payload.edges.map((e) => ({
      ...e,
      id: namespace + e.id,
      source: namespace + e.source,
      target: namespace + e.target,
    }));

    const merged = mergeProductGraph({
      existingNodes: data.nodes,
      existingEdges: data.edges,
      newNodes: namespacedNodes,
      newEdges: namespacedEdges,
      registry,
    });

    // Пересчёт цвета всем product-узлам — у уже существующих узлов мог
    // расшириться список презентаций, цвет должен стать общим.
    const recolored = merged.nodes.map((n) => {
      if (n.type !== "product") return n;
      const pres = Array.isArray(n.data?.presentations)
        ? (n.data.presentations as string[])
        : [];
      return {
        ...n,
        data: {
          ...n.data,
          presentationColor: colorForPresentations(pres, registry),
        },
      };
    });

    // Объединённый граф ре-лейаут-нём целиком: новые узлы без координат + старые
    // могут «съезжать» при добавлении новых рёбер. Уважаем ориентацию,
    // зафиксированную при первой загрузке.
    const laid = await applyAutoLayout(
      recolored,
      merged.edges,
      presentationOrientation ?? undefined,
    );

    dispatch(
      mergeGraphFromFile({
        nodes: laid.nodes,
        edges: laid.edges,
        presentationColors: registry,
      }),
    );

    return {
      summary: `Добавлено узлов из файла: ${payload.nodes.length}, рёбер: ${payload.edges.length}. Итого в графе: ${laid.nodes.length} / ${laid.edges.length}.`,
      warnings,
    };
  };

  const handleFile = async (file: File, mode: UploadMode) => {
    setError(null);
    setInfo(null);
    setIsProcessing(true);
    try {
      const { summary, warnings } =
        mode === "replace" ? await handleReplace(file) : await handleMerge(file);
      if (warnings.length) {
        setInfo(`${summary} Предупреждений: ${warnings.length}.`);
        console.warn("[UploadGraphTab] предупреждения парсера:", warnings);
      } else {
        setInfo(summary);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setIsProcessing(false);
    }
  };

  const onChangeFactory =
    (mode: UploadMode) => async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await handleFile(file, mode);
    };

  const handleRelayout = async () => {
    if (!hasGraph) return;
    setError(null);
    setInfo(null);
    setIsProcessing(true);
    try {
      const laid = await applyAutoLayout(
        data.nodes,
        data.edges,
        presentationOrientation ?? undefined,
      );
      dispatch(setGraphData({ nodes: laid.nodes, edges: laid.edges }));
      setInfo(`Layout пересчитан: ${laid.nodes.length} узлов.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось пересчитать layout");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={onChangeFactory("replace")}
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={onChangeFactory("merge")}
      />

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => replaceInputRef.current?.click()}
          disabled={isProcessing}
        >
          {isProcessing ? "⏳ Обработка..." : "📂 Загрузить граф"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => mergeInputRef.current?.click()}
          disabled={!hasGraph || isProcessing}
          title={
            hasGraph
              ? "Добавить узлы из JSON к текущему графу"
              : "Сначала загрузите первый граф"
          }
        >
          ➕ Добавить граф
        </button>
      </div>

      <button
        type="button"
        className={styles.relayoutButton}
        onClick={handleRelayout}
        disabled={!hasGraph || isProcessing}
        title="Пересчитать раскладку узлов (полезно после ручных правок или слияний)"
      >
        🔄 Пересчитать раскладку
      </button>

      <p className={styles.hint}>
        Поддерживаются ранее сохранённые графы и формат с полями{" "}
        <code>Цепочка</code>, <code>Связи</code>, <code>Название презентации</code>.
        Кнопка «Добавить» сливает узлы из JSON в текущий граф (совпадение по
        нормализованному названию).
      </p>

      {error && <div className={styles.error}>⚠️ {error}</div>}
      {info && !error && <div className={styles.info}>✅ {info}</div>}

      <div className={styles.legendSection}>
        <h4 className={styles.legendTitle}>Легенда</h4>
        {legendEntries.length === 0 ? (
          <p className={styles.legendEmpty}>
            Загрузите граф с полем «Название презентации», чтобы увидеть источники.
          </p>
        ) : (
          <ul className={styles.legend}>
            {legendEntries.map((entry) => (
              <li
                key={entry.name}
                className={`${styles.legendItem} ${
                  entry.isCommon ? styles.legendItemCommon : ""
                }`}
              >
                <span
                  className={styles.swatch}
                  style={{ background: entry.swatch }}
                  aria-hidden
                />
                <span className={styles.legendName}>{entry.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
