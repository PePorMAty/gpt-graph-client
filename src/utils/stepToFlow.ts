// src/utils/stepToFlow.ts
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { StepChainApiStep, StepRecord } from "../store/types";
import { normalizeProductName } from "./normalizeProductName";
import { findExistingProductNode } from "./productIdentity";
import { computeShiftX, overlapsAny, pushAsideX } from "./resolveChainOverlap";
import { wouldCreateCycle } from "./graphReachability";
import { applyHandlesByGeometry } from "./normalize-edges";
import type { TFlow } from "./edgeFlow";
import {
  sameProcess,
  transformationIO,
  type ProcessIO,
} from "./collapseDuplicateTransformations";

export interface StepToFlowOpts {
  sessionKey: string;
  rootNodeId: string;
  direction: "up" | "down";
  anchorNodeId: string;
  anchorX: number;
  anchorY: number;
  stepNumber: number;
  existingNodes: CustomNode[];
  // Рёбра текущего графа — нужны для детекта петель (предок ли existing-выход).
  existingEdges?: Edge[];
  spacingX?: number;
  stepY1?: number;
  stepY2?: number;
  /** Обобщённое описание шага (markdown) от продукта-якоря — кладём на
   *  transformation-ноду для показа в карточке (переключатель «Обобщённое»). */
  anchorAggregatedText?: string | null;
}

