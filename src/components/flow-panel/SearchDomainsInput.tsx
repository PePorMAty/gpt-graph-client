import { useMemo, type FC } from "react";
import styles from "./FlowPanel.module.css";
import {
  MAX_SEARCH_DOMAINS,
  parseDomainsInput,
} from "../../utils/parseDomains";

const WIKIPEDIA_PRESET = "ru.wikipedia.org, en.wikipedia.org";

/**
 * Ограничение доменов поиска источников (задача 3.3): текст «домены через
 * запятую» уходит в web_search как filters.allowed_domains. Контролируемый —
 * стейт держит родитель (DirectionContent / StepByStepContent).
 */
export const SearchDomainsInput: FC<{
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
}> = ({ value, onChange, open, onToggle }) => {
  const parsed = useMemo(() => parseDomainsInput(value), [value]);
  const hasText = value.trim() !== "";

  return (
    <div className={styles.addSourceBox}>
      <button type="button" className={styles.promptToggle} onClick={onToggle}>
        {open
          ? "Скрыть ограничение доменов"
          : `🌐 Ограничить домены поиска${parsed.length ? ` (${parsed.length})` : ""}`}
      </button>

      {open && (
        <div className={styles.addSourceForm}>
          <input
            type="text"
            className={styles.addSourceInput}
            placeholder="wikipedia.org, sciencedirect.com"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className={styles.searchDomainsHint}>
            Домены через запятую, до {MAX_SEARCH_DOMAINS}; пусто — искать везде.
            {hasText &&
              (parsed.length
                ? ` Будет передано: ${parsed.join(", ")}`
                : " Ни одного валидного домена — ограничение не применится.")}
          </div>
          <div className={styles.searchDomainsPresets}>
            <button
              type="button"
              className={styles.promptToggle}
              onClick={() => onChange(WIKIPEDIA_PRESET)}
            >
              Пресет: Wikipedia
            </button>
            {hasText && (
              <button
                type="button"
                className={styles.promptToggle}
                onClick={() => onChange("")}
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
