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
}

type Mode = "preview" | "edit";

export const MarkdownEditor: FC<MarkdownEditorProps> = ({
  value,
  onChange,
  rows = 8,
  placeholder = "Введите текст (Markdown)",
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

  return (
    <div className={styles.wrapper}>
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

      {mode === "preview" ? (
        <div className={styles.preview} onDoubleClick={() => setMode("edit")}>
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
