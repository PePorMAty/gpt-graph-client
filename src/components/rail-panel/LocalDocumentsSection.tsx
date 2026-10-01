import { useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { deleteLocalDocument, type LocalDocument } from "../../store/api/local-sources-api";
import {
  clearFinishedUploads,
  invalidateLocalSources,
  type UploadJob,
} from "../../store/slices/localSourcesSlice";
import { useAiConfig } from "../../hooks/useAiConfig";
import { plural } from "../../utils/plural";
import { SearchIcon, UploadIcon } from "../icons";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import { DetailsToggle } from "./DetailsToggle";
import { LocalDocumentRow } from "./LocalDocumentRow";
import type { PanelDetailsSlot } from "./usePanelDetails";
import industry from "../industry/Industry.module.css";
import panel from "./PanelSection.module.css";
import detailsCss from "./PanelDetails.module.css";
import styles from "./LocalDocuments.module.css";

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

interface Props {
  /** null — ещё не получены. */
  docs: LocalDocument[] | null;
  error: string | null;
  /** Над вкладкой держат файл — подсветить рамку. */
  dragging: boolean;
  onAddFiles: (files: FileList | null) => void;
  onDeleted: (id: number) => void;
  /** Документ поставлен в разбор — обновить список. */
  onChanged: () => void;
  /** Сводка вкладки: чипы и «Продукты / Документы» — по кнопке у поиска. */
  details: PanelDetailsSlot;
}

/**
 * «База источников» → «Документы»: документы заказчика на сервере.
 *
 * Документ — не источник сам по себе: сервер делит его на разделы (по
 * закладкам или содержанию), модель разбирает каждый — что производят, из
 * какого сырья, — и раздел становится источником для этих продуктов в любом
 * графе. Здесь — загрузка, ход разбора, разделы с их веществами и удаление.
 */
export const LocalDocumentsSection = ({
  docs,
  error: loadError,
  dragging,
  onAddFiles,
  onDeleted,
  onChanged,
  details,
}: Props) => {
  const dispatch = useAppDispatch();
  const uploads = useAppSelector((s) => s.localSources.uploads);
  const { config: aiConfig } = useAiConfig();

  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const list = docs ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q),
    );
  }, [docs, query]);

  const paged = usePaged(filtered);

  const remove = async (id: number) => {
    try {
      await deleteLocalDocument(id);
      onDeleted(id);
      dispatch(invalidateLocalSources());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const total = docs?.length ?? 0;
  const active = uploads.filter(isActive).length;
  const finished = uploads.length - active;
  const shownError = error ?? loadError;

  return (
    <div className={styles.docsView}>
      {/* Строка поиска с кнопкой сводки — как у продуктов: обратно к ним
          ведёт переключатель в сводке. Поиска нет, пока нет документов. */}
      <div className={detailsCss.searchRow}>
        {total > 0 ? (
          <label className={industry.search}>
            <SearchIcon size={14} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по документам…"
            />
          </label>
        ) : (
          <span className={detailsCss.spacer} />
        )}
        <DetailsToggle open={details.open} onToggle={details.toggle} />
      </div>
      {details.open && <div className={detailsCss.details}>{details.content}</div>}

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
          {details.open && (
            <span className={styles.hint}>
              PDF с текстом, до 100 МБ, можно несколько сразу. Документ делится
              на разделы по содержанию, и модель разбирает каждый: что
              производят и из какого сырья
              {aiConfig.model ? ` (модель ${aiConfig.model})` : ""}. Сканы без
              текстового слоя не распознаются.
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              onAddFiles(e.target.files);
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

        {shownError && <div className={styles.error}>{shownError}</div>}

        {docs === null ? (
          !shownError && <div className={panel.empty}>Загружаем список…</div>
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
              <LocalDocumentRow key={doc.id} doc={doc} onDelete={remove} onChanged={onChanged} />
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
    </div>
  );
};
