import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  deleteLocalDocument,
  listLocalDocuments,
  type LocalDocument,
} from "../../store/api/local-sources-api";
import {
  clearFinishedUploads,
  invalidateLocalSources,
  uploadLocalDocuments,
  watchDecoding,
  type UploadJob,
} from "../../store/slices/localSourcesSlice";
import { useAiConfig } from "../../hooks/useAiConfig";
import { plural } from "../../utils/plural";
import { DatabaseIcon, SearchIcon, UploadIcon } from "../icons";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import { LocalDocumentRow } from "./LocalDocumentRow";
import panel from "./PanelSection.module.css";
import styles from "./LocalDocuments.module.css";

/** Как часто обновлять список, пока модель разбирает разделы. */
const POLL_MS = 4000;

function isActive(job: UploadJob): boolean {
  return job.state === "waiting" || job.state === "uploading";
}

/** Что показать справа в строке очереди. */
function jobStateText(job: UploadJob): string {
  switch (job.state) {
    case "waiting":
      return "в очереди";
    case "uploading":
      // Файл ушёл целиком, а ответа нет: сервер достаёт текст — на толстом
      // PDF это секунды. «100 %» здесь читалось бы как зависание.
      return job.progress < 1 ? `${Math.round(job.progress * 100)} %` : "читаем текст…";
    case "done":
      return "добавлен";
    case "duplicate":
      return "уже в базе";
    case "error":
      return "не добавлен";
  }
}

const JobRow = ({ job }: { job: UploadJob }) => {
  const stateClass =
    job.state === "done" ? styles.jobOk : job.state === "error" ? styles.jobError : "";
  return (
    <li className={styles.job}>
      <div className={styles.jobHead}>
        <span className={styles.jobName} title={job.fileName}>
          {job.fileName}
        </span>
        <span className={`${styles.jobState} ${stateClass}`}>{jobStateText(job)}</span>
      </div>

      {job.state === "uploading" && (
        <div className={styles.bar}>
          <div
            className={styles.barFill}
            style={{ width: `${Math.round(job.progress * 100)}%` }}
          />
        </div>
      )}

      {job.error && (
        <div className={`${styles.jobNote} ${styles.jobNoteError}`}>{job.error}</div>
      )}
      {job.document && (
        <div className={styles.jobNote}>
          {job.state === "duplicate" && "Этот файл уже загружен: "}
          {`«${job.document.title}» · ${job.document.pages} стр. · ${job.document.sections?.total ?? 0} ${plural(job.document.sections?.total ?? 0, "раздел", "раздела", "разделов")}`}
        </div>
      )}
      {job.warnings.map((w) => (
        <div key={w} className={`${styles.jobNote} ${styles.jobNoteWarn}`}>
          {w}
        </div>
      ))}
    </li>
  );
};

/**
 * Вкладка «База источников» раздела «База данных»: документы заказчика на
 * сервере.
 *
 * Документ — не источник сам по себе: сервер делит его на разделы (по
 * закладкам или содержанию), модель разбирает каждый — что производят, из
 * какого сырья, — и раздел становится источником для этих продуктов в любом
 * графе. Здесь — загрузка (кнопкой, перетаскиванием), ход разбора, разделы с
 * их продуктами и удаление.
 */
