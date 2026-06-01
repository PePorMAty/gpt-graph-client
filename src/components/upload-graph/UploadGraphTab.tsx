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
const layoutForMergeTab = async (
  nodes: CustomNode[],
  edges: Edge[],
): Promise<{ nodes: CustomNode[]; edges: Edge[] }> => {
  try {
    const { layoutMergedGraphElk } = await import(
      "../../utils/layoutMergedGraphElk"
    );
    return await layoutMergedGraphElk(nodes, edges, { useLayers: false });
  } catch (e) {
    console.warn(
      "[UploadGraphTab] ELK-раскладка с констрейнтами не сработала, фолбэк на dagre/longest-path:",
      e,
    );
    return applyAutoLayout(nodes, edges, "TB");
  }
};

type UploadMode = "replace" | "merge";

export const UploadGraphTab = () => {
  const dispatch = useAppDispatch();
  const { data, presentationColors } = useAppSelector((state) => state.graph);

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
    } = result;

    // Если в JSON-узлах уже сохранены цвета (скачанный с сервера
    // ранее объединённый граф) — переиспользуем их, чтобы раскраска
    // и порядок презентаций совпали с исходным. Иначе строим свежий
    // registry в порядке появления презентаций.
    const registry =
      parsedColors && Object.keys(parsedColors).length > 0
        ? parsedColors
        : assignColorsForPresentations({}, presentations);
    const coloredNodes = colorizeNodes(payload.nodes, registry);

    let finalNodes = coloredNodes;
    let finalEdges = payload.edges;
    if (needsLayout) {
      // Загружаемые презентации укладываем сверху вниз: сырьё сверху, продукты снизу.
      const laid = await layoutForMergeTab(coloredNodes, payload.edges);
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
      }),
    );

    return {
      summary: `Загружено узлов: ${finalNodes.length}, рёбер: ${finalEdges.length}.`,
      warnings,
    };
  };

  const handleMergeSource = async (input: string | unknown) => {
    const result = parseGraphJson(input);
    const { payload, warnings, presentations, presentationTitle } = result;

    // Расширяем реестр новыми презентациями (старые цвета сохраняются).
    const registry = assignColorsForPresentations(
      presentationColors,
      presentations,
    );

    // Слепок sources существующих product-узлов ДО merge — пригодится
    // для отчёта «какие узлы стали общими в результате этого добавления».
    const beforeSourcesById = new Map<string, string[]>();
    for (const n of data.nodes) {
      if (n.type !== "product") continue;
      const pres = Array.isArray(n.data?.presentations)
        ? (n.data.presentations as string[])
        : [];
      beforeSourcesById.set(n.id, pres);
    }

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

    dispatch(
      mergeGraphFromFile({
        nodes: laid.nodes,
        edges: laid.edges,
        presentationColors: registry,
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
        : handleMergeSource(text),
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
        : handleMergeSource(file);
    });
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
