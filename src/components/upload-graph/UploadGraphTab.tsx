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
  ensureProductPresentations,
} from "../../utils/presentationColors";
import { assignTopologicalLayers } from "../../utils/assignTopologicalLayers";
import { orientByBuildDirection } from "../../utils/orientByBuildDirection";
import { applyHandlesByGeometry } from "../../utils/normalize-edges";
import { mergeProductGraph } from "../../utils/mergeProductGraph";
import { markChainRoots } from "../../utils/markChainRoots";
import { alignChainRoots } from "../../utils/alignChainRoots";
import { reconstructSourcesPool } from "../../utils/reconstructSourcesPool";
import { mergeSourcesPools } from "../../utils/mergeSourcesPools";
import type { CustomNode } from "../../types";
import type { Edge } from "@xyflow/react";

import styles from "./UploadGraphTab.module.css";
import {
  MergeReportModal,
  type MergeReportRow,
} from "./MergeReportModal";
import { SourcePickerModal } from "./SourcePickerModal";
import { loadSavedGraph } from "../../store/api/saved-graph-api";

// Раскладка для вкладки объединения: сырьё сверху, продукты снизу.
// ELK (~1.5MB) подгружаем динамически — только когда пользователь
// реально что-то делает на этой вкладке. При сбое — фолбэк на applyAutoLayout("TB").
//
// Шаги:
// 1. orientByBuildDirection — приводим рёбра к канону «сырьё → продукт»,
//    разворачивая части, построенные «вниз» (у них якорь — конечный продукт,
//    и без разворота сырьё уходило бы вниз). Идемпотентно (флаг на ребре).
// 2. Слои синтезируем по фактической топологии (assignTopologicalLayers) уже
//    по канонической ориентации — чистое послойное размещение и для
//    продуктовых, и для step-графов (у последних нет поля «Слой»), включая
//    узлы-преобразования и изолированные ноды.
// 3. alignChainRoots — выравнивает «начальные продукты» (истоки цепочек) всех
//    объединённых графов на один горизонтальный уровень: каждую связную компоненту
//    сдвигает по вертикали так, чтобы её корень встал на общий targetY (внутренняя
//    раскладка цепочки сохраняется). Корень берётся по флагу chainBuiltRoot
//    (проставлен markChainRoots до namespacing), иначе — по эвристике-стоку.
// 4. После раскладки applyHandlesByGeometry перевыставляет хэндлы рёбер по
//    фактическим Y-координатам — в т.ч. у развёрнутых на шаге 1 рёбер.
const layoutForMergeTab = async (
  nodes: CustomNode[],
  edges: Edge[],
): Promise<{ nodes: CustomNode[]; edges: Edge[] }> => {
  const oriented = orientByBuildDirection(nodes, edges);
  const layeredNodes = assignTopologicalLayers(nodes, oriented);
  try {
    const { layoutMergedGraphElk } = await import(
      "../../utils/layoutMergedGraphElk"
    );
    const laid = await layoutMergedGraphElk(layeredNodes, oriented, {
      useLayers: true,
    });
    const aligned = alignChainRoots(laid.nodes, laid.edges);
    return {
      nodes: aligned,
      edges: applyHandlesByGeometry(aligned, laid.edges),
    };
  } catch (e) {
    console.warn(
      "[UploadGraphTab] ELK-раскладка с констрейнтами не сработала, фолбэк на dagre/longest-path:",
      e,
    );
    const laid = await applyAutoLayout(layeredNodes, oriented, "TB");
    const aligned = alignChainRoots(laid.nodes, laid.edges);
    return {
      nodes: aligned,
      edges: applyHandlesByGeometry(aligned, laid.edges),
    };
  }
};

type UploadMode = "replace" | "merge";

