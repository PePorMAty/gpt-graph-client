import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
} from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { plural } from "../../utils/plural";
import { ChevronDownIcon, CloseIcon, PlantIcon, SearchIcon } from "../icons";
import { companyMatches, type CompanyOption } from "./companies";
import styles from "./Industry.module.css";

interface Props {
  options: CompanyOption[];
  /** Ключ выбранной компании; пустая строка — все компании. */
  value: string;
  onChange: (key: string) => void;
  /** Во всю ширину строки отборов — для узкой панели. */
  wide?: boolean;
}

/**
 * Отбор «Компания»: вся продукция одного производителя на графе.
 *
 * Обычным выпадающим списком его не сделать. На большом графе производителей
 * сотни, а названия почти все начинаются с «АО», «ООО» и «ПАО», так что
 * прыжок по первой букве, который умеет обычный список, бесполезен. Поэтому
 * список с поиском — по названию и ИНН.
 */
export const CompanyFilter: FC<Props> = ({ options, value, onChange, wide = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.key === value) ?? null;
  const found = useMemo(
    () => (query.trim() ? options.filter((o) => companyMatches(o, query)) : options),
    [options, query],
  );

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, close, open);

  // Подсвеченная строка не должна уезжать за край списка при ходьбе стрелками.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, found.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = found[active];
      if (option) pick(option.key);
    } else if (e.key === "Escape") {
      // Закрываем только список: иначе Escape долетал бы до документа и
      // заодно закрывал панель, в которой отбор стоит.
      e.nativeEvent.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={`${styles.company} ${wide ? styles.companyWide : ""}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.companyTrigger} ${selected ? styles.companyTriggerOn : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
          // Стрелки идут от выбранной компании, а не от начала списка.
          setActive(Math.max(0, options.findIndex((o) => o.key === value)));
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          selected
            ? (selected.full ?? selected.label)
            : "Показать продукцию одной компании"
        }
      >
        <PlantIcon size={14} />
        <span className={styles.companyValue}>
          {selected ? selected.label : "Компания"}
        </span>
        {!selected && <ChevronDownIcon size={14} />}
      </button>
      {/* Снять отбор — отдельной кнопкой рядом, а не внутри: кнопка в кнопке
          не нажимается. */}
      {selected && (
        <button
          type="button"
          className={styles.companyClear}
          onClick={() => onChange("")}
          aria-label="Снять отбор по компании"
          title="Все компании"
        >
          <CloseIcon size={12} />
        </button>
      )}

      {open && (
        <div className={styles.companyMenu}>
          <label className={styles.companySearch}>
            <SearchIcon size={13} />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Название или ИНН…"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={found[active] ? `${listId}-${active}` : undefined}
              aria-label="Поиск компании"
            />
          </label>
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="Компании"
            className={styles.companyList}
          >
            {found.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.key === value}
                className={`${styles.companyOption} ${
                  i === active ? styles.companyOptionActive : ""
                } ${o.key === value ? styles.companyOptionSelected : ""}`}
                onMouseEnter={() => setActive(i)}
                // Фокус остаётся в поиске: иначе стрелки после щелчка мимо
                // строки переставали бы работать.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.key)}
                title={o.full ?? undefined}
              >
                <span className={styles.companyOptionName}>{o.label}</span>
                <span className={styles.companyOptionCount}>
                  {o.products} {plural(o.products, "продукт", "продукта", "продуктов")}
                </span>
                {(o.inn || o.region) && (
                  <span className={styles.companyOptionMeta}>
                    {[o.inn && `ИНН ${o.inn}`, o.region].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))}
            {!found.length && (
              <li className={styles.companyEmpty}>Таких компаний среди производителей нет</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
