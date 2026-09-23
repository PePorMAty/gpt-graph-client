import { useMemo, useState, type FC } from "react";

import {
  KNOWN_SOURCE_NAMES,
  normalizeSourceUrl,
} from "../../utils/sourceUrl";
import { PlusIcon } from "../icons";
import styles from "./FlowPanel.module.css";

/**
 * Ручное добавление источника.
 *
 * Поле принимает не только готовый адрес: «wikipedia», «ГОСТ» или «xumuk.ru»
 * тоже работают — схему и www дописываем сами. Раньше форма отвечала на такой
 * ввод «ссылка должна начинаться с http://», хотя понять человека было нетрудно.
 *
 * Что получится, видно до нажатия кнопки: под полем стоит готовый адрес. Он же
 * подставляет название, если своё не написали.
 *
 * onAdd возвращает текст ошибки или null при успехе.
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
  const [input, setInput] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedFlash, setAddedFlash] = useState(false);

  // Разбираем ввод на каждый символ: предпросмотр должен идти за набором.
  const parsed = useMemo(() => normalizeSourceUrl(input), [input]);

  if (!onAdd) return null;

  const handleAdd = () => {
    if (!parsed.url) {
      setError(parsed.error ?? "Укажите ссылку или название сайта");
      return;
    }
    const err = onAdd({
      title: title.trim() || parsed.title || parsed.url,
      url: parsed.url,
      description: description.trim() ? description : undefined,
    });
    setError(err);
    if (!err) {
      setTitle("");
      setInput("");
      setDescription("");
      setAddedFlash(true);
      setTimeout(() => setAddedFlash(false), 2000);
    }
  };

  return (
    <div className={styles.addSourceBox}>
      {/* Плюс — иконкой из набора, а не эмодзи «➕»: то рисовалось шрифтом
          системы, выпадало из штриховой графики остального окна и на части
          машин выходило цветным. */}
      <button
        type="button"
        className={styles.addSourceToggle}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`${styles.addSourcePlus} ${open ? styles.addSourcePlusOpen : ""}`}>
          <PlusIcon size={15} />
        </span>
        {open ? "Скрыть добавление источника" : "Добавить источник вручную"}
      </button>

      {open && (
        <div className={styles.addSourceForm}>
          <input
            type="text"
            className={styles.addSourceInput}
            placeholder="Ссылка или название сайта — например, wikipedia"
            list="known-sources"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <datalist id="known-sources">
            {KNOWN_SOURCE_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {/* Что уйдёт в список — видно до нажатия кнопки. */}
          {input.trim() &&
            (parsed.url ? (
              <div className={styles.addSourceHint}>→ {parsed.url}</div>
            ) : (
              <div className={styles.errorText}>{parsed.error}</div>
            ))}

          <input
            type="text"
            className={styles.addSourceInput}
            placeholder={
              parsed.title
                ? `Название (по умолчанию «${parsed.title}»)`
                : "Название источника (необязательно)"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            disabled={!parsed.url}
          >
            Добавить источник
          </button>
        </div>
      )}
    </div>
  );
};
