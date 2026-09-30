import { useEffect, useState } from "react";

import {
  listLocalSections,
  localDocumentHref,
  redecodeLocalDocument,
  type LocalDocument,
  type LocalSection,
} from "../../store/api/local-sources-api";
import { plural } from "../../utils/plural";
import { ChevronDownIcon, FilePdfIcon, TrashIcon } from "../icons";
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

/** Как документ разбит на разделы. */
const STRUCTURE: Record<string, string> = {
  outline: "по закладкам",
  links: "по содержанию",
  headings: "по заголовкам",
  pages: "кусками по 10 страниц",
};

const STATUS: Record<LocalSection["status"], { mark: string; title: string }> = {
  done: { mark: "✓", title: "Разобран моделью" },
  failed: { mark: "✕", title: "Модель раздел не разобрала" },
  pending: { mark: "…", title: "Ждёт разбора" },
  working: { mark: "…", title: "Модель разбирает" },
};

/** Список названий без простыни: первые, и «ещё N». */
function shortList(items: string[], max = 8): string {
  return items.length > max
    ? `${items.slice(0, max).join(", ")} и ещё ${items.length - max}`
    : items.join(", ");
}

const SectionRow = ({ s, docId }: { s: LocalSection; docId: number }) => (
  <li className={styles.sec}>
    <div className={styles.secHead}>
      <span
        className={`${styles.secStatus} ${styles[`sec_${s.status}`] ?? ""}`}
        title={STATUS[s.status]?.title}
      >
        {STATUS[s.status]?.mark}
      </span>
      <a
        className={styles.secTitle}
        href={localDocumentHref(docId, s.pageFrom)}
        target="_blank"
        rel="noreferrer"
        title="Открыть документ на этом разделе"
      >
        {s.title}
      </a>
      <span className={styles.secPages}>{s.pages}</span>
    </div>
    {s.products.up.length > 0 && (
      <div className={styles.secProducts}>
        <span className={styles.secRole}>Получают:</span> {shortList(s.products.up)}
      </div>
    )}
    {s.products.down.length > 0 && (
      <div className={styles.secProducts}>
        <span className={styles.secRole}>Сырьё:</span> {shortList(s.products.down)}
      </div>
    )}
    {s.error && <div className={styles.secError}>{s.error}</div>}
    {s.summary && (
      <details className={styles.secSummary}>
        <summary>Описание от модели</summary>
        <p>{s.summary}</p>
      </details>
    )}
  </li>
);

/** Ход разбора разделов моделью. */
const DecodeStatus = ({
  doc,
  busy,
  onRedecode,
}: {
  doc: LocalDocument;
  busy: boolean;
  onRedecode: (only: "failed" | "all") => void;
}) => {
  const { total, done, failed, pending } = doc.sections;
  if (!total) {
    return <span className={styles.docWarn}>Разделов с текстом не нашлось.</span>;
  }
  if (pending > 0) {
    return (
      <div className={styles.decode}>
        <span className={styles.decodeText}>
          <span className={styles.spinner} aria-hidden="true" />
          Модель разбирает разделы: {done} из {total}
          {failed ? `, с ошибкой ${failed}` : ""}
        </span>
        <div className={styles.bar}>
          <div
            className={styles.barFill}
            style={{ width: `${Math.round(((done + failed) / total) * 100)}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className={styles.decode}>
      <span className={failed ? styles.decodeWarn : styles.decodeOk}>
        Разобрано моделью: {done} из {total}
        {failed ? `, с ошибкой ${failed}` : ""}
        {doc.model ? ` · ${doc.model}` : ""}
      </span>
      {failed > 0 && (
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => onRedecode("failed")}
          disabled={busy}
        >
          Разобрать {failed === 1 ? "его" : "их"} заново
        </button>
      )}
    </div>
  );
};

/**
 * Документ базы: название, ход разбора, разделы-источники с продуктами.
 *
 * Разделы — то, что уходит продуктам источниками: «Получают» — для этих
 * продуктов раздел источник «вверх» (из чего их делают), «Сырьё» — «вниз».
 */
export const LocalDocumentRow = ({
  doc,
  onDelete,
  onChanged,
}: {
  doc: LocalDocument;
  onDelete: (id: number) => Promise<void>;
  /** Документ изменился на сервере (поставлен в разбор) — обновить список. */
  onChanged: () => void;
}) => {
  // Удаление — в два нажатия: документ пропадёт у всех графов сразу.
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<LocalSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Разделы — при раскрытии и заново, когда модель разобрала ещё один.
  const progress = `${doc.sections.done}/${doc.sections.failed}/${doc.sections.pending}`;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listLocalSections(doc.id)
      .then((list) => {
        if (!cancelled) setSections(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc.id, progress]);

  const meta = [
    doc.fileName,
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

  const redecode = async (only: "failed" | "all") => {
    setBusy(true);
    setError(null);
    try {
      await redecodeLocalDocument(doc.id, only);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const total = doc.sections.total;

  return (
    <li className={styles.doc}>
      <FilePdfIcon size={18} className={styles.docIcon} />
      <div className={styles.docMain}>
        <a
          className={styles.docTitle}
          href={localDocumentHref(doc.id)}
          target="_blank"
          rel="noreferrer"
          title="Открыть документ"
        >
          {doc.title}
        </a>
        <span className={styles.docMeta}>{meta}</span>
        {doc.textlessPages > 0 && (
          <span className={styles.docWarn}>
            {doc.textlessPages} стр. без текста (сканы, рисунки) — в базу не
            попали
          </span>
        )}
        <DecodeStatus doc={doc} busy={busy} onRedecode={redecode} />
        {error && <span className={styles.docWarn}>{error}</span>}

        {total > 0 && (
          <button
            type="button"
            className={styles.secToggle}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <ChevronDownIcon
              size={14}
              className={`${styles.secChevron} ${open ? styles.secChevronOpen : ""}`}
            />
            {total} {plural(total, "раздел", "раздела", "разделов")}-источников
            {doc.structure ? ` · разбит ${STRUCTURE[doc.structure] ?? ""}` : ""}
          </button>
        )}

        {open &&
          (sections === null ? (
            <span className={styles.docMeta}>Загружаем разделы…</span>
          ) : (
            <>
              <ul className={styles.secList}>
                {sections.map((s) => (
                  <SectionRow key={s.id} s={s} docId={doc.id} />
                ))}
              </ul>
              {doc.sections.pending === 0 && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => redecode("all")}
                  disabled={busy}
                  title="Разобрать все разделы заново — моделью, выбранной сейчас в приложении"
                >
                  Разобрать все разделы заново
                </button>
              )}
            </>
          ))}
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