export const LocalDocumentsSection = () => {
  const dispatch = useAppDispatch();
  const version = useAppSelector((s) => s.localSources.version);
  const uploads = useAppSelector((s) => s.localSources.uploads);

  const { config: aiConfig } = useAiConfig();

  const [docs, setDocs] = useState<LocalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Список — при открытии и после каждого изменения базы (загрузили,
  // удалили, поставили в разбор — в том числе из другой вкладки окна).
  useEffect(() => {
    let cancelled = false;
    listLocalDocuments()
      .then((list) => {
        if (cancelled) return;
        setDocs(list);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version, reload]);

  // Пока модель разбирает разделы — обновляем ход разбора; значки на узлах
  // обновляет слежение в сторе (оно живёт и при закрытой вкладке).
  const pendingTotal = (docs ?? []).reduce((n, d) => n + (d.sections?.pending ?? 0), 0);
  useEffect(() => {
    if (!pendingTotal) return;
    dispatch(watchDecoding());
    const t = setTimeout(() => setReload((r) => r + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [docs, pendingTotal, dispatch]);

  const filtered = useMemo(() => {
    const list = docs ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q),
    );
  }, [docs, query]);

  const paged = usePaged(filtered);

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) dispatch(uploadLocalDocuments(files));
  };

  const remove = async (id: number) => {
    try {
      await deleteLocalDocument(id);
      setDocs((prev) => prev?.filter((d) => d.id !== id) ?? prev);
      dispatch(invalidateLocalSources());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Бросить файл можно на весь раздел, не только в рамку: промах мимо неё
  // открыл бы PDF вместо приложения.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Переход на вложенный элемент — не уход из раздела.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const total = docs?.length ?? 0;
  const totalSections = (docs ?? []).reduce((n, d) => n + (d.sections?.total ?? 0), 0);
  const active = uploads.filter(isActive).length;
  const finished = uploads.length - active;

  return (
    <div
      className={panel.section}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={panel.summaryCard}>
        <DatabaseIcon size={20} className={panel.summaryIcon} />
        <span className={panel.summaryValue}>{totalSections}</span>
        <span className={panel.summaryLabel}>
          {plural(totalSections, "источник", "источника", "источников")} — разделы{" "}
          {total} {plural(total, "документа", "документов", "документов")}
          {pendingTotal > 0 && ` · в разборе ${pendingTotal}`}
        </span>
      </div>

      <div className={styles.body}>
        <div className={`${styles.drop} ${dragging ? styles.dropActive : ""}`}>
          <span className={styles.dropText}>
            <UploadIcon size={20} className={styles.dropIcon} />
            Перетащите PDF сюда или
          </span>
          <button
            type="button"
            className={styles.pickBtn}
            onClick={() => inputRef.current?.click()}
          >
            Выбрать PDF
          </button>
          <span className={styles.hint}>
            PDF с текстом, до 100 МБ, можно несколько сразу. Документ делится на
            разделы по содержанию, и модель разбирает каждый: что производят и
            из какого сырья
            {aiConfig.model ? ` (модель ${aiConfig.model} — выбранная в приложении)` : ""}.
            Сканы без текстового слоя не распознаются.
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              // Иначе тот же файл второй раз не выбрать: onChange не сработает.
              e.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <div className={styles.queue}>
            <div className={styles.queueHead}>
              <span>
                {active > 0
                  ? `Загрузка: ${finished} из ${uploads.length}`
                  : "Загрузка завершена"}
              </span>
              {finished > 0 && (
                <button
                  type="button"
                  className={panel.footerBtn}
                  onClick={() => dispatch(clearFinishedUploads())}
                >
                  Убрать завершённые
                </button>
              )}
            </div>
            <ul className={styles.jobs}>
              {uploads.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {total > 0 && (
          <div className={panel.search}>
            <SearchIcon size={15} className={panel.searchIcon} />
            <input
              className={panel.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по документам…"
            />
          </div>
        )}

        {docs === null ? (
          !error && <div className={panel.empty}>Загружаем список…</div>
        ) : total === 0 ? (
          <div className={panel.empty}>
            Документов пока нет. Загруженный документ делится на разделы, и
            каждый становится источником для продуктов, которые в нём
            производят или берут сырьём, — в окне построения шага такие
            источники встают первыми.
          </div>
        ) : filtered.length === 0 ? (
          <div className={panel.empty}>Ничего не найдено.</div>
        ) : (
          <ul className={styles.docs}>
            {paged.slice.map((doc) => (
              <LocalDocumentRow
                key={doc.id}
                doc={doc}
                onDelete={remove}
                onChanged={() => {
                  setReload((r) => r + 1);
                  dispatch(watchDecoding());
                }}
              />
            ))}
          </ul>
        )}

        <Pagination
          page={paged.page}
          pages={paged.pages}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onChange={paged.setPage}
          unit="документов"
        />
      </div>

      <div className={panel.footer}>
        <span>
          Много файлов разом удобнее загрузить скриптом на сервере:{" "}
          <code>node scripts/import-pdf.js ~/pdf/</code>
        </span>
      </div>
    </div>
  );
};
