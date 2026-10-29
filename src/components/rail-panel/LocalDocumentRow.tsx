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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

/**
 * Пометка у раздела — только когда с ним не всё готово: разобранный
 * раздел ничем не помечен, это обычное состояние.
 */
const STATUS: Partial<Record<LocalSection["status"], { mark: string; title: string }>> = {
  failed: { mark: "✕", title: "Раздел не разобран — «Разобрать заново» в документе" },
  pending: { mark: "…", title: "Ждёт разбора" },
  working: { mark: "…", title: "Разбирается" },
};

/** Список названий без простыни: первые, и «ещё N». */
function shortList(items: string[], max = 8): string {
  return items.length > max
    ? `${items.slice(0, max).join(", ")} и ещё ${items.length - max}`
    : items.join(", ");
}

/**
 * Вещества раздела строками. Первые три — то, по чему раздел находят
 * продукты: получаемое — «вверх», сырьё — «вниз». Остальное — в описании.
 */
const MAIN_ROLES: Array<[keyof LocalSection["products"], string]> = [
  ["products", "Получают"],
  ["byproducts", "Попутно"],
  ["raw", "Сырьё"],
];
const MORE_ROLES: Array<[keyof LocalSection["products"], string]> = [
  ["intermediates", "Промежуточные"],
  ["auxiliaries", "Вспомогательное"],
  ["wastes", "Отходы и выбросы"],
];

const RoleLine = ({ label, names }: { label: string; names: string[] }) =>
  names.length ? (
    <div className={styles.secProducts}>
      <span className={styles.secRole}>{label}:</span> {shortList(names)}
    </div>
  ) : null;

const SectionRow = ({ s, docId }: { s: LocalSection; docId: number }) => {
  const more = MORE_ROLES.filter(([key]) => s.products[key]?.length);
  return (
    <li className={styles.sec}>
      <div className={styles.secHead}>
        {STATUS[s.status] && (
          <span
            className={`${styles.secStatus} ${styles[`sec_${s.status}`] ?? ""}`}
            title={STATUS[s.status]?.title}
          >
            {STATUS[s.status]?.mark}
          </span>
        )}
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
      {MAIN_ROLES.map(([key, label]) => (
        <RoleLine key={key} label={label} names={s.products[key] ?? []} />
      ))}
      {s.error && <div className={styles.secError}>{s.error}</div>}
      {(s.summary || more.length > 0) && (
        <details className={styles.secSummary}>
          <summary>{s.summary ? "Описание раздела" : "Ещё вещества раздела"}</summary>
          {s.summary && <p>{s.summary}</p>}
          {more.map(([key, label]) => (
            <RoleLine key={key} label={label} names={s.products[key] ?? []} />
          ))}
        </details>
      )}
    </li>
  );
};

/**
 * Ход разбора: пока идёт — «разбирается» с полосой, без счёта; готово —
 * ничего, это обычное состояние; есть ошибки — сколько разделов не
 * разобрано и «Разобрать заново». Какой моделью и «столько-то из стольки»
 * в документе не пишем: это служебное, к содержанию отношения не имеет.
 */
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
          Документ разбирается
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
  if (!failed) return null;
  return (
    <div className={styles.decode}>
      <span className={styles.decodeWarn}>
        Не разобрано: {failed} {plural(failed, "раздел", "раздела", "разделов")}
      </span>
      <button
        type="button"
        className={styles.linkBtn}
        onClick={() => onRedecode("failed")}
        disabled={busy}
      >
        Разобрать {failed === 1 ? "его" : "их"} заново
      </button>
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

  const meta = [`${doc.pages} стр.`, formatDate(doc.addedAt)].filter(Boolean).join(" · ");

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
        {/* Два издания одного справочника: источниками идут разделы нового,
            а одинаковые разделы двух изданий модель считала бы двумя
            подтверждениями. Старое можно удалить. */}
        {doc.supersededBy && (
          <span className={styles.docWarn}>
            Не используется: есть издание новее — {doc.supersededBy.title}. Этот документ
            можно удалить.
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
            {total}{" "}
            {plural(total, "раздел-источник", "раздела-источника", "разделов-источников")}
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
                  title="Разобрать все разделы заново — если разбор неудачный"
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