export const UploadGraphTab = () => {
  const dispatch = useAppDispatch();
  const { data, presentationColors, originalPrompt, sourcesPool, sourcesSeqCounter } =
    useAppSelector((state) => state.graph);

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

    // Бэкфилл презентаций: графы, построенные по шагам, не несут
    // data.presentations у узлов. Считаем весь загружаемый граф одним
    // источником по его имени (presentationTitle → имя файла), чтобы
    // заработали раскраска и легенда. Узлы с уже имеющимися презентациями
    // (presentation-граф / скачанный merged) не трогаются.
    const sourceName = presentationTitle ?? fallbackName;
    const backfilled = ensureProductPresentations(
      dedupedNodes,
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

  const handleMergeSource = async (
    input: string | unknown,
    fallbackName: string,
  ) => {
    const result = parseGraphJson(input);
    const { payload, warnings, presentations, presentationTitle, sources: parsedSources } =
      result;

    // Существующий граф мог быть построен по шагам (узлы без data.presentations) —
    // считаем его одним источником по имени текущего графа и бэкфиллим, иначе
    // при объединении он остался бы дефолтно-синим и выпал из легенды.
    const existingSourceName =
      (originalPrompt && originalPrompt.trim()) || "Текущий граф";
    const existingBackfill = ensureProductPresentations(
      data.nodes,
      existingSourceName,
      presentationColors,
    );
    const existingNodes = existingBackfill.nodes;

    // Расширяем реестр презентациями добавляемого графа (старые цвета целы).
    let registry = assignColorsForPresentations(
      existingBackfill.registry,
      presentations,
    );

    // Слепок sources существующих product-узлов ДО merge (уже с бэкфиллом) —
    // пригодится для отчёта «какие узлы стали общими в результате добавления».
    const beforeSourcesById = new Map<string, string[]>();
    for (const n of existingNodes) {
      if (n.type !== "product") continue;
      const pres = Array.isArray(n.data?.presentations)
        ? (n.data.presentations as string[])
        : [];
      beforeSourcesById.set(n.id, pres);
    }

    // Префикс id, чтобы избежать коллизий между файлами (например, у двух
    // графов может встретиться один и тот же 'Продукт_0001').
    // Гарантированно уникальный неймспейс — два быстрых клика на «Добавить
    // граф» с Date.now() могут попасть в одну миллисекунду и дать коллизию
    // node id с предыдущим merge, из-за чего React Flow «теряет» дубли.
    // markChainRoots ДО namespacing: помечаем истоки цепочек флагом
    // chainBuiltRoot, пока id ещё совпадают с chainRootNodeId (после префиксации
    // ссылка протухает). Флаг переживает namespacing → alignChainRoots выровняет
    // начальные продукты добавляемого графа вместе с уже существующими.
    const namespace = `m${crypto.randomUUID()}__`;
    const namespacedNodes: CustomNode[] = markChainRoots(payload.nodes).map(
      (n) => ({
        ...n,
        id: namespace + n.id,
      }),
    );
    const namespacedEdges = payload.edges.map((e) => ({
      ...e,
      id: namespace + e.id,
      source: namespace + e.source,
      target: namespace + e.target,
    }));

    // Бэкфилл добавляемого графа: step-граф без presentations считаем одним
    // источником по его имени (presentationTitle → имя файла/сохранённого графа).
    const incomingSourceName = presentationTitle ?? fallbackName;
    const incomingBackfill = ensureProductPresentations(
      namespacedNodes,
      incomingSourceName,
      registry,
    );
    registry = incomingBackfill.registry;

    const merged = mergeProductGraph({
      existingNodes,
      existingEdges: data.edges,
      newNodes: incomingBackfill.nodes,
      newEdges: namespacedEdges,
      registry,
    });

    // Список узлов, у которых после merge источников стало больше, чем до.
    // Это и есть «новые общие» / «получившие новый источник» узлы.
    const reportRows: MergeReportRow[] = [];
    for (const n of merged.nodes) {
      if (n.type !== "product") continue;
      const before = beforeSourcesById.get(n.id);
      if (!before) continue; // новый узел из добавленного файла
      const after = Array.isArray(n.data?.presentations)
        ? (n.data.presentations as string[])
        : [];
      if (after.length > 1 && after.length > before.length) {
        const label = typeof n.data?.label === "string" ? n.data.label : n.id;
        const labelsByPresentation =
          typeof n.data?.labelsByPresentation === "object" &&
          n.data.labelsByPresentation
            ? (n.data.labelsByPresentation as Record<string, string>)
            : undefined;
        reportRows.push({ label, presentations: after, labelsByPresentation });
      }
    }
    reportRows.sort((a, b) => a.label.localeCompare(b.label, "ru"));

    const addedCount = merged.nodes.length - data.nodes.length;

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
    // могут «съезжать» при добавлении новых рёбер. Используем ELK с
    // layerConstraint, чтобы сырьё прижалось к верхнему слою, а конечные
    // продукты — к нижнему (сугияма-разделение для объединённых графов).
    const laid = await layoutForMergeTab(recolored, merged.edges);

    // Перенумерация источников ПО НАПРАВЛЕНИЯМ: текущий пул держит номера, у
    // добавляемого графа новые продукты продолжают нумерацию (общие — один номер).
    const incomingSources =
      parsedSources ?? reconstructSourcesPool(payload.nodes);
    const combinedSources = mergeSourcesPools([
      { pool: sourcesPool, seqCounter: sourcesSeqCounter },
      incomingSources,
    ]);

    dispatch(
      mergeGraphFromFile({
        nodes: laid.nodes,
        edges: laid.edges,
        presentationColors: registry,
        sourcesPool: combinedSources.pool,
        sourcesSeqCounter: combinedSources.seqCounter,
      }),
    );

    setMergeReport({
      presentationName: presentationTitle,
      commonNodes: reportRows,
      addedCount,
    });

    return {
      summary: `Добавлено узлов из файла: ${payload.nodes.length}, рёбер: ${payload.edges.length}. Итого в графе: ${laid.nodes.length} / ${laid.edges.length}.`,
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

  const handleFile = async (file: File, mode: UploadMode) => {
    const text = await file.text();
    const fallbackName = file.name.replace(/\.[^.]+$/, "");
    await runWithStatus(() =>
      mode === "replace"
        ? handleReplaceSource(text, fallbackName)
        : handleMergeSource(text, fallbackName),
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
        : handleMergeSource(file, name);
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
