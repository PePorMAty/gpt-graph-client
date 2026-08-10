import { useMemo, type FC } from "react";
import styles from "./FlowPanel.module.css";
import { AiModelSelect } from "../ai-model-select";
import {
  MAX_SEARCH_DOMAINS,
  parseDomainsInput,
} from "../../utils/parseDomains";

const WIKIPEDIA_PRESET = "ru.wikipedia.org, en.wikipedia.org";

/**
 * Редактор настроек поиска источников: промпт + белый список доменов (3.3).
 * Домены живут ВНУТРИ редактора промпта (одна надпись-тумблер вместо двух);
 * при свёрнутом редакторе активный белый список показывается пометкой, чтобы
 * ограничение не было невидимым. Стейт держит родитель — он общий для всех
 * стадий потока, поэтому «Найти источники заново» шлёт то же, что настроено.
 */
export const SearchPromptEditor: FC<{
  open: boolean;
  onToggle: () => void;
  prompt: string;
  onChangePrompt: (value: string) => void;
  isDirty: boolean;
  onResetPrompt: () => void;
  isEmpty: boolean;
  domainsText: string;
  onChangeDomains: (value: string) => void;
}> = ({
  open,
  onToggle,
  prompt,
  onChangePrompt,
  isDirty,
  onResetPrompt,
  isEmpty,
  domainsText,
  onChangeDomains,
}) => {
  const parsed = useMemo(() => parseDomainsInput(domainsText), [domainsText]);
  const hasDomainsText = domainsText.trim() !== "";

  return (
    <div className={styles.addSourceBox}>
      <button type="button" className={styles.promptToggle} onClick={onToggle}>
        {open ? "Скрыть промпт поиска" : "Редактировать промпт поиска"}
      </button>

      {!open && parsed.length > 0 && (
        <div className={styles.domainsActiveNote}>
          🌐 Поиск только на: {parsed.join(", ")}
        </div>
      )}

      {open && (
        <div className={styles.promptEditor}>
          {/* Модель поиска: непригодных для поиска в списке нет. */}
          <AiModelSelect stage="search" />
          {/* Белый список доменов web_search (3.3) */}
          <label className={styles.promptLabel}>
            Искать ТОЛЬКО на этих доменах:
          </label>
          <input
            type="text"
            className={`${styles.addSourceInput} ${styles.domainsInput}`}
            placeholder="wikipedia.org, sciencedirect.com"
            value={domainsText}
            onChange={(e) => onChangeDomains(e.target.value)}
          />
          <div className={styles.searchDomainsHint}>
            Домены через запятую, до {MAX_SEARCH_DOMAINS}. Поиск пойдёт только
            по ним; пусто — искать по всему интернету.
            {hasDomainsText &&
              (parsed.length
                ? ` Поиск будет только на: ${parsed.join(", ")}`
                : " Ни одного валидного домена — ограничение не применится.")}
          </div>
          <div className={styles.searchDomainsPresets}>
            <button
              type="button"
              className={styles.promptToggle}
              onClick={() => onChangeDomains(WIKIPEDIA_PRESET)}
            >
              Пресет: Wikipedia
            </button>
            {hasDomainsText && (
              <button
                type="button"
                className={styles.promptToggle}
                onClick={() => onChangeDomains("")}
              >
                Очистить
              </button>
            )}
          </div>

          <label className={styles.promptLabel}>
            Промпт поиска источников:
          </label>
          <textarea
            value={prompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            className={styles.promptTextarea}
            rows={12}
          />
          {isDirty && (
            <button
              type="button"
              className={styles.promptResetBtn}
              onClick={onResetPrompt}
            >
              Сбросить промпт
            </button>
          )}
          {isEmpty && (
            <div className={styles.errorText}>Промпт не может быть пустым</div>
          )}
        </div>
      )}
    </div>
  );
};
