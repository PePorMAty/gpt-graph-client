import { useState, type FC } from "react";
import styles from "./FlowPanel.module.css";

/**
 * Ручное добавление источника (задача 3.2). Показывается и ДО поиска источников
 * (пустой список), и ПОСЛЕ (под списком). onAdd возвращает текст ошибки
 * (невалидный url / дубль) или null при успехе.
 */
export const AddSourceForm: FC<{
  onAdd?: (src: {
    title: string;
    url: string;
    description?: string;
  }) => string | null;
}> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedFlash, setAddedFlash] = useState(false);

  if (!onAdd) return null;

  const handleAdd = () => {
    const err = onAdd({
      title,
      url,
      description: description.trim() ? description : undefined,
    });
    setError(err);
    if (!err) {
      setTitle("");
      setUrl("");
      setDescription("");
      setAddedFlash(true);
      setTimeout(() => setAddedFlash(false), 2000);
    }
  };

  return (
    <div className={styles.addSourceBox}>
      <button
        type="button"
        className={styles.promptToggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Скрыть добавление источника" : "➕ Добавить источник вручную"}
      </button>

      {open && (
        <div className={styles.addSourceForm}>
          <input
            type="text"
            className={styles.addSourceInput}
            placeholder="Название источника"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            className={styles.addSourceInput}
            placeholder="https://…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
          <textarea
            className={styles.addSourceTextarea}
            placeholder="Краткое описание технологии (необязательно)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error && <div className={styles.errorText}>{error}</div>}
          {addedFlash && (
            <div className={styles.addSourceSuccess}>Источник добавлен ✓</div>
          )}
          <button
            type="button"
            className={styles.findSourcesButton}
            onClick={handleAdd}
            disabled={!url.trim()}
          >
            Добавить источник
          </button>
        </div>
      )}
    </div>
  );
};