export function stepToFlow(
  step: StepChainApiStep,
  opts: StepToFlowOpts,
): { nodes: CustomNode[]; edges: Edge[]; stepRecord: StepRecord } {
  const {
    sessionKey,
    rootNodeId,
    direction,
    anchorNodeId,
    anchorX,
    anchorY,
    stepNumber,
    existingNodes,
    existingEdges = [],
    spacingX = 260,
    stepY1 = 180,
    stepY2 = 220,
    anchorAggregatedText = null,
  } = opts;

  const isDown = direction === "down";
  const sign = direction === "down" ? 1 : -1;
  // Смысл связей шага (см. edgeFlow.ts). Якорь шага «вниз» — его сырьё, а
  // найденное — продукты; у шага «вверх» наоборот: якорь — продукт, найденное
  // — сырьё. Рёбра при этом всегда идут от якоря.
  const anchorFlow: TFlow = isDown ? "in" : "out";
  const foundFlow: TFlow = isDown ? "out" : "in";

  // --- 1) собрать продукты (исключая якорь) ---
  const anchorNode = existingNodes.find((n) => n.id === anchorNodeId);
  const anchorLabel = anchorNode?.data?.label || "";
  const anchorNorm = normalizeProductName(anchorLabel);

  const allProducts: Array<{
    product: (typeof step.inputProducts)[0];
    role: "input" | "output";
  }> = [
    ...step.inputProducts.map((p) => ({ product: p, role: "input" as const })),
    ...step.outputProducts.map((p) => ({
      product: p,
      role: "output" as const,
    })),
  ];

  // Убрать сам якорь (продукт, от которого строим)
  const productsToProcess = allProducts.filter(
    ({ product }) => normalizeProductName(product.name) !== anchorNorm,
  );

  // Дедуп по нормализованному имени внутри шага
  const seenNorm = new Set<string>();
  const uniqueProducts = productsToProcess.filter(({ product }) => {
    const norm = normalizeProductName(product.name);
    if (seenNorm.has(norm)) return false;
    seenNorm.add(norm);
    return true;
  });

  // --- 2) классификация: новый / существующий (схождение) / петля ---
  // Сверяем КАЖДЫЙ продукт с уже существующими узлами собственным надёжным
  // normalizeProductName — НЕ полагаясь на серверный флаг isExisting (он считает
  // слабее и при расхождении дефис/апостроф/регистр прислал бы isExisting:false,
  // из-за чего мы создали бы дубликат или замкнули цикл).
  //
  // Петля ≠ «узел уже есть». При построении вниз сырьё законно питает несколько
  // потомков (схождение DAG). Настоящая петля — только если существующий узел
  // уже ДОСТИЖИМ до якоря (его предок): тогда ребро anchor → tr → O замкнёт
  // направленный контур. Такие выходы НЕ рисуем и копим в cycleProductNames.
  // Предок — по родословной построения, то есть по рёбрам, как их клали шаги
  // (от якоря); это намеренно: выход шага «вниз», найденный раньше шагом
  // «вверх» от того же продукта, — не возврат по цепочке, его связь рисуется.
  //
  // Сторона продукта — по его роли в шаге: сырьё входит в преобразование,
  // продукт выходит. Найденное шагом обычно лежит на дальней от якоря стороне,
  // но не всё: у шага «вниз» бывает второе сырьё (бензол алкилируют этиленом),
  // у шага «вверх» — попутный продукт (пиролиз даёт и этилен, и пропилен).
  // Такие стоят на стороне якоря. Если модель перепутала роли и на дальней
  // стороне не осталось ничего, кладём всё туда, как раньше.
  const sides = uniqueProducts.map(({ role }) =>
    role === "input" ? ("in" as const) : ("out" as const),
  );
  const farSideEmpty = !sides.some((f) => f === foundFlow);
  const classified = uniqueProducts.map(({ product }, i) => {
    // Идентификатор сильнее названия: продукт шага может называться иначе, чем
    // тот же продукт на полотне («Кумол» из шага и «ИПБ» на полотне).
    // Идентификатор продукту шага проставляет справочник (identifyStepProducts)
    // — так и помечаем: иначе его каноническое название не сравнивалось бы с
    // названиями узлов на полотне.
    const idSource = product.productId ? ("dictionary" as const) : null;
    const existingNodeId =
      findExistingProductNode(
        product.name,
        existingNodes,
        product.productId,
        idSource,
      ) ??
      (product.existingNodeLabel
        ? findExistingProductNode(
            product.existingNodeLabel,
            existingNodes,
            product.productId,
            idSource,
          )
        : null);
    const flow: TFlow = farSideEmpty ? foundFlow : sides[i];
    return { product, existingNodeId, flow };
  });

  // --- 2б) то же преобразование уже на полотне? ---
  // То же название и тот же процесс по сырью и продуктам (sameProcess):
  // «Этан → Пиролиз → Этилен», потом шаг «вверх» от пропилена «Этан → Пиролиз
  // → Пропилен» — один «Пиролиз» с двумя продуктами. Сырьё и продукты — по
  // смыслу связей, поэтому направление шага не мешает: преобразование,
  // построенное шагом «вниз», узнаётся и шагом «вверх». Такой узел
  // переиспользуем вместо создания дубля.
  const trNorm = normalizeProductName(step.transformation.name);
  let reusedTrNode: CustomNode | null = null;
  // Продукты, уже связанные с переиспользуемым преобразованием: второй раз
  // их не связываем.
  let linked = new Set<string>();
  if (trNorm) {
    const stepIO: ProcessIO = { ins: new Set(), outs: new Set() };
    const sideOf = (flow: TFlow) => (flow === "in" ? stepIO.ins : stepIO.outs);
    sideOf(anchorFlow).add(anchorNodeId);
    for (const c of classified) {
      sideOf(c.flow).add(
        c.existingNodeId ?? `new::${normalizeProductName(c.product.name)}`,
      );
    }
    const io = transformationIO(existingNodes, existingEdges);
    for (const n of existingNodes) {
      if (n.type !== "transformation") continue;
      if (n.data?.chainVariant === "alt") continue;
      const label = typeof n.data?.label === "string" ? n.data.label : "";
      if (normalizeProductName(label) !== trNorm) continue;
      const cur = io.get(n.id);
      if (cur && sameProcess(cur, stepIO)) {
        reusedTrNode = n;
        linked = new Set([...cur.ins, ...cur.outs]);
        break;
      }
    }
  }

  const cycleProductNames: string[] = [];
  const renderProducts: typeof classified = [];
  for (const c of classified) {
    // Уже связан с тем же преобразованием — это та же связь, а не петля.
    if (c.existingNodeId && linked.has(c.existingNodeId)) {
      renderProducts.push(c);
      continue;
    }
    if (
      c.existingNodeId &&
      c.flow === foundFlow &&
      wouldCreateCycle(c.existingNodeId, anchorNodeId, existingEdges)
    ) {
      cycleProductNames.push(c.product.name);
      continue;
    }
    renderProducts.push(c);
  }

  // Шаг целиком уже стоит на графе: то же преобразование, и якорь, и все
  // продукты шага уже связаны с ним. Граф не трогаем — тупик «уже есть» (см.
  // acceptPendingStep): раньше такой шаг «вверх» по уже построенному шагом
  // «вниз» переходу считался петлёй.
  if (
    reusedTrNode &&
    linked.has(anchorNodeId) &&
    cycleProductNames.length === 0 &&
    renderProducts.every((r) => r.existingNodeId && linked.has(r.existingNodeId))
  ) {
    const trLabel = reusedTrNode.data?.label;
    return {
      nodes: [],
      edges: [],
      stepRecord: {
        stepNumber,
        fromProductNodeId: anchorNodeId,
        transformationNodeId: "",
        newProductNodeIds: [],
        mergedProductNodeIds: [],
        addedEdgeIds: [],
        cycleProductNames,
        isDeadEnd: true,
        alreadyOnGraph: {
          transformation:
            typeof trLabel === "string" && trLabel
              ? trLabel
              : step.transformation.name,
          products: renderProducts.map((r) => r.product.name),
        },
      },
    };
  }

  // --- 3) тупик: соединять нечего, ИЛИ вырожденный «дрейф к предку» ---
  // Не создаём висящий узел-трансформацию. Вызывающая сторона по isDeadEnd
  // пометит продукт «нужны свежие источники» и не будет мутировать граф.
  //
  // Вырожденный дрейф: ни одного ГЕНУИННО НОВОГО продукта, но в шаг втянут
  // предок (cycleProductNames) — модель раскрыла предка/синоним вместо якоря и
  // лишь пере-derive'ит существующее (напр. «Топливо» → существующий «Синтез-газ»
  // через вход-предок «Чар»). Рисовать ребро к соседу не нужно — это возврат к
  // предку, а не схождение. (Законное схождение: newCount===0, НО предков нет —
  // cycleProductNames пуст — тогда ребро рисуем.)
  const newCount = renderProducts.filter((r) => !r.existingNodeId).length;
  const degenerateAncestorLoop = newCount === 0 && cycleProductNames.length > 0;
  if (renderProducts.length === 0 || degenerateAncestorLoop) {
    return {
      nodes: [],
      edges: [],
      stepRecord: {
        stepNumber,
        fromProductNodeId: anchorNodeId,
        transformationNodeId: "",
        newProductNodeIds: [],
        mergedProductNodeIds: [],
        addedEdgeIds: [],
        cycleProductNames,
        isDeadEnd: true,
      },
    };
  }

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];
  const newProductNodeIds: string[] = [];
  const mergedProductNodeIds: string[] = [];
  const sideProductNodeIds: string[] = [];
  const addedEdgeIds: string[] = [];

  // --- 4) раскладка ---
  // Альтернативы этого же продукта — заготовки, стоят там, куда ляжет шаг.
  // Место им не уступаем: их отодвигает в стороны acceptPendingStep
  // (nudgeStepPlaceholders).
  const obstacles = existingNodes.filter(
    (n) => !isStepPlaceholder(n, anchorNodeId),
  );
  const far = renderProducts.filter((r) => r.flow === foundFlow);
  const near = renderProducts.filter((r) => r.flow !== foundFlow);
  const trY = reusedTrNode ? reusedTrNode.position.y : anchorY + sign * stepY1;
  const nearY = trY - sign * stepY1;

  // Новые продукты стороны якоря — второе сырьё шага «вниз», попутный продукт
  // шага «вверх» — встают в ряд якоря вплотную к нему, а новое преобразование
  // — посередине между ними и якорем. Иначе якорь оставался в одном углу, а
  // второе сырьё уезжало в другой, к сдвинутому преобразованию.
  const nearPos = new Map<string, { x: number; y: number }>();
  const placedNear: CustomNode[] = [];
  for (const r of near) {
    if (r.existingNodeId) continue;
    const start = { x: anchorX + spacingX * (placedNear.length + 1), y: nearY };
    const probe = { id: "", type: "product", position: start, data: {} } as CustomNode;
    const shift = computeShiftX([probe], [...obstacles, ...placedNear], spacingX);
    const pos = { x: start.x + shift, y: nearY };
    nearPos.set(normalizeProductName(r.product.name), pos);
    placedNear.push({ ...probe, position: pos });
  }

  // --- 4а) узел-трансформация (новый или переиспользуемый, см. 2б) ---
  const trId = step.transformation.id || String(stepNumber);
  const trFlowId = reusedTrNode
    ? reusedTrNode.id
    : `step::${sessionKey}::tr::${stepNumber}::${trId}`;
  const trX = reusedTrNode
    ? reusedTrNode.position.x
    : (anchorX + placedNear.reduce((sum, n) => sum + n.position.x, 0)) /
      (placedNear.length + 1);

  if (!reusedTrNode) {
    nodes.push({
      id: trFlowId,
      type: "transformation",
      position: { x: trX, y: trY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: step.transformation.name,
        description: step.transformation.description || "",
        // Пустое поле не кладём вовсе: в карточке такая строка всё равно не
        // показывается, а в файле графа пустышка только мешает сравнению.
        ...(step.transformation.industry?.trim()
          ? { industry: step.transformation.industry.trim() }
          : {}),
        ...(step.transformation.mainPurpose?.trim()
          ? { mainPurpose: step.transformation.mainPurpose.trim() }
          : {}),
        ...(step.transformation.notes?.length
          ? { notes: step.transformation.notes.filter((n) => n?.trim()) }
          : {}),
        ...(anchorAggregatedText
          ? { aggregatedDescription: anchorAggregatedText }
          : {}),
        chainRootNodeId: rootNodeId,
        chainDirection: direction,
        stepChainSessionKey: sessionKey,
        stepChainStepNumber: stepNumber,
      },
    });
  }

  // --- 5) ребро: anchor → transformation (у реюза его может и не быть) ---
  if (!linked.has(anchorNodeId)) {
    const anchorToTrEdgeId = `step::${sessionKey}::e::${anchorNodeId}::${trFlowId}`;
    edges.push({
      id: anchorToTrEdgeId,
      source: anchorNodeId,
      target: trFlowId,
      type: "straight",
      data: { tFlow: anchorFlow },
    });
    addedEdgeIds.push(anchorToTrEdgeId);
  }

  // --- 6) узлы-продукты ---
  // Дальняя сторона — рядом под (над) преобразованием, как всегда. Сторона
  // якоря — в ряд якоря, места им найдены выше (шаг 4).
  // Новые продукты дальней стороны — первыми в списке: следующий шаг по
  // умолчанию идёт от первого из них.
  const productsY = trY + sign * stepY2;
  const rowWidth = far.length > 1 ? (far.length - 1) * spacingX : 0;
  const startX = trX - rowWidth / 2;
  const nearNodes: CustomNode[] = [];

  [...far, ...near].forEach(({ product, existingNodeId, flow }, idx) => {
    const isFar = flow === foundFlow;
    const x = startX + idx * spacingX;
    // Ребро продукта стороны якоря идёт к преобразованию, как ребро якоря;
    // дальней — от преобразования. Смысл в tFlow, хэндлы — в конце.
    const link = (pid: string) => {
      const edgeId = isFar
        ? `step::${sessionKey}::e::${trFlowId}::${pid}`
        : `step::${sessionKey}::e::${pid}::${trFlowId}`;
      edges.push({
        id: edgeId,
        source: isFar ? trFlowId : pid,
        target: isFar ? pid : trFlowId,
        type: "straight",
        data: { tFlow: flow },
      });
      addedEdgeIds.push(edgeId);
    };

    if (existingNodeId) {
      // Существующий продукт (законное схождение) — только ребро, без узла.
      // Хэндлы — по смыслу связи, а не по одной геометрии: существующий узел
      // может стоять где угодно. Выход шага «вниз», уже стоящий выше
      // преобразования, всё равно выходит из его низа (просьба заказчика,
      // 2026-10-05) — раньше он цеплялся к верху, как сырьё.
      if (linked.has(existingNodeId)) return;
      mergedProductNodeIds.push(existingNodeId);
      if (!isFar) sideProductNodeIds.push(existingNodeId);
      link(existingNodeId);
    } else {
      // Новый продукт — узел + ребро
      const sanitizedName = normalizeProductName(product.name).replace(
        /\s+/g,
        "_",
      );
      const pFlowId = `step::${sessionKey}::pid::${stepNumber}::${sanitizedName}`;

      const node: CustomNode = {
        id: pFlowId,
        type: "product",
        position: isFar
          ? { x, y: productsY }
          : (nearPos.get(normalizeProductName(product.name)) ?? { x, y: nearY }),
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          label: product.name,
          description: product.description || "",
          // Отрасль и назначение самого продукта — из построения шага. Пустое
          // поле не кладём: строка из него всё равно не показывается, а в
          // файле графа пустышка только мешает сравнению.
          ...(product.industry?.trim()
            ? { industry: product.industry.trim() }
            : {}),
          ...(product.mainPurpose?.trim()
            ? { mainPurpose: product.mainPurpose.trim() }
            : {}),
          chainRootNodeId: rootNodeId,
          chainDirection: direction,
          stepChainSessionKey: sessionKey,
          stepChainStepNumber: stepNumber,
          // Справочник опознал вещество — закрепляем за узлом сразу. Иначе
          // построенный по шагам граф остался бы без идентификаторов, и при
          // объединении с другим сходился бы только по названиям.
          ...(product.productId
            ? {
                productId: product.productId,
                productIdSource: "dictionary" as const,
              }
            : {}),
          // Ручной продукт из превью шага: пока описание пустое, узел
          // помечается «не заполнен» (см. ProductNode).
          ...(product.isUserAdded ? { isUserAdded: true } : {}),
        },
      };
      (isFar ? nodes : nearNodes).push(node);
      newProductNodeIds.push(pFlowId);
      if (!isFar) sideProductNodeIds.push(pFlowId);
      link(pFlowId);
    }
  });

  // --- 7) развод коллизий ---
  // Преобразование и дальний ряд сдвигаются вместе, если место занято
  // настоящими узлами (заготовки альтернатив не в счёт — см. шаг 4).
  const dx = computeShiftX(nodes, [...obstacles, ...nearNodes]);
  if (dx !== 0) {
    for (const n of nodes) {
      n.position = { x: n.position.x + dx, y: n.position.y };
    }
  }
  nodes.push(...nearNodes);

  // Хэндлы по смыслу и по итоговым позициям (после развода коллизий).
  const placed = [
    ...existingNodes.filter((n) => !nodes.some((m) => m.id === n.id)),
    ...nodes,
  ];
  const handled = applyHandlesByGeometry(placed, edges);
  edges.splice(0, edges.length, ...handled);

  const stepRecord: StepRecord = {
    stepNumber,
    fromProductNodeId: anchorNodeId,
    transformationNodeId: trFlowId,
    newProductNodeIds,
    mergedProductNodeIds,
    ...(sideProductNodeIds.length ? { sideProductNodeIds } : {}),
    addedEdgeIds,
    cycleProductNames,
    isDeadEnd: false,
    ...(reusedTrNode ? { transformationReused: true } : {}),
  };

  return { nodes, edges, stepRecord };
}

