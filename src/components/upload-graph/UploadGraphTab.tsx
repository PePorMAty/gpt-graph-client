import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { useMergeGraph, layoutForMergeTab } from "../../hooks/useMergeGraph";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { loadGraphFromFile, setGraphData } from "../../store/slices/gptSlice";
import { parseGraphJson } from "../../utils/parseGraphJson";
import {
  assignColorsForPresentations,
  buildLegend,
  colorForPresentations,
  ensureProductPresentations,
} from "../../utils/presentationColors";
import { markChainRoots } from "../../utils/markChainRoots";
import { reconstructSourcesPool } from "../../utils/reconstructSourcesPool";
import type { CustomNode } from "../../types";

import styles from "./UploadGraphTab.module.css";
import {
  MergeReportModal,
  type MergeReportRow,
} from "./MergeReportModal";
import { SourcePickerModal } from "./SourcePickerModal";
import { loadSavedGraph } from "../../store/api/saved-graph-api";

type UploadMode = "replace" | "merge";

export const UploadGraphTab = () => {
  const dispatch = useAppDispatch();
  const { data, presentationColors } = useAppSelector((state) => state.graph);
  // Слияние — общее с вкладкой «Объединить графы» в библиотеке.
  const mergeSource = useMergeGraph();

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeReport, setMergeReport] = useState<{
    presentationName: string | null;
    commonNodes: MergeReportRow[];
    addedCount: number;
  } | null>(null);
  const [sourcePickerMode, setSourcePickerMode] =
    useState<UploadMode | null>(null);

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

  const colorizeNodes = (
    nodes: CustomNode[],
    registry: Record<string, string>,
  ) =>
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

  const handleReplaceSource = async (
    input: string | unknown,
    fallbackName: string,
  ) => {
    const result = parseGraphJson(input);
    const {
      payload,
      warnings,
      needsLayout,
      presentations,
      presentationTitle,
      presentationColors: parsedColors,
      sources: parsedSources,
    } = result;

    // Источники графа: блок из файла (новые сейвы) либо реконструкция из узлов.
    const incomingSources =
      parsedSources ?? reconstructSourcesPool(payload.nodes);

    // Если в JSON-узлах уже сохранены цвета (скачанный с сервера
    // ранее объединённый граф) — переиспользуем их, чтобы раскраска
    // и порядок презентаций совпали с исходным. Иначе строим свежий
    // registry в порядке появления презентаций.
    let registry =
      parsedColors && Object.keys(parsedColors).length > 0
        ? parsedColors
        : assignColorsForPresentations({}, presentations);

    // Неймспейсим id входящего файла: это исключает коллизии при
    // последующем merge того же файла или другого с пересекающимися id
    // (например, скачанный с сервера merged-граф уже содержит id с
    // префиксом `m...__` — после повторной загрузки они должны стать
    // уникальными).
    // markChainRoots ДО namespacing: помечаем истоки цепочек самодостаточным
    // флагом chainBuiltRoot, пока id ещё совпадают с chainRootNodeId (после
    // префиксации ниже эта ссылка протухает). Флаг переживает namespacing и
    // нужен alignChainRoots для выравнивания начальных продуктов.
    const namespace = `r${crypto.randomUUID()}__`;
    const namespacedRawNodes = markChainRoots(payload.nodes).map((n) => ({
      ...n,
      id: namespace + n.id,
      // Ремапим внутреннюю ссылку chainRootNodeId под новый префикс id, иначе она
      // протухает, и ориентация рёбер не знает, к какой цепочке относится
      // преобразование (важно для общих продуктов между графами).
      data:
        typeof n.data?.chainRootNodeId === "string"
          ? { ...n.data, chainRootNodeId: namespace + n.data.chainRootNodeId }
          : n.data,
    }));
    const namespacedRawEdges = payload.edges.map((e) => ({
      ...e,
      id: namespace + e.id,
      source: namespace + e.source,
      target: namespace + e.target,
    }));

    // Intra-file dedup: если в одном JSON оказались два product-узла с
    // одинаковым нормализованным label — оставляем первый, второй
    // схлопывается в первый (рёбра ремэппятся, self-loops дропаются).
    const labelToId = new Map<string, string>();
    const intraRemap: Record<string, string> = {};
    const dedupedNodes: typeof namespacedRawNodes = [];
    for (const n of namespacedRawNodes) {
      const label = typeof n.data?.label === "string" ? n.data.label : "";
      if (n.type === "product" && label) {
        const key = label
          .normalize("NFC")
          .replace(/[-‐‑‒–—―−­]/g, " ")
          .replace(/[’ʼʹ´`]/g, "'")
          // eslint-disable-next-line no-irregular-whitespace, no-misleading-character-class -- класс намеренно содержит zero-width символы (ZWSP/ZWNJ/ZWJ/BOM)
          .replace(/[​‌‍﻿]/g, "")
          .replace(/ /g, " ")
          .replace(/ё/g, "е")
          .replace(/Ё/g, "Е")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (key) {
          const firstId = labelToId.get(key);
          if (firstId) {
            intraRemap[n.id] = firstId;
            continue;
          }
          labelToId.set(key, n.id);
        }
      }
      dedupedNodes.push(n);
    }
    const dedupedEdges = namespacedRawEdges
      .map((e) => ({
        ...e,
        source: intraRemap[e.source] ?? e.source,
        target: intraRemap[e.target] ?? e.target,
      }))
      .filter((e) => e.source !== e.target);

    // Ремап chainRootNodeId у схлопнутых intra-file продуктов: осиротевшая ссылка
    // на удалённый узел ломает ориентацию рёбер его преобразований (тот же мотив,
    // что и при merge общих продуктов).
    const dedupedNodesRemapped = dedupedNodes.map((n) => {
      const r = n.data?.chainRootNodeId;
      return typeof r === "string" && intraRemap[r]
        ? { ...n, data: { ...n.data, chainRootNodeId: intraRemap[r] } }
        : n;
    });

    // Бэкфилл презентаций: графы, построенные по шагам, не несут
    // data.presentations у узлов. Считаем весь загружаемый граф одним
    // источником по его имени (presentationTitle → имя файла), чтобы
    // заработали раскраска и легенда. Узлы с уже имеющимися презентациями
    // (presentation-граф / скачанный merged) не трогаются.
    const sourceName = presentationTitle ?? fallbackName;
    const backfilled = ensureProductPresentations(
      dedupedNodesRemapped,
      sourceName,
      registry,
    );
    registry = backfilled.registry;

    const coloredNodes = colorizeNodes(backfilled.nodes, registry);

    let finalNodes = coloredNodes;
    let finalEdges = dedupedEdges;
    if (needsLayout) {
      // Загружаемые презентации укладываем сверху вниз: сырьё сверху, продукты снизу.
      const laid = await layoutForMergeTab(coloredNodes, dedupedEdges);
      finalNodes = laid.nodes;
      finalEdges = laid.edges;
    }

    const promptFromFile =
      presentationTitle ?? payload.originalPrompt ?? fallbackName;

    dispatch(
      loadGraphFromFile({
        nodes: finalNodes,
        edges: finalEdges,
        leafNodes: payload.leafNodes,
        hasMore: payload.hasMore,
        originalPrompt: promptFromFile,
        presentationColors: registry,
        sourcesPool: incomingSources.pool,
        sourcesSeqCounter: incomingSources.seqCounter,
      }),
    );

    return {
      summary: `Загружено узлов: ${finalNodes.length}, рёбер: ${finalEdges.length}.`,
      warnings,
    };
  };


  const runWithStatus = async (
    work: () => Promise<{ summary: string; warnings: string[] }>,
  ) => {
    setError(null);
    setInfo(null);
    setIsProcessing(true);
    try {
      const { summary, warnings } = await work();
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

  /** Слияние через общий хук: отчёт из него показываем своей модалкой. */
  const runMerge = async (input: string | unknown, fallbackName: string) => {
    const outcome = await mergeSource(input, fallbackName);
    setMergeReport(outcome.report);
    return { summary: outcome.summary, warnings: outcome.warnings };
  };

  const handleFile = async (file: File, mode: UploadMode) => {
    const text = await file.text();
    const fallbackName = file.name.replace(/\.[^.]+$/, "");
    await runWithStatus(() =>
      mode === "replace"
        ? handleReplaceSource(text, fallbackName)
        : runMerge(text, fallbackName),
    );
  };

  const handleSavedPick = async (
    id: string,
    name: string,
    mode: UploadMode,
  ) => {
    await runWithStatus(async () => {
      const file = await loadSavedGraph(id);
      return mode === "replace"
        ? handleReplaceSource(file, name)
        : runMerge(file, name);
    });
  };

  const onChangeFactory =
    (mode: UploadMode) => async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await handleFile(file, mode);
    };

  // Перевернуть граф по вертикали (для старых графов без направления построения,
  // где корнем оказался конечный продукт). Отражаем y вокруг центра bbox —
  // порядок слоёв сохраняется. Хэндлы рёбер перевыставит setGraphData
  // (внутри редьюсера зовётся applyHandlesByGeometry).
  const handleFlip = () => {
    if (!hasGraph) return;
    const ys = data.nodes.map((n) => n.position.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const flipped = data.nodes.map((n) => ({
      ...n,
      position: { x: n.position.x, y: minY + maxY - n.position.y },
    }));
    dispatch(setGraphData({ nodes: flipped, edges: data.edges }));
    setError(null);
    setInfo("Граф перевёрнут по вертикали.");
  };

  const handleRelayout = async () => {
    if (!hasGraph) return;
    setError(null);
    setInfo(null);
    setIsProcessing(true);
    try {
      const laid = await layoutForMergeTab(data.nodes, data.edges);
      dispatch(setGraphData({ nodes: laid.nodes, edges: laid.edges }));
      setInfo(`Layout пересчитан: ${laid.nodes.length} узлов.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось пересчитать layout",
      );
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
          onClick={() => setSourcePickerMode("replace")}
          disabled={isProcessing}
        >
          {isProcessing ? "⏳ Обработка..." : "📂 Загрузить граф"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setSourcePickerMode("merge")}
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

      <button
        type="button"
        className={styles.relayoutButton}
        onClick={handleFlip}
        disabled={!hasGraph || isProcessing}
        title="Перевернуть граф по вертикали (сырьё ↔ продукт сверху)"
      >
        🔁 Перевернуть
      </button>

      {error && <div className={styles.error}>⚠️ {error}</div>}
      {info && !error && <div className={styles.info}>✅ {info}</div>}

      <div className={styles.legendSection}>
        <h4 className={styles.legendTitle}>Легенда</h4>
        {legendEntries.length === 0 ? (
          <p className={styles.legendEmpty}>
            Загрузите граф с полем «Название презентации», чтобы увидеть
            источники.
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

      {mergeReport && (
        <MergeReportModal
          presentationName={mergeReport.presentationName}
          commonNodes={mergeReport.commonNodes}
          addedCount={mergeReport.addedCount}
          onClose={() => setMergeReport(null)}
        />
      )}

      {sourcePickerMode && (
        <SourcePickerModal
          mode={sourcePickerMode}
          onClose={() => setSourcePickerMode(null)}
          onPickFile={() => {
            const mode = sourcePickerMode;
            setSourcePickerMode(null);
            // requestAnimationFrame даёт модалке закрыться, прежде чем
            // браузерный file picker украдёт фокус.
            requestAnimationFrame(() => {
              const ref =
                mode === "replace" ? replaceInputRef : mergeInputRef;
              ref.current?.click();
            });
          }}
          onPickSaved={(id, name) => {
            const mode = sourcePickerMode;
            setSourcePickerMode(null);
            handleSavedPick(id, name, mode);
          }}
        />
      )}
    </div>
  );
};
