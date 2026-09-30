import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  deleteLocalDocument,
  listLocalDocuments,
  localDocumentHref,
  type LocalDocument,
} from "../../store/api/local-sources-api";
import {
  clearFinishedUploads,
  invalidateLocalSources,
  uploadLocalDocuments,
  type UploadJob,
} from "../../store/slices/localSourcesSlice";
import { plural } from "../../utils/plural";
import { FilePdfIcon, SearchIcon, TrashIcon, UploadIcon } from "../icons";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import panel from "./PanelSection.module.css";
import styles from "./LocalDocuments.module.css";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  const mb = n / 1024 / 1024;
  return `${mb.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

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
          {`«${job.document.title}» · ${job.document.pages} стр.`}
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

const DocRow = ({
  doc,
  onDelete,
}: {
  doc: LocalDocument;
  onDelete: (id: number) => Promise<void>;
}) => {
  // Удаление — в два нажатия: документ пропадёт у всех графов сразу.
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const meta = [
    // Название берём из свойств PDF; имя файла — чтобы узнать документ.
    doc.title !== doc.fileName.replace(/\.pdf$/i, "") ? doc.fileName : null,
    `${doc.pages} стр.`,
    formatBytes(doc.bytes),
    formatDate(doc.addedAt),
    doc.addedVia === "script" ? "скриптом" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const remove = async () => {
    setBusy(true);
    try {
      await onDelete(doc.id);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <li className={styles.doc}>
      <FilePdfIcon size={18} className={styles.docIcon} />
      <div className={styles.docMain}>
        <a
          className={styles.docTitle}
          href={localDocumentHref(doc.id)}
          target="_blank"
          rel="noreferrer"
          title="Открыть PDF"
        >
          {doc.title}
        </a>
        <span className={styles.docMeta}>{meta}</span>
        {doc.textlessPages > 0 && (
          <span className={styles.docWarn}>
            {doc.textlessPages} стр. без текста (сканы, рисунки) — в поиск не
            попали
          </span>
        )}
      </div>
      <div className={styles.docActions}>
        {confirm ? (
          <>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={remove}
              disabled={busy}
            >
              Удалить
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setConfirm(false)}
              disabled={busy}
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${panel.rowBtn} ${panel.rowBtnDanger}`}
            onClick={() => setConfirm(true)}
            title="Удалить документ из базы"
            aria-label="Удалить документ из базы"
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </li>
  );
};

/**
 * Вкладка «PDF на сервере» раздела «База данных»: документы заказчика в
 * локальной базе источников.
 *
 * Загруженный PDF становится источником для всех продуктов, которые в нём
 * упоминаются, — в любом графе: сервер сам находит его по названиям продукта
 * из справочника. Загрузить можно здесь (кнопкой или перетаскиванием) или
 * скриптом на сервере; удаляется документ отсюда.
 */
export const LocalDocumentsSection = () => {
  const dispatch = useAppDispatch();
  const version = useAppSelector((s) => s.localSources.version);
  const uploads = useAppSelector((s) => s.localSources.uploads);

  const [docs, setDocs] = useState<LocalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Список — при открытии и после каждого изменения базы (загрузили,
  // удалили — в том числе из другой вкладки этого окна).
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
  }, [version]);

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
  const totalPages = (docs ?? []).reduce((s, d) => s + d.pages, 0);
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
        <FilePdfIcon size={20} className={panel.summaryIcon} />
        <span className={panel.summaryValue}>{total}</span>
        <span className={panel.summaryLabel}>
          {plural(total, "документ", "документа", "документов")} на сервере
          {totalPages > 0 && ` · ${totalPages} стр.`}
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
            PDF с текстом, до 100 МБ, можно несколько сразу. Сканы без текстового
            слоя не распознаются.
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
            PDF пока нет. Загруженный документ станет источником для каждого
            продукта, который в нём упоминается, — в окне построения шага он
            встанет первым.
          </div>
        ) : filtered.length === 0 ? (
          <div className={panel.empty}>Ничего не найдено.</div>
        ) : (
          <ul className={styles.docs}>
            {paged.slice.map((doc) => (
              <DocRow key={doc.id} doc={doc} onDelete={remove} />
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