/**
 * Заготовка альтернативы продукта: alt-узел из обобщения, ещё не построенный
 * шаг. Стоит, где легло бы продолжение, поэтому шагу места не загораживает.
 */
export function isStepPlaceholder(n: CustomNode, productNodeId: string): boolean {
  return (
    n.type === "transformation" &&
    n.data?.chainVariant === "alt" &&
    n.data?.chainRootNodeId === productNodeId
  );
}

/**
 * Куда отодвинуть заготовки альтернатив продукта, на которые лёг новый шаг:
 * стоявшие левее середины шага — дальше влево, правее — дальше вправо, до
 * первого свободного места. Возвращает только сдвинутые.
 */
export function nudgeStepPlaceholders(
  newNodes: CustomNode[],
  allNodes: CustomNode[],
  productNodeId: string,
  spacingX = 260,
): Array<{ id: string; position: { x: number; y: number } }> {
  if (!newNodes.length) return [];
  const newIds = new Set(newNodes.map((n) => n.id));
  const placeholders = allNodes.filter(
    (n) => !newIds.has(n.id) && isStepPlaceholder(n, productNodeId),
  );
  if (!placeholders.length) return [];
  const centerX =
    newNodes.reduce((sum, n) => sum + n.position.x, 0) / newNodes.length;
  const holderIds = new Set(placeholders.map((n) => n.id));
  const solid = [
    ...allNodes.filter((n) => !holderIds.has(n.id) && !newIds.has(n.id)),
    ...newNodes,
  ];
  const moved: Array<{ id: string; position: { x: number; y: number } }> = [];
  // Ближние к шагу — первыми: дальние потом обходят уже отодвинутых.
  const byDistance = [...placeholders].sort(
    (a, b) => Math.abs(a.position.x - centerX) - Math.abs(b.position.x - centerX),
  );
  for (const p of byDistance) {
    // Не задевает новый шаг — остаётся где стоит (даже если стояла тесно
    // и раньше: это не наша забота).
    if (!overlapsAny(p.position, newNodes)) {
      solid.push(p);
      continue;
    }
    const dir = p.position.x < centerX ? -1 : 1;
    const position = pushAsideX(p.position, solid, dir, spacingX);
    moved.push({ id: p.id, position });
    solid.push({ ...p, position });
  }
  return moved;
}
