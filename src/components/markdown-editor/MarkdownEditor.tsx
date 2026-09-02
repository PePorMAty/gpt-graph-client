import { useEffect, useState, type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./MarkdownEditor.module.css";

interface MarkdownEditorProps {
  value: string;
  /** Вызывается при коммите правки (blur или переключение на «Превью»). */
  onChange?: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Только просмотр: показываем превью без переключателя и правки. */
  readOnly?: boolean;
}

type Mode = "preview" | "edit";

export const MarkdownEditor: FC<MarkdownEditorProps> = ({
  value,
  onChange,
  rows = 8,
  placeholder = "Введите текст (Markdown)",
  readOnly = false,
}) => {
  const [mode, setMode] = useState<Mode>("preview");
  const [localText, setLocalText] = useState(value ?? "");

  // Ресинхронизация при внешнем изменении value (например, переобобщение).
  useEffect(() => {
    setLocalText(value ?? "");
  }, [value]);

  const commit = () => {
    if (localText !== (value ?? "")) {
      onChange?.(localText);
    }
  };

  const switchToPreview = () => {
    commit();
    setMode("preview");
  };

  const hasContent = (value ?? "").trim().length > 0;

  // В режиме просмотра редактор не предлагаем: правка всё равно не сохранится.
  const editable = !readOnly;
  const showEditor = editable && mode === "edit";

  return (
    <div className={styles.wrapper}>
      {editable && (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.tab} ${mode === "preview" ? styles.tabActive : ""}`}
            onClick={switchToPreview}
          >
            Превью
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === "edit" ? styles.tabActive : ""}`}
            onClick={() => setMode("edit")}
          >
            Редактор
          </button>
        </div>
      )}

      {!showEditor ? (
        <div
          className={styles.preview}
          onDoubleClick={editable ? () => setMode("edit") : undefined}
        >
          {hasContent ? (
            <div className={styles.markdownBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <div className={styles.empty}>{placeholder}</div>
          )}
        </div>
      ) : (
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={commit}
          className={styles.textarea}
          placeholder={placeholder}
          rows={rows}
          autoFocus
        />
      )}
    </div>
  );
};
