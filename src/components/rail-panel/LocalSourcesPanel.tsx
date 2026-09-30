import { useEffect, useMemo, useState, type DragEvent } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  listLocalDocuments,
  listLocalProducts,
  type LocalDocument,
  type LocalProduct,
} from "../../store/api/local-sources-api";
import { uploadLocalDocuments, watchDecoding } from "../../store/slices/localSourcesSlice";
import { plural } from "../../utils/plural";
import { BookIcon, FilePdfIcon, FlaskIcon, LinkIcon } from "../icons";
import industry from "../industry/Industry.module.css";
import { LocalDocumentsSection } from "./LocalDocumentsSection";
import { LocalProductsList } from "./LocalProductsList";
import styles from "./LocalDocuments.module.css";

/** Как часто обновлять, пока модель разбирает разделы. */
const POLL_MS = 4000;

type View = "products" | "documents";

/**
 * Какой вид был открыт: ушли в «Промышленное знание» посреди загрузки и
 * вернулись — снова «Документы», с очередью, а не список продуктов.
 */
let lastView: View = "products";

/**
 * Вкладка «База источников» раздела «База данных».
 *
 * Два вида, как у «Промышленного знания»:
 *   • «Продукты» — вещества из разделов документов, под каждым по щелчку —
 *     его источники вверх и вниз;
 *   • «Документы» — загрузка PDF, ход разбора моделью, разделы, удаление.
 * PDF можно бросить на вкладку в любом виде — откроется «Документы» с
 * очередью загрузки.
 */
export const LocalSourcesPanel = ({ productNames }: { productNames: string[] }) => {
  const dispatch = useAppDispatch();
  const version = useAppSelector((s) => s.localSources.version);

  const [view, setViewState] = useState<View>(() => lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  const [docs, setDocs] = useState<LocalDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [products, setProducts] = useState<LocalProduct[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Документы — при открытии и после каждого изменения базы (загрузили,
  // удалили, поставили в разбор — в том числе из другой вкладки окна).
  useEffect(() => {
    let cancelled = false;
    listLocalDocuments()
      .then((list) => {
        if (cancelled) return;
        setDocs(list);
        setDocsError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setDocsError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version, reload]);

  // Пока модель разбирает разделы — обновляем ход разбора; значки на узлах
  // обновляет слежение в сторе (оно живёт и при закрытой вкладке).
  const decoding = (docs ?? []).reduce((n, d) => n + (d.sections?.pending ?? 0), 0);
  useEffect(() => {
    if (!decoding) return;
    dispatch(watchDecoding());
    const t = setTimeout(() => setReload((r) => r + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [docs, decoding, dispatch]);

  // Продукты — когда база изменилась (в том числе модель разобрала ещё
  // раздел) и когда на графе поменялись продукты: по ним отбор «На графе».
  const progress = (docs ?? [])
    .map((d) => `${d.id}:${d.sections.total}:${d.sections.done}:${d.sections.failed}`)
    .join(",");
  const graphKey = useMemo(
    () => [...new Set(productNames.map((n) => n.trim()).filter(Boolean))].sort().join("\u0001"),
    [productNames],
  );
  const loadedDocs = docs !== null;
  useEffect(() => {
    if (!loadedDocs) return;
    let cancelled = false;
    // Граф правят подряд — не спрашиваем сервер на каждое переименование.
    const t = setTimeout(() => {
      listLocalProducts(graphKey ? graphKey.split("\u0001") : [])
        .then(({ products: list, hidden: h }) => {
          if (cancelled) return;
          setProducts(list);
          setHidden(h.intermediates);
          setProductsError(null);
        })
        .catch((e: Error) => {
          if (!cancelled) setProductsError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [loadedDocs, progress, graphKey, version]);

  // Бросить файл можно на всю вкладку: промах мимо рамки открыл бы PDF
  // вместо приложения.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Переход на вложенный элемент — не уход из вкладки.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    dispatch(uploadLocalDocuments(files));
    setView("documents");
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const docCount = docs?.length ?? 0;
  const sections = (docs ?? []).reduce((n, d) => n + (d.sections?.total ?? 0), 0);
  const web = (products ?? []).reduce((n, p) => n + p.web.up + p.web.down, 0);
  const productCount = products?.length ?? 0;

  return (
    <div
      className={`${industry.wrap} ${industry.wrapPanel}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={industry.chips}>
        <span className={industry.chip}>
          <FilePdfIcon size={13} />
          {docCount} {plural(docCount, "документ", "документа", "документов")}
        </span>
        <span className={industry.chip}>
          <BookIcon size={13} />
          {sections} {plural(sections, "раздел", "раздела", "разделов")}
          {decoding > 0 && ` · в разборе ${decoding}`}
        </span>
        <span className={industry.chip}>
          <FlaskIcon size={13} />
          {productCount} {plural(productCount, "продукт", "продукта", "продуктов")}
        </span>
        {web > 0 && (
          <span className={industry.chip} title="Источники, которые модель находила в интернете">
            <LinkIcon size={13} />
            {web} из интернета
          </span>
        )}
      </div>

      <div className={`${industry.segmented} ${styles.baseViews}`}>
        {(
          [
            ["products", `Продукты (${productCount})`],
            ["documents", `Документы (${docCount})`],
          ] as Array<[View, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${industry.segment} ${view === value ? industry.segmentActive : ""}`}
            onClick={() => setView(value)}
            aria-pressed={view === value}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "products" ? (
        <LocalProductsList
          products={products}
          hiddenIntermediates={hidden}
          error={productsError ?? docsError}
          version={`${version}:${progress}`}
          documents={docCount}
          decoding={decoding}
          onOpenDocuments={() => setView("documents")}
        />
      ) : (
        <LocalDocumentsSection
          docs={docs}
          error={docsError}
          dragging={dragging}
          onAddFiles={addFiles}
          onDeleted={(id) => setDocs((prev) => prev?.filter((d) => d.id !== id) ?? prev)}
          onChanged={() => {
            setReload((r) => r + 1);
            dispatch(watchDecoding());
          }}
        />
      )}
    </div>
  );
};
