import { useEffect, useRef, type ChangeEvent } from "react";

import styles from "./NodeCard.module.css";

interface CardTitleFieldProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  readOnly?: boolean;
}

/**
 * Название узла в шапке карточки.
 *
 * Именно textarea, а не input: названия продуктов и технологий бывают в
 * несколько слов и в одну строку не помещаются — обрезать их многоточием
 * нельзя, они тут главное. Высота подгоняется под содержимое, перевод строки
 * пользователем запрещён (Enter просто снимает фокус).
 */
export const CardTitleField = ({
  value,
  onChange,
  onBlur,
  readOnly = false,
}: CardTitleFieldProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={styles.titleInput}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      rows={1}
      spellCheck={false}
      placeholder="Название узла"
      readOnly={readOnly}
      title="Название узла — можно править прямо здесь"
    />
  );
};
