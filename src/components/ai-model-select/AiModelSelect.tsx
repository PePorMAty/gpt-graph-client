import type { FC } from "react";
import {
  AI_MODELS,
  AI_PROVIDERS,
  isSearchCapable,
  useAiConfig,
} from "../../hooks/useAiConfig";
import styles from "./AiModelSelect.module.css";

type Props = {
  /** Подпись над селектами; пусто — без подписи. */
  label?: string;
  /** Показать предупреждение, если модель непригодна для поиска источников. */
  warnIfNoSearch?: boolean;
};

/**
 * Выбор провайдера и модели. Состояние общее для всего приложения
 * (src/hooks/useAiConfig), поэтому селект можно ставить в любую панель —
 * выбор сразу действует на все запросы к LLM.
 */
export const AiModelSelect: FC<Props> = ({
  label = "Модель для запросов:",
  warnIfNoSearch = false,
}) => {
  const { config, setProvider, setModel } = useAiConfig();
  const models = AI_MODELS[config.provider] ?? [];
  const hint = models.find((m) => m.value === config.model)?.hint;
  const showWarning = warnIfNoSearch && !isSearchCapable(config);

  return (
    <div className={styles.block}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.row}>
        <select
          value={config.provider}
          onChange={(e) => setProvider(e.target.value)}
          className={styles.select}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={config.model}
          onChange={(e) => setModel(e.target.value)}
          className={styles.select}
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {showWarning && (
        <div className={styles.warning}>
          Эта модель не ищет источники — на поиске будет подставлена другая.
        </div>
      )}
    </div>
  );
};
